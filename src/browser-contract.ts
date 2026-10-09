/** Shared allowlist for the scoped Playwright facade and Host dispatcher. */
import { z } from 'zod'
const str = z.string().max(32768)
const bool = z.boolean()
const num = z.number().finite()
const timeout = z.number().int().min(0).max(120000)
const time = z.object({ timeout: timeout.optional() }).strict()
const text = z.union([str, z.object({ $regex: str, flags: z.string().regex(/^[dgimsuvy]*$/).max(8) }).strict()])
const locatorRef = z.object({ $locator: z.array(z.json()).min(1).max(24) }).strict()
const filter = { has: locatorRef.optional(), hasNot: locatorRef.optional(), hasText: text.optional(), hasNotText: text.optional() }
const tuple = (...items: z.ZodType[]) => z.tuple(items as [z.ZodType, ...z.ZodType[]])
const noArgs = z.tuple([])
export const queryArguments = {
  getByRole: tuple(str, z.object({ name: text.optional(), exact: bool.optional(), checked: bool.optional(), disabled: bool.optional(), expanded: bool.optional(), includeHidden: bool.optional(), level: num.optional(), pressed: bool.optional(), selected: bool.optional() }).strict().optional()),
  getByText: tuple(text, z.object({ exact: bool.optional() }).strict().optional()),
  getByLabel: tuple(text, z.object({ exact: bool.optional() }).strict().optional()),
  getByPlaceholder: tuple(text, z.object({ exact: bool.optional() }).strict().optional()),
  getByAltText: tuple(text, z.object({ exact: bool.optional() }).strict().optional()),
  getByTitle: tuple(text, z.object({ exact: bool.optional() }).strict().optional()),
  getByTestId: tuple(text),
  locator: tuple(str, z.object(filter).strict().optional()),
  frameLocator: tuple(str),
  filter: tuple(z.object({ ...filter, visible: bool.optional() }).strict()),
  and: tuple(locatorRef), or: tuple(locatorRef),
  first: noArgs, last: noArgs, nth: tuple(z.number().int().min(0).max(10000)),
  contentFrame: noArgs, owner: noArgs,
}
const navigation = z.object({ timeout: timeout.optional(), waitUntil: z.enum(['load','domcontentloaded','networkidle','commit']).optional() }).strict()
const mods = z.array(z.enum(['Alt','Control','ControlOrMeta','Meta','Shift'])).max(5)
const point = z.object({ x: num, y: num }).strict()
const action = { timeout: timeout.optional(), force: bool.optional() }
const click = z.object({ ...action, button: z.enum(['left','right','middle']).optional(), clickCount: z.number().int().min(1).max(3).optional(), delay: z.number().min(0).max(10000).optional(), modifiers: mods.optional(), position: point.optional(), trial: bool.optional() }).strict()
const keyOptions = z.object({ delay: z.number().min(0).max(1000).optional() }).strict()
const typing = keyOptions.extend({ timeout: timeout.optional() })
const mouseClick = click.pick({button:true, clickCount:true, delay:true})
const png = { timeout: timeout.optional(), type: z.literal('png').optional(), animations: z.enum(['disabled','allow']).optional(), caret: z.enum(['hide','initial']).optional(), omitBackground: bool.optional(), scale: z.enum(['css','device']).optional() }
export const pageArguments = {
  title: noArgs, url: noArgs, domSnapshot: noArgs,
  goto: tuple(str, navigation.optional()),
  back: tuple(navigation.optional()), forward: tuple(navigation.optional()), reload: tuple(navigation.optional()),
  screenshot: tuple(z.object({ ...png, fullPage: bool.optional(), clip: z.object({ x: num, y: num, width: num.positive(), height: num.positive() }).strict().optional() }).strict().optional()),
  waitForLoadState: tuple(z.enum(['load','domcontentloaded','networkidle']).optional(), time.optional()),
  waitForURL: tuple(text, navigation.optional()),
  waitForTimeout: tuple(z.number().min(0).max(10000)),
  'keyboard.press': tuple(str, keyOptions.optional()), 'keyboard.type': tuple(str, keyOptions.optional()), 'keyboard.insertText': tuple(str),
  'keyboard.down': tuple(str), 'keyboard.up': tuple(str),
  'mouse.click': tuple(num,num,mouseClick.optional()), 'mouse.dblclick': tuple(num,num,mouseClick.omit({clickCount:true}).optional()),
  'mouse.move': tuple(num,num,z.object({steps:z.number().int().min(1).max(200).optional()}).strict().optional()),
  'mouse.down': tuple(z.object({button:z.enum(['left','right','middle']).optional(),clickCount:num.optional()}).strict().optional()),
  'mouse.up': tuple(z.object({button:z.enum(['left','right','middle']).optional(),clickCount:num.optional()}).strict().optional()),
  'mouse.wheel': tuple(num,num),
}
const selectValue = z.union([str,z.object({value:str.optional(),label:str.optional(),index:z.number().int().nonnegative().optional()}).strict()])
export const locatorArguments = {
  count: noArgs, all: noArgs, allTextContents: noArgs, allInnerTexts: noArgs,
  textContent: tuple(time.optional()), innerText: tuple(time.optional()), getAttribute: tuple(str,time.optional()), inputValue: tuple(time.optional()),
  isVisible: tuple(time.optional()), isHidden: tuple(time.optional()), isEnabled: tuple(time.optional()), isDisabled: tuple(time.optional()), isEditable: tuple(time.optional()), isChecked: tuple(time.optional()),
  boundingBox: tuple(time.optional()), ariaSnapshot: tuple(time.optional()), screenshot: tuple(z.object(png).strict().optional()),
  click: tuple(click.optional()), dblclick: tuple(click.omit({clickCount:true}).optional()),
  hover: tuple(z.object({...action,modifiers:mods.optional(),position:point.optional(),trial:bool.optional()}).strict().optional()),
  fill: tuple(str,z.object(action).strict().optional()), clear: tuple(z.object(action).strict().optional()),
  press: tuple(str,typing.optional()), pressSequentially: tuple(str,typing.optional()), type: tuple(str,typing.optional()),
  check: tuple(z.object(action).strict().optional()), uncheck: tuple(z.object(action).strict().optional()), setChecked: tuple(bool,z.object(action).strict().optional()),
  selectOption: tuple(z.union([selectValue,z.array(selectValue).max(100),z.null()]),z.object(action).strict().optional()),
  selectText: tuple(z.object(action).strict().optional()), focus: tuple(time.optional()), blur: tuple(time.optional()),
  scrollIntoViewIfNeeded: tuple(time.optional()),
  waitFor: tuple(z.object({timeout:timeout.optional(),state:z.enum(['attached','detached','visible','hidden']).optional()}).strict().optional()),
  dragTo: tuple(locatorRef,z.object({...action,sourcePosition:point.optional(),targetPosition:point.optional(),trial:bool.optional()}).strict().optional()),
}
export const queryStep = z.object({ method: z.enum(Object.keys(queryArguments) as [keyof typeof queryArguments, ...(keyof typeof queryArguments)[]]), args: z.array(z.json()).max(3) }).strict()
export const queryPlan = z.array(queryStep).max(24)
export type QueryPlan = z.infer<typeof queryPlan>
export const playwrightOperation = z.object({
  action: z.literal('playwright'), target: z.string().uuid(), plan: queryPlan,
  method: z.enum([...Object.keys(pageArguments), ...Object.keys(locatorArguments)] as [string,...string[]]),
  args: z.array(z.json()).max(4),
}).strict().refine(value => JSON.stringify(value).length <= 65536, 'Playwright request exceeds 64 KiB')
export function parseArguments(schema: z.ZodType, args: unknown[]): unknown[] {
  // JSON has no undefined; the facade omits trailing optional arguments.
  return schema.parse(args) as unknown[]
}
export const voidMethods = new Set(['goto','back','forward','reload','waitForLoadState','waitForURL','waitForTimeout','click','dblclick','hover','fill','clear','press','pressSequentially','type','check','uncheck','setChecked','selectText','focus','blur','scrollIntoViewIfNeeded','waitFor','dragTo',...Object.keys(pageArguments).filter(key=>key.includes('.'))])
