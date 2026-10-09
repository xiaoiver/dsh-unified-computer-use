import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { apply } from '../../src/client.ts'
let Body
const root = createRoot(document.querySelector('#root'))
const effects = []
let language = 'en'
const dictionaries = new Map()
const listeners = new Set<() => void>()
window.fixtureLocale = (value: string) => { language = value; for (const listener of listeners) listener() }
const ctx = {
  // Minimal locale adapter: exercises the plugin's dictionaries/subscription.
  locale: {
    register: (ns, dicts) => { dictionaries.set(ns, dicts); return () => dictionaries.delete(ns) },
    bind: ns => (key, params = {}) => dictionaries.get(ns)[language][key].replace(/\{(\w+)\}/g, (_, name) => String(params[name])),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
  },
  inject: () => {}, // settings service is absent in this browser-only fixture
  connection: { isLoopback: true, rpc: { call: (_channel, endpoint, payload) => window.fixtureRpc(endpoint, payload) } },
  sidebarRight: { mounted: { getSnapshot: () => 'fixture-session' }, openTabIn: () => root.render(createElement(Body, { sessionId: 'fixture-session' })) },
  sidebarRightTabs: { register: () => () => {} },
  slots: { inject: (_name, setup) => setup(), register: (_options, component) => { Body = component; return () => {} } },
  effect: setup => effects.push(setup()),
}
apply(ctx)
window.fixtureDispose = async () => { for (const effect of effects.reverse()) await effect?.(); root.unmount() }
