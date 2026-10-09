/** Real Playwright, scoped to one Agent's independently launched installed Chrome. */
import { randomUUID } from 'node:crypto'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { browserAction, result, type BrowserAction, type Result } from './protocol.ts'
import { queryArguments, pageArguments, locatorArguments, queryPlan, parseArguments, type QueryPlan } from './browser-contract.ts'
import { errorText } from './errors.ts'

type Kind = 'page' | 'frame' | 'locator'
const queries = new Set(['getByRole','getByText','getByLabel','getByPlaceholder','getByAltText','getByTitle','getByTestId','locator','frameLocator'])
function invoke(receiver: unknown, method: string, args: unknown[]): unknown {
  const fn = (receiver as Record<string, unknown>)[method]
  if (typeof fn !== 'function') throw new Error(`Unsupported Playwright method: ${method}`)
  return fn.apply(receiver, args)
}
function safeURL(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Browser URL must be HTTP(S), without credentials')
  return url.href
}
export class PlaywrightBrowser {
  private browser?: Browser
  private starting?: Promise<BrowserContext>
  private closed = false
  private closing?: Promise<void>
  private targets = new Map<string, Page>()
  private ids = new WeakMap<Page, string>()
  // Only tests select headless mode. Agent commands cannot supply launch options or paths.
  constructor(private readonly headless = false) {}
  private adopt(page: Page): string | undefined {
    const existing = this.ids.get(page)
    if (existing) return existing
    if (this.closed || this.targets.size >= 12) { void page.close().catch(() => {}); return }
    const id = randomUUID(); this.ids.set(page, id); this.targets.set(id, page)
    page.once('close', () => this.targets.delete(id))
    page.on('download', download => { void download.cancel().catch(() => {}) })
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}) })
    return id
  }
  private async prepare(): Promise<BrowserContext> {
    if (this.closed) throw new Error('Browser owner was reset; create a new binding')
    if (!this.starting) this.starting = (async () => {
      const { chromium } = await import('playwright-core')
      let browser: Browser
      try {
        browser = await chromium.launch({ channel: 'chrome', headless: this.headless, chromiumSandbox: true, timeout: 20000 })
      } catch (error) {
        throw new Error(`Could not start installed Google Chrome. Install Chrome on the DSH Host machine; the plugin does not download a browser. ${errorText(error)}`)
      }
      this.browser = browser
      if (this.closed) { await browser.close(); throw new Error('Browser creation canceled') }
      browser.once('disconnected', () => { this.closed = true; this.targets.clear() })
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: 'block' })
      if (this.closed) { await browser.close(); throw new Error('Browser creation canceled') }
      context.setDefaultTimeout(10000); context.setDefaultNavigationTimeout(15000)
      // No file:// navigation, local-file upload, raw context/CDP or permissions API is exposed.
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        return ['http:','https:','data:','blob:','about:'].includes(url.protocol) && !url.username && !url.password ? route.continue() : route.abort('blockedbyclient')
      })
      context.on('page', page => { this.adopt(page) })
      return context
    })().catch(async error => { await this.browser?.close().catch(() => {}); this.starting = undefined; throw error })
    return this.starting
  }
  async execute(input: BrowserAction, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (this.closed) throw new Error('Browser owner was reset or Chrome was closed; call cua_repl_reset before creating a new binding')
    const operation = browserAction.parse(input)
    const canceled = Promise.withResolvers<never>()
    const abort = () => { void this.dispose(); canceled.reject(new Error('Browser call canceled or timed out; its Chrome session was closed. Do not replay uncertain input.')) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) abort()
      return await Promise.race([canceled.promise, this.perform(operation, signal)])
    } finally { signal.removeEventListener('abort', abort) }
  }
  private async perform(op: BrowserAction, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (op.action === 'list') return result({ tabs: await Promise.all([...this.targets].map(async ([target,page]) => ({target,url:page.url(),title:await page.title()}))) })
    if (op.action === 'prepare') { await this.prepare(); signal.throwIfAborted(); return result({ browserId: 'chrome', version: this.browser!.version() }) }
    let page: Page, target: string
    if (op.action === 'open') {
      const url = safeURL(op.url)
      if (this.targets.size >= 12) throw new Error('Close a browser target before opening another')
      const context = await this.prepare(); signal.throwIfAborted()
      page = await context.newPage()
      const id = this.adopt(page)
      if (!id) throw new Error('Browser target limit exceeded')
      target = id
      try { await page.goto(url,{waitUntil:'domcontentloaded'}); signal.throwIfAborted() }
      catch (error) { await page.close().catch(() => {}); throw error }
    } else {
      target = op.target
      const selected = this.targets.get(target)
      if (!selected || selected.isClosed()) throw new Error('Browser target is closed or belongs to another session')
      page = selected
    }
    if (op.action === 'close') { await page.close(); return result({closed:target}) }
    if (op.action === 'reveal') { await page.bringToFront(); return result({target}) }
    if (op.action === 'navigate') await page.goto(safeURL(op.url),{waitUntil:'domcontentloaded'})
    if (op.action === 'playwright') return this.runPlaywright(page, op.plan, op.method, op.args, signal)
    const state = {target,title:await page.title(),url:page.url(),snapshot:await this.snapshot(page)}
    const response = result(state)
    if (op.action === 'observe' && op.screenshot) response.content.push(await this.image(await page.screenshot({type:'png',scale:'css'})))
    signal.throwIfAborted()
    return response
  }
  private async snapshot(page: Page): Promise<string> {
    return this.boundedText(await page.locator('body').ariaSnapshot())
  }
  private boundedText(text: string): string { return text.length <= 64000 ? text : text.slice(0,64000)+'\n[Snapshot truncated at 64000 characters]' }
  private image(buffer: Buffer): Result['content'][number] {
    if (buffer.length > 2_500_000) throw new Error('Screenshot exceeds 2.5 MB; use a locator or a smaller clip')
    return {type:'image',mimeType:'image/png',data:buffer.toString('base64')}
  }
  private resolve(page: Page, plan: QueryPlan, budget: {left:number}, depth = 0): { value: unknown; kind: Kind } {
    if (depth > 6) throw new Error('Locator nesting exceeds 6 levels')
    let value: unknown = page, kind: Kind = 'page'
    for (const step of queryPlan.parse(plan)) {
      if (--budget.left < 0) throw new Error('Locator plan exceeds query budget')
      if (!queries.has(step.method) && !(kind === 'locator' && ['filter','and','or','first','last','nth','contentFrame'].includes(step.method)) && !(kind === 'frame' && ['first','last','nth','owner'].includes(step.method))) throw new Error(`Cannot use ${step.method} on ${kind}`)
      const args = parseArguments(queryArguments[step.method], step.args).map(arg => this.decode(page,arg,budget,depth+1))
      value = invoke(value,step.method,args)
      kind = step.method === 'frameLocator' || step.method === 'contentFrame' ? 'frame' : step.method === 'owner' || queries.has(step.method) ? 'locator' : kind
    }
    return { value, kind }
  }
  private decode(page: Page, value: unknown, budget: {left:number}, depth: number): unknown {
    if (Array.isArray(value)) return value.map(item=>this.decode(page,item,budget,depth))
    if (value && typeof value === 'object') {
      const object = value as Record<string,unknown>
      if ('$regex' in object) return new RegExp(object.$regex as string,object.flags as string)
      if ('$locator' in object) {
        const selected = this.resolve(page,queryPlan.parse(object.$locator),budget,depth)
        if (selected.kind !== 'locator') throw new Error('Expected a Locator from the same tab')
        return selected.value
      }
      return Object.fromEntries(Object.entries(object).map(([key,item])=>[key,this.decode(page,item,budget,depth)]))
    }
    return value
  }
  private async runPlaywright(page: Page, plan: QueryPlan, method: string, args: unknown[], signal: AbortSignal): Promise<Result> {
    const budget = {left:128}
    const selected = this.resolve(page,plan,budget)
    const schemas: Record<string, import('zod').ZodType> = selected.kind === 'page' ? pageArguments : selected.kind === 'locator' ? locatorArguments : {}
    if (!Object.hasOwn(schemas,method)) throw new Error(`Unsupported ${selected.kind} method: ${method}`)
    const parsed = parseArguments(schemas[method],args).map(value=>this.decode(page,value,budget,0))
    signal.throwIfAborted()
    let value: unknown
    if (selected.kind === 'page' && method === 'domSnapshot') value = await this.snapshot(page)
    else if (selected.kind === 'page' && method === 'goto') { await page.goto(safeURL(parsed[0] as string),{waitUntil:'domcontentloaded',...(parsed[1] as object)}); value = null }
    else if (selected.kind === 'page' && ['back','forward','reload'].includes(method)) { await invoke(page,method === 'back' ? 'goBack' : method === 'forward' ? 'goForward' : 'reload',parsed); value = null }
    else if (method === 'all') value = (await invoke(selected.value,'all',[]) as unknown[]).length
    else if (method.startsWith('keyboard.') || method.startsWith('mouse.')) {
      const [part,name] = method.split('.'); value = await invoke(part === 'keyboard' ? page.keyboard : page.mouse,name,parsed)
    } else value = await invoke(selected.value,method === 'type' ? 'pressSequentially' : method,parsed)
    signal.throwIfAborted()
    if (method === 'screenshot') return {content:[this.image(value as Buffer)]}
    if (method === 'ariaSnapshot') value = this.boundedText(String(value))
    const json = JSON.stringify(value ?? null)
    if (json.length > 256000) throw new Error('Playwright result exceeds 256 KiB; narrow the locator or read fewer values')
    return result({value:JSON.parse(json)})
  }
  dispose(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.targets.clear()
    this.closing = (async()=>{
      await this.browser?.close().catch(()=>{})
      await this.starting?.catch(()=>{})
      await this.browser?.close().catch(()=>{})
    })()
    return this.closing
  }
}
