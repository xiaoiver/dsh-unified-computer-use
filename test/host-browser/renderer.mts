import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { apply } from '../../src/client.ts'
let Body
const root = createRoot(document.querySelector('#root'))
const effects = []
const ctx = {
  connection: { isLoopback: true, rpc: { call: (_channel, endpoint, payload) => window.fixtureRpc(endpoint, payload) } },
  sidebarRight: { mounted: { getSnapshot: () => 'fixture-session' }, openTabIn: () => root.render(createElement(Body, { sessionId: 'fixture-session' })) },
  sidebarRightTabs: { register: () => () => {} },
  slots: { inject: (_name, setup) => setup(), register: (_options, component) => { Body = component; return () => {} } },
  effect: setup => effects.push(setup()),
}
apply(ctx)
window.fixtureDispose = async () => { for (const effect of effects.reverse()) await effect?.(); root.unmount() }
