/** The trusted toolbar receives only its own private, fixed IPC route. */
import { contextBridge, ipcRenderer } from 'electron'
const prefix = '--dsh-cua-channel='
const channel = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
if (!channel || !/^dsh-cua-(browser|pip)-[a-f0-9-]+$/.test(channel)) throw new Error('Missing Computer Use view lease')
contextBridge.exposeInMainWorld('cuaView', {
  request: (input: object) => ipcRenderer.invoke(channel, input),
  onState: (listener: (value: unknown) => void) => {
    ipcRenderer.on(channel, (_event, value: unknown) => listener(value))
  },
})
