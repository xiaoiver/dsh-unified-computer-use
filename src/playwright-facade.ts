/** Serializable locator descriptions, backed by real Playwright objects only in the Host. */
import { queryArguments, pageArguments, locatorArguments, voidMethods, type QueryPlan } from './browser-contract.ts'
import type { BrowserAction, Result } from './protocol.ts'
import type { z } from 'zod'
type Json = z.infer<ReturnType<typeof z.json>>
const references = new WeakMap<object,{target:string;plan:QueryPlan;kind:string}>()
export function createPlaywrightFacade(target: string, call: (operation: BrowserAction)=>Promise<Result>) {
  function encode(value: unknown, depth = 0): Json {
    if (depth > 12) throw new Error('Locator options nesting exceeds 12 levels')
    if (value === undefined) return null
    if (Object.prototype.toString.call(value) === '[object RegExp]') { const regex = value as RegExp; return {$regex:regex.source,flags:regex.flags} }
    if (value && typeof value === 'object') {
      const reference = references.get(value)
      if (reference) {
        if (reference.target !== target || reference.kind !== 'locator') throw new Error('Expected a Locator from this tab')
        return {$locator:reference.plan}
      }
      if (Array.isArray(value)) return value.map(item=>encode(item,depth+1))
      return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,encode(item,depth+1)]))
    }
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    throw new Error('Playwright arguments must be serializable values, RegExp or same-tab locators')
  }
  function args(values: unknown[]): Json[] {
    while (values.at(-1) === undefined && values.length) values.pop()
    return values.map(value=>encode(value))
  }
  async function execute(plan: QueryPlan, method: string, values: unknown[]) {
    const response = await call({action:'playwright',target,plan,method,args:args(values)})
    if (response.isError) throw new Error(response.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'))
    if (method === 'screenshot') {
      const image = response.content.find(c=>c.type==='image')
      if (!image || image.type !== 'image') throw new Error('Browser returned no image')
      return new Uint8Array(Buffer.from(image.data,'base64'))
    }
    return voidMethods.has(method) ? undefined : response.structuredContent?.value
  }
  function wrap(plan: QueryPlan, kind: 'page'|'frame'|'locator'): Record<string, any> {
    const api: Record<string, any> = Object.create(null)
    for (const method of Object.keys(queryArguments)) {
      const query = ['getByRole','getByText','getByLabel','getByPlaceholder','getByAltText','getByTitle','getByTestId','locator','frameLocator'].includes(method)
      if (!query && !(kind === 'locator' && ['filter','and','or','first','last','nth','contentFrame'].includes(method)) && !(kind === 'frame' && ['first','last','nth','owner'].includes(method))) continue
      api[method] = (...values: unknown[]) => {
        const next = [...plan,{method:method as keyof typeof queryArguments,args:args(values)}]
        if (next.length > 24) throw new Error('Locator chain exceeds 24 steps')
        const nextKind = method === 'frameLocator' || method === 'contentFrame' ? 'frame' : method === 'owner' || query ? 'locator' : kind
        return wrap(next,nextKind)
      }
    }
    const methods = kind === 'page' ? pageArguments : kind === 'locator' ? locatorArguments : {}
    for (const method of Object.keys(methods)) {
      if (method === 'all') api.all = async()=>{
        const count = await execute(plan,'all',[]) as number
        if (count > 1000) throw new Error('Too many locator matches; narrow the query')
        return Array.from({length:count},(_,i)=>wrap([...plan,{method:'nth',args:[i]}],'locator'))
      }
      else if (method.includes('.')) {
        const [part,name] = method.split('.'); api[part] ??= Object.create(null)
        api[part][name] = (...values:unknown[])=>execute(plan,method,values)
      } else api[method] = (...values:unknown[])=>execute(plan,method,values)
    }
    if (api.keyboard) Object.freeze(api.keyboard)
    if (api.mouse) Object.freeze(api.mouse)
    references.set(api,{target,plan,kind})
    return Object.freeze(api)
  }
  return wrap([],'page')
}
