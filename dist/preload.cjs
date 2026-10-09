"use strict";

// src/preload.ts
var import_electron = require("electron");
var prefix = "--dsh-cua-channel=";
var channel = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
if (!channel || !/^dsh-cua-(browser|pip)-[a-f0-9-]+$/.test(channel)) throw new Error("Missing Computer Use view lease");
import_electron.contextBridge.exposeInMainWorld("cuaView", {
  request: (input) => import_electron.ipcRenderer.invoke(channel, input),
  onState: (listener) => {
    import_electron.ipcRenderer.on(channel, (_event, value) => listener(value));
  }
});
