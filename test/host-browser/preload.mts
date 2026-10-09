import { contextBridge, ipcRenderer } from 'electron'
import { createDesktopBrowserBridge } from 'stock-preload-browser'
contextBridge.exposeInMainWorld('dshDesktop', { protocolVersion: 1, browser: createDesktopBrowserBridge() })
contextBridge.exposeInMainWorld('fixtureRpc', (endpoint, payload) => ipcRenderer.invoke('fixture-rpc', endpoint, payload))
