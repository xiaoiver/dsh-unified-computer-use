// src/companion-main.ts
import { app as app2 } from "electron";

// src/desktop.ts
import { app, desktopCapturer } from "electron";

// src/browser.ts
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { BrowserWindow, WebContentsView, ipcMain, session } from "electron";
import { z as z2 } from "zod";

// src/protocol.ts
import { z } from "zod";
var id = z.string().uuid();
var target = z.string().uuid();
var text = z.string().max(32768);
var browserAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), url: z.string().max(8192), visible: z.boolean().default(true) }).strict(),
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("observe"), target, screenshot: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("navigate"), target, url: z.string().max(8192) }).strict(),
  z.object({ action: z.literal("click"), target, ref: z.string().max(128) }).strict(),
  z.object({ action: z.literal("fill"), target, ref: z.string().max(128), text }).strict(),
  z.object({ action: z.literal("press"), target, key: z.enum(["Enter", "Tab", "Escape", "Backspace", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) }).strict(),
  z.object({ action: z.literal("scroll"), target, x: z.number().min(-4096).max(4096).default(0), y: z.number().min(-4096).max(4096) }).strict(),
  z.object({ action: z.literal("reveal"), target }).strict(),
  z.object({ action: z.literal("close"), target }).strict()
]);
var nativeAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("apps") }).strict(),
  z.object({ action: z.literal("permissions") }).strict(),
  z.object({ action: z.literal("windows"), pid: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("select"), pid: z.number().int().positive(), windowId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("observe"), target, screenshot: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("act"), target, tool: z.enum(["click", "set_value", "type_text", "press_key", "hotkey", "drag", "scroll"]), args: z.record(z.string(), z.json()) }).strict(),
  z.object({ action: z.literal("reveal"), target }).strict(),
  z.object({ action: z.literal("close"), target }).strict()
]);
var commandSchema = z.discriminatedUnion("surface", [
  z.object({ surface: z.literal("browser"), ...{ operation: browserAction } }).strict(),
  z.object({ surface: z.literal("native"), operation: nativeAction }).strict(),
  z.object({ surface: z.literal("session"), operation: z.enum(["state", "reset"]) }).strict()
]);
var configSchema = z.object({
  native: z.boolean().default(true),
  pip: z.boolean().default(true),
  maxTargets: z.number().int().min(1).max(32).default(12),
  timeoutMs: z.number().int().min(1e3).max(12e4).default(3e4),
  idleTimeoutMs: z.number().int().min(1e4).max(36e5).default(6e5)
}).strict();
var requestSchema = z.object({
  type: z.literal("dsh-cua/request"),
  version: z.literal(1),
  id,
  owner: id,
  operation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("configure"), config: configSchema }).strict(),
    z.object({ kind: z.literal("command"), command: commandSchema }).strict(),
    z.object({ kind: z.literal("lifecycle"), state: z.enum(["resume", "suspend", "release"]) }).strict()
  ])
}).strict();
var resultSchema = z.object({
  content: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() })
  ])),
  structuredContent: z.record(z.string(), z.json()).optional(),
  isError: z.boolean().optional()
});
var replySchema = z.object({
  type: z.literal("dsh-cua/reply"),
  version: z.literal(1),
  id,
  result: resultSchema.optional(),
  error: z.string().optional()
}).strict().refine((value) => value.result === void 0 !== (value.error === void 0));
var cancelSchema = z.object({ type: z.literal("dsh-cua/cancel"), version: z.literal(1), id }).strict();
function result(data2) {
  return { content: [{ type: "text", text: JSON.stringify(data2) }], structuredContent: data2 };
}
function webUrl(input, hostUrl) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only HTTP(S) URLs without embedded credentials are supported");
  if (hostUrl) {
    const host = new URL(hostUrl);
    if (url.port === host.port && (url.hostname === host.hostname || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error("The DSH application backend cannot be opened in the controlled browser");
    }
  }
  return url.href;
}

// src/browser.ts
var axNode = z2.object({
  ignored: z2.boolean(),
  backendDOMNodeId: z2.number().optional(),
  role: z2.object({ value: z2.string() }).optional(),
  name: z2.object({ value: z2.string() }).optional(),
  value: z2.object({ value: z2.union([z2.string(), z2.number(), z2.boolean()]) }).optional(),
  properties: z2.array(z2.object({ name: z2.string(), value: z2.object({ value: z2.unknown() }) })).optional()
});
var BrowserSurface = class {
  constructor(hostUrl, maxTargets, preview, invalidatePreview) {
    this.hostUrl = hostUrl;
    this.maxTargets = maxTargets;
    this.preview = preview;
    this.invalidatePreview = invalidatePreview;
    const browserSession = session.fromPartition(this.partition);
    browserSession.setPermissionRequestHandler((_c, _p, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setDevicePermissionHandler(() => false);
    browserSession.setDisplayMediaRequestHandler((_r, callback) => callback({}));
    browserSession.on("will-download", (event) => event.preventDefault());
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      try {
        const protocol = new URL(details.url).protocol;
        if (["http:", "https:"].includes(protocol)) webUrl(details.url, this.hostUrl());
        else if (["ws:", "wss:"].includes(protocol)) webUrl(details.url.replace(/^ws/, "http"), this.hostUrl());
        else if (!["about:", "data:", "blob:"].includes(protocol)) throw new Error("Unsupported protocol");
        callback({});
      } catch {
        callback({ cancel: true });
      }
    });
  }
  tabs = /* @__PURE__ */ new Map();
  window;
  active;
  channel = `dsh-cua-browser-${randomUUID()}`;
  partition = `dsh-cua-browser-${randomUUID()}`;
  disposed = false;
  async execute(op, signal) {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Browser owner is closed");
    if (op.action === "list") return result({ tabs: this.describe() });
    if (op.action === "open") {
      const url = webUrl(op.url, this.hostUrl());
      if (this.tabs.size >= this.maxTargets) throw new Error("Close a tab before opening another");
      await this.ensureWindow();
      signal.throwIfAborted();
      const tab2 = this.createTab();
      this.select(tab2.id, op.visible);
      try {
        await this.navigate(tab2.view.webContents, url, signal);
        await tab2.view.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
        signal.throwIfAborted();
        this.showPreview(tab2);
        return this.observe(tab2, false, signal);
      } catch (error) {
        this.closeTab(tab2.id);
        throw error;
      }
    }
    const tab = this.requireTab(op.target);
    const contents = tab.view.webContents;
    const send2 = (method, params = {}) => contents.debugger.sendCommand(method, params);
    if (op.action === "close") {
      this.closeTab(tab.id);
      return result({ closed: tab.id });
    }
    if (op.action === "reveal") {
      this.select(tab.id, true);
      return result({ target: tab.id });
    }
    if (op.action === "navigate") {
      const url = webUrl(op.url, this.hostUrl());
      this.invalidate(tab);
      await this.navigate(contents, url, signal);
      signal.throwIfAborted();
      this.showPreview(tab);
      return this.observe(tab, false, signal);
    }
    this.showPreview(tab);
    if (op.action === "observe") return this.observe(tab, op.screenshot, signal);
    if (op.action === "click" || op.action === "fill") {
      const backendNodeId = tab.refs.get(op.ref);
      if (backendNodeId === void 0) throw new Error("Stale element reference; observe this tab again");
      const generation = tab.generation;
      if (op.action === "click") {
        await send2("DOM.scrollIntoViewIfNeeded", { backendNodeId });
        const quads = z2.object({ quads: z2.array(z2.array(z2.number()).length(8)) }).parse(await send2("DOM.getContentQuads", { backendNodeId })).quads;
        if (quads.length !== 1) throw new Error("Element has no unique visible box; observe again");
        const q = quads[0];
        const x = (q[0] + q[2] + q[4] + q[6]) / 4;
        const y = (q[1] + q[3] + q[5] + q[7]) / 4;
        await send2("Page.captureScreenshot", { format: "jpeg", quality: 1 });
        signal.throwIfAborted();
        if (generation !== tab.generation) throw new Error("Page changed before input");
        this.invalidate(tab);
        await send2("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
        signal.throwIfAborted();
        await send2("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
        await send2("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      } else {
        const description = z2.object({ node: z2.object({ attributes: z2.array(z2.string()).optional() }) }).parse(await send2("DOM.describeNode", { backendNodeId }));
        const attrs = description.node.attributes ?? [];
        for (let i = 0; i < attrs.length; i += 2) {
          if (attrs[i] === "type" && attrs[i + 1]?.toLowerCase() === "password") throw new Error("Enter passwords manually in the browser");
        }
        await send2("DOM.focus", { backendNodeId });
        signal.throwIfAborted();
        if (generation !== tab.generation) throw new Error("Page changed before input");
        this.invalidate(tab);
        await send2("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2, commands: ["selectAll"] });
        await send2("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 0 });
        await send2("Input.insertText", { text: op.text });
      }
    } else if (op.action === "press") {
      this.invalidate(tab);
      const codes = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 };
      await send2("Input.dispatchKeyEvent", { type: "keyDown", key: op.key, code: op.key, windowsVirtualKeyCode: codes[op.key], ...op.key === "Enter" ? { text: "\r" } : {} });
      await send2("Input.dispatchKeyEvent", { type: "keyUp", key: op.key, code: op.key, windowsVirtualKeyCode: codes[op.key] });
    } else if (op.action === "scroll") {
      this.invalidate(tab);
      const bounds = tab.view.getBounds();
      await send2("Input.dispatchMouseEvent", { type: "mouseWheel", x: bounds.width / 2, y: bounds.height / 2, deltaX: op.x, deltaY: op.y });
    }
    signal.throwIfAborted();
    return result({ target: tab.id, delivered: true, next: "Observe to verify the result and obtain fresh element references." });
  }
  async observe(tab, screenshot, signal) {
    this.invalidate(tab);
    const generation = tab.generation;
    const contents = tab.view.webContents;
    const tree = z2.object({ nodes: z2.array(axNode) }).parse(await contents.debugger.sendCommand("Accessibility.getFullAXTree"));
    signal.throwIfAborted();
    if (generation !== tab.generation || tab.closed) throw new Error("Page navigated during observation; observe again");
    const elements = tree.nodes.filter((n) => !n.ignored).slice(0, 500).map((node, i) => {
      const ref = `${generation}:${i}`;
      if (node.backendDOMNodeId !== void 0) tab.refs.set(ref, node.backendDOMNodeId);
      const protectedValue = node.properties?.some((p) => p.name === "protected" && p.value.value === true);
      return { ref, role: node.role?.value ?? "", name: (node.name?.value ?? "").slice(0, 300), value: protectedValue ? "\u2022\u2022\u2022\u2022" : String(node.value?.value ?? "").slice(0, 1e3) };
    });
    const response = result({ target: tab.id, url: contents.getURL(), title: contents.getTitle(), elements, truncated: tree.nodes.filter((n) => !n.ignored).length > 500 });
    if (screenshot) {
      const image = z2.object({ data: z2.string() }).parse(await contents.debugger.sendCommand("Page.captureScreenshot", { format: "png" }));
      signal.throwIfAborted();
      if (generation !== tab.generation) throw new Error("Page changed while capturing screenshot");
      response.content.push({ type: "image", mimeType: "image/png", data: image.data });
    }
    return response;
  }
  async navigate(contents, url, signal) {
    const stop = () => {
      if (!contents.isDestroyed()) contents.stop();
    };
    signal.throwIfAborted();
    signal.addEventListener("abort", stop, { once: true });
    try {
      await contents.loadURL(url);
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", stop);
    }
  }
  createTab() {
    const view = new WebContentsView({ webPreferences: { partition: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webSecurity: true, disableDialogs: true } });
    const tab = { id: randomUUID(), view, generation: 0, refs: /* @__PURE__ */ new Map(), closed: false };
    this.tabs.set(tab.id, tab);
    const contents = view.webContents;
    contents.debugger.attach("1.3");
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      try {
        webUrl(url, this.hostUrl());
      } catch {
        event.preventDefault();
      }
    });
    contents.on("will-redirect", (event, url) => {
      try {
        webUrl(url, this.hostUrl());
      } catch {
        event.preventDefault();
      }
    });
    contents.on("did-start-navigation", (_e, _url, inPlace, main) => {
      if (main && !inPlace) {
        this.invalidate(tab);
        this.invalidatePreview(tab.id);
      }
    });
    contents.on("did-finish-load", () => {
      this.publish();
      this.showPreview(tab);
    });
    contents.on("page-title-updated", () => this.publish());
    contents.on("destroyed", () => {
      tab.closed = true;
      this.tabs.delete(tab.id);
      this.invalidatePreview(tab.id);
      this.publish();
    });
    contents.on("render-process-gone", () => this.closeTab(tab.id));
    return tab;
  }
  invalidate(tab) {
    tab.generation++;
    tab.refs.clear();
  }
  invalidateAll() {
    for (const tab of this.tabs.values()) this.invalidate(tab);
  }
  requireTab(id2) {
    const tab = this.tabs.get(id2);
    if (!tab || tab.closed || tab.view.webContents.isDestroyed()) throw new Error("Tab is closed or belongs to another session");
    return tab;
  }
  showPreview(tab) {
    if (tab.closed) return;
    this.preview({
      id: tab.id,
      title: () => tab.view.webContents.getTitle(),
      valid: () => !tab.closed && !tab.view.webContents.isDestroyed(),
      source: async () => tab.view.webContents.mainFrame,
      reveal: async () => this.select(tab.id, true)
    });
  }
  describe() {
    return [...this.tabs.values()].map((tab) => ({ target: tab.id, title: tab.view.webContents.getTitle(), url: tab.view.webContents.getURL(), active: tab.id === this.active }));
  }
  publish() {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(this.channel, this.describe());
  }
  select(id2, visible) {
    const tab = this.requireTab(id2);
    const window = this.window;
    if (this.active) {
      const old = this.tabs.get(this.active);
      if (old) window.contentView.removeChildView(old.view);
    }
    this.active = id2;
    window.contentView.addChildView(tab.view);
    this.resize();
    this.publish();
    if (visible) {
      window.show();
      window.focus();
    }
  }
  resize() {
    const tab = this.active ? this.tabs.get(this.active) : void 0;
    if (!tab || !this.window) return;
    const [width, height] = this.window.getContentSize();
    tab.view.setBounds({ x: 0, y: 92, width, height: Math.max(1, height - 92) });
  }
  async ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return;
    const window = this.window = new BrowserWindow({
      width: 1100,
      height: 780,
      show: false,
      title: "DSH Browser",
      webPreferences: { preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)), sandbox: true, contextIsolation: true, nodeIntegration: false, additionalArguments: [`--dsh-cua-channel=${this.channel}`] }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (e) => e.preventDefault());
    ipcMain.handle(this.channel, async (event, input) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("Invalid browser toolbar sender");
      const op = z2.discriminatedUnion("action", [
        z2.object({ action: z2.literal("state") }),
        z2.object({ action: z2.literal("select"), target: z2.string().uuid() }),
        z2.object({ action: z2.literal("close"), target: z2.string().uuid() }),
        z2.object({ action: z2.literal("navigate"), url: z2.string().max(8192) }),
        z2.object({ action: z2.literal("back") }),
        z2.object({ action: z2.literal("forward") }),
        z2.object({ action: z2.literal("reload") })
      ]).parse(input);
      if (op.action === "select") this.select(op.target, true);
      else if (op.action === "close") this.closeTab(op.target);
      else if (this.active && op.action !== "state") {
        const tab = this.requireTab(this.active);
        const contents = tab.view.webContents;
        this.invalidate(tab);
        if (op.action === "navigate") await contents.loadURL(webUrl(op.url, this.hostUrl()));
        else if (op.action === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
        else if (op.action === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
        else if (op.action === "reload") contents.reload();
      }
      return this.describe();
    });
    window.on("resize", () => this.resize());
    window.on("close", (event) => {
      if (!this.disposed) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on("closed", () => {
      ipcMain.removeHandler(this.channel);
      this.window = void 0;
    });
    await window.loadFile(fileURLToPath(new URL("./browser.html", import.meta.url)));
  }
  closeTab(id2) {
    const tab = this.tabs.get(id2);
    if (!tab) return;
    tab.closed = true;
    this.tabs.delete(id2);
    this.invalidatePreview(id2);
    this.window?.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false });
    if (this.active === id2) {
      this.active = void 0;
      const next = this.tabs.keys().next().value;
      if (next) this.select(next, false);
    }
    this.publish();
  }
  dispose() {
    this.disposed = true;
    for (const id2 of [...this.tabs.keys()]) this.closeTab(id2);
    this.window?.destroy();
    ipcMain.removeHandler(this.channel);
  }
};

// src/native.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { z as z3 } from "zod";
var NativeRuntime = class {
  driver;
  closed = false;
  disposing;
  calls = /* @__PURE__ */ new Set();
  call(name, args, signal) {
    const task = this.execute(name, args, signal);
    this.calls.add(task);
    void task.finally(() => this.calls.delete(task)).catch(() => {
    });
    return task;
  }
  async execute(name, args, signal) {
    signal.throwIfAborted();
    if (this.closed) throw new Error("Native runtime is closed");
    this.driver ??= import("@trycua/cua-driver").then(({ CuaDriver }) => CuaDriver.create({ claudeCodeCompatibility: false }));
    const driver = await this.driver;
    signal.throwIfAborted();
    const reply = await driver.callTool(name, JSON.stringify(args), { signal });
    signal.throwIfAborted();
    return resultSchema.parse(JSON.parse(reply.rawJson));
  }
  dispose() {
    if (this.disposing) return this.disposing;
    this.closed = true;
    this.disposing = (async () => {
      await Promise.allSettled(this.calls);
      if (!this.driver) return;
      const driver = await this.driver;
      await driver.shutdown();
      if ("uniffiDestroy" in driver && typeof driver.uniffiDestroy === "function") driver.uniffiDestroy();
    })();
    return this.disposing;
  }
};
var appsSchema = z3.object({ apps: z3.array(z3.object({ pid: z3.number(), name: z3.string(), bundle_id: z3.string().nullable().optional() })) });
var windowsSchema = z3.object({ windows: z3.array(z3.object({ window_id: z3.number(), pid: z3.number().nullable(), title: z3.string(), layer: z3.number().nullable().optional() })) });
var argumentKeys = /* @__PURE__ */ new Set(["element_token", "x", "y", "button", "count", "action", "value", "text", "key", "keys", "modifiers", "direction", "by", "amount", "from_x", "from_y", "to_x", "to_y", "duration_ms", "steps", "modifier"]);
function data(response) {
  if (response.isError) throw new Error(response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"));
  if (!response.structuredContent) throw new Error("Native driver returned no structured state");
  return response.structuredContent;
}
var NativeSurface = class {
  constructor(driver, maxTargets, preview, invalidatePreview, capture) {
    this.driver = driver;
    this.maxTargets = maxTargets;
    this.preview = preview;
    this.invalidatePreview = invalidatePreview;
    this.capture = capture;
  }
  targets = /* @__PURE__ */ new Map();
  session = `dsh-${randomUUID2()}`;
  lifetime = new AbortController();
  used = false;
  timer;
  checking;
  disposing;
  async execute(op, signal) {
    signal = AbortSignal.any([signal, this.lifetime.signal]);
    signal.throwIfAborted();
    if (op.action === "permissions") return this.call("check_permissions", { prompt: false }, signal);
    if (op.action === "apps") return this.call("list_apps", {}, signal);
    if (op.action === "windows") return this.call("list_windows", { pid: op.pid, on_screen_only: false }, signal);
    if (op.action === "select") {
      const existing = [...this.targets.values()].find((t) => t.pid === op.pid && t.windowId === op.windowId && t.valid);
      if (existing) return this.observe(existing, false, signal);
      if (this.targets.size >= this.maxTargets) throw new Error("Close a native target before selecting another");
      const apps = appsSchema.parse(data(await this.call("list_apps", {}, signal))).apps;
      const app3 = apps.find((a) => a.pid === op.pid);
      if (!app3) throw new Error("Process is not a discovered application");
      const selected2 = {
        id: randomUUID2(),
        pid: op.pid,
        windowId: op.windowId,
        bundle: app3.bundle_id ?? app3.name,
        title: app3.name,
        valid: true,
        observed: false,
        screenshot: false,
        tokens: /* @__PURE__ */ new Set(),
        secureTokens: /* @__PURE__ */ new Set()
      };
      await this.verify(selected2, signal);
      signal.throwIfAborted();
      this.targets.set(selected2.id, selected2);
      this.startMonitor();
      this.showPreview(selected2);
      return this.observe(selected2, false, signal);
    }
    const selected = this.targets.get(op.target);
    if (!selected || !selected.valid) throw new Error("Native target is closed or belongs to another session");
    if (op.action === "close") {
      this.remove(selected);
      return result({ closed: selected.id });
    }
    await this.verify(selected, signal);
    this.showPreview(selected);
    if (op.action === "observe") return this.observe(selected, op.screenshot, signal);
    if (op.action === "reveal") return this.call("bring_to_front", { pid: selected.pid, window_id: selected.windowId }, signal);
    if (!selected.observed) throw new Error("Observe the native window before each action");
    for (const key of Object.keys(op.args)) if (!argumentKeys.has(key)) throw new Error(`Unsupported native argument: ${key}`);
    if (JSON.stringify(op.args).length > 4e4) throw new Error("Native input is too large");
    const token = op.args.element_token;
    if (token !== void 0 && (typeof token !== "string" || !selected.tokens.has(token))) throw new Error("Element token is not in this target observation");
    if (typeof token === "string" && selected.secureTokens.has(token)) throw new Error("Enter passwords manually in the application");
    if (["x", "y", "from_x", "from_y", "to_x", "to_y"].some((key) => key in op.args) && !selected.screenshot) throw new Error("Coordinate actions require an explicit screenshot observation");
    selected.observed = false;
    const response = await this.call(op.tool, {
      ...op.args,
      pid: selected.pid,
      window_id: selected.windowId,
      ...op.tool === "set_value" ? {} : { delivery_mode: "background" }
    }, signal);
    return response;
  }
  async observe(target2, screenshot, signal) {
    target2.observed = false;
    target2.tokens.clear();
    target2.secureTokens.clear();
    const reply = await this.call("get_window_state", { pid: target2.pid, window_id: target2.windowId, include_screenshot: screenshot, include_accessibility_tree: true, max_elements: 500, max_depth: 25, max_dimension: 1280 }, signal);
    const state = z3.object({ pid: z3.number(), window_id: z3.number(), elements: z3.array(z3.object({ element_token: z3.string().nullable().optional(), role: z3.string(), subrole: z3.string().nullable().optional() }).passthrough()) }).passthrough().parse(data(reply));
    if (state.pid !== target2.pid || state.window_id !== target2.windowId) throw new Error("Native observation returned a different window");
    await this.verify(target2, signal);
    for (const element of state.elements) {
      if (element.element_token) {
        target2.tokens.add(element.element_token);
        if (/password|secure/i.test(`${element.role} ${element.subrole ?? ""}`)) target2.secureTokens.add(element.element_token);
      }
    }
    target2.observed = true;
    target2.screenshot = screenshot && reply.content.some((c) => c.type === "image");
    const structured = { ...data(reply), target: target2.id };
    return { ...reply, structuredContent: structured, content: [{ type: "text", text: JSON.stringify(structured) }, ...reply.content.filter((c) => c.type === "image" && screenshot)] };
  }
  async call(name, args, signal) {
    this.used = true;
    return this.driver.call(name, { ...args, session: this.session }, signal);
  }
  async verify(target2, signal) {
    const apps = appsSchema.parse(data(await this.call("list_apps", {}, signal))).apps;
    const windows = windowsSchema.parse(data(await this.call("list_windows", { pid: target2.pid, on_screen_only: false }, signal))).windows;
    const app3 = apps.find((a) => a.pid === target2.pid && (a.bundle_id ?? a.name) === target2.bundle);
    const window = windows.find((w) => w.pid === target2.pid && w.window_id === target2.windowId && (w.layer === 0 || w.layer == null));
    if (!app3 || !window) {
      this.remove(target2);
      throw new Error("Native process/window identity changed");
    }
    target2.title = window.title || app3.name;
  }
  showPreview(target2) {
    this.preview({
      id: target2.id,
      title: () => target2.title,
      valid: () => target2.valid && !this.lifetime.signal.aborted,
      source: async (signal) => {
        await this.verify(target2, signal);
        const source = await this.capture(target2.windowId, signal);
        await this.verify(target2, signal);
        return source;
      },
      reveal: async () => {
        await this.verify(target2, this.lifetime.signal);
        data(await this.call("bring_to_front", { pid: target2.pid, window_id: target2.windowId }, this.lifetime.signal));
      }
    });
  }
  startMonitor() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.checking || this.lifetime.signal.aborted) return;
      this.checking = Promise.allSettled([...this.targets.values()].map((t) => this.verify(t, this.lifetime.signal).catch(() => this.remove(t)))).then(() => {
      }).finally(() => {
        this.checking = void 0;
      });
    }, 2e3);
    this.timer.unref();
  }
  remove(target2) {
    target2.valid = false;
    target2.observed = false;
    this.targets.delete(target2.id);
    this.invalidatePreview(target2.id);
  }
  invalidateAll() {
    for (const target2 of this.targets.values()) {
      target2.observed = false;
      target2.tokens.clear();
    }
  }
  dispose() {
    if (this.disposing) return this.disposing;
    this.lifetime.abort();
    clearInterval(this.timer);
    for (const target2 of this.targets.values()) this.remove(target2);
    this.disposing = (async () => {
      await this.checking;
      if (this.used) data(await this.driver.call("end_session", { session: this.session }, AbortSignal.timeout(5e3)));
    })();
    return this.disposing;
  }
};

// src/pip.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { BrowserWindow as BrowserWindow2, ipcMain as ipcMain2, screen } from "electron";
import { z as z4 } from "zod";
function fitPreview(area, index, previous) {
  const width = Math.min(previous?.width ?? 480, 720, Math.max(80, area.width - 24));
  const height = Math.min(previous?.height ?? 300, 500, Math.max(80, area.height - 24));
  return {
    width,
    height,
    x: Math.max(area.x + 12, Math.min(previous?.x ?? area.x + area.width - width - 16 - index * 24, area.x + area.width - width - 12)),
    y: Math.max(area.y + 12, Math.min(previous?.y ?? area.y + 16 + index * 28, area.y + area.height - height - 12))
  };
}
var PreviewWindows = class {
  constructor(enabled) {
    this.enabled = enabled;
  }
  entries = /* @__PURE__ */ new Map();
  active = true;
  disposed = false;
  touch(target2) {
    if (!this.enabled || this.disposed || !target2.valid()) return;
    let entry = this.entries.get(target2.id);
    if (!entry) {
      entry = { target: target2, dismissed: false };
      this.entries.set(target2.id, entry);
    } else entry.target = target2;
    if (this.active && !entry.dismissed && !entry.window) {
      void this.open(entry).catch((error) => console.error("DSH preview failed:", error instanceof Error ? error.message : String(error)));
    }
  }
  invalidate(id2) {
    const entry = this.entries.get(id2);
    if (entry) this.destroy(entry);
    this.entries.delete(id2);
  }
  suspend() {
    this.active = false;
    for (const entry of this.entries.values()) this.destroy(entry);
  }
  resume() {
    if (this.disposed || this.active) return;
    this.active = true;
    for (const entry of this.entries.values()) {
      entry.dismissed = false;
      this.touch(entry.target);
    }
  }
  async open(entry) {
    if (!this.active || this.disposed || !entry.target.valid()) return;
    const channel = entry.channel = `dsh-cua-pip-${randomUUID3()}`;
    const lifetime = entry.lifetime = new AbortController();
    const bounds = fitPreview(screen.getPrimaryDisplay().workArea, [...this.entries.values()].indexOf(entry), entry.bounds);
    const window = entry.window = new BrowserWindow2({
      ...bounds,
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: "DSH Computer Use",
      webPreferences: {
        preload: fileURLToPath2(new URL("./preload.cjs", import.meta.url)),
        partition: `dsh-cua-pip-${randomUUID3()}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        additionalArguments: [`--dsh-cua-channel=${channel}`]
      }
    });
    const contents = window.webContents;
    const receiverUrl = new URL("./pip.html", import.meta.url).href;
    const valid = () => !this.disposed && this.active && !lifetime.signal.aborted && entry.window === window && !window.isDestroyed() && entry.target.valid();
    let requested = false;
    const mediaSession = contents.session;
    mediaSession.setPermissionCheckHandler(() => false);
    mediaSession.setDevicePermissionHandler(() => false);
    mediaSession.setPermissionRequestHandler((sender, permission, callback, details) => {
      const display = permission === "display-capture" || permission === "media" && "mediaTypes" in details && details.mediaTypes?.length === 0;
      callback(display && sender === contents && details.isMainFrame && details.requestingUrl === receiverUrl && valid());
    });
    mediaSession.setDisplayMediaRequestHandler((request, callback) => {
      if (!valid() || requested || request.frame !== contents.mainFrame || request.frame.url !== receiverUrl || !request.videoRequested || request.audioRequested) {
        callback({});
        return;
      }
      requested = true;
      void entry.target.source(lifetime.signal).then((video) => {
        callback(valid() && request.frame === contents.mainFrame && request.frame.url === receiverUrl ? { video } : {});
      }, () => callback({}));
    });
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    ipcMain2.handle(channel, async (event, input) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame || !valid()) throw new Error("Preview lease expired");
      const op = z4.discriminatedUnion("action", [
        z4.object({ action: z4.literal("state") }),
        z4.object({ action: z4.literal("close") }),
        z4.object({ action: z4.literal("reveal") }),
        z4.object({ action: z4.literal("video"), width: z4.number().positive(), height: z4.number().positive() }),
        z4.object({ action: z4.literal("ended") })
      ]).parse(input);
      if (op.action === "close" || op.action === "ended") {
        entry.dismissed = true;
        this.destroy(entry);
      }
      if (op.action === "reveal") {
        await entry.target.reveal();
        entry.dismissed = true;
        this.destroy(entry);
      }
      if (op.action === "video" && !window.isDestroyed()) {
        window.setAspectRatio(op.width / op.height, { width: 0, height: 38 });
      }
      return { title: entry.target.valid() ? entry.target.title() : "Target closed" };
    });
    window.on("close", () => {
      entry.dismissed = true;
    });
    window.on("closed", () => {
      lifetime.abort();
      ipcMain2.removeHandler(channel);
      mediaSession.setDisplayMediaRequestHandler(null);
      mediaSession.setPermissionRequestHandler((_c, _p, callback) => callback(false));
      if (entry.window === window) entry.window = void 0;
    });
    window.on("move", () => {
      if (!window.isDestroyed()) entry.bounds = window.getBounds();
    });
    window.on("resize", () => {
      if (!window.isDestroyed()) entry.bounds = window.getBounds();
    });
    contents.on("render-process-gone", () => this.destroy(entry));
    try {
      await window.loadURL(receiverUrl);
      if (valid()) window.showInactive();
      else if (entry.window === window) this.destroy(entry);
    } catch (error) {
      if (entry.window === window) this.destroy(entry);
      if (!lifetime.signal.aborted) throw error;
    }
  }
  destroy(entry) {
    entry.lifetime?.abort();
    const window = entry.window;
    entry.window = void 0;
    if (window && !window.isDestroyed()) {
      entry.bounds = window.getBounds();
      window.destroy();
    }
    if (entry.channel) ipcMain2.removeHandler(entry.channel);
  }
  dispose() {
    this.disposed = true;
    this.suspend();
    this.entries.clear();
  }
};

// src/desktop.ts
var DesktopBridge = class {
  constructor(options) {
    this.options = options;
    this.timer = setInterval(() => {
      for (const [id2, owner] of this.owners) {
        if (Date.now() - owner.touched > owner.config.idleTimeoutMs && ![...this.pending.values()].some((p) => p.owner === id2)) {
          void this.release(id2).catch((error) => console.error("DSH Computer Use cleanup:", error));
        }
      }
    }, 5e3);
    this.timer.unref();
  }
  owners = /* @__PURE__ */ new Map();
  retired = /* @__PURE__ */ new Set();
  pending = /* @__PURE__ */ new Map();
  tasks = /* @__PURE__ */ new Set();
  native = new NativeRuntime();
  closed = false;
  disposing;
  timer;
  /** Return true only for this extension's reserved message namespace. */
  handle(value) {
    if (typeof value !== "object" || !value || !("type" in value) || typeof value.type !== "string" || !value.type.startsWith("dsh-cua/")) return false;
    if (this.closed) {
      const closing2 = requestSchema.safeParse(value);
      if (closing2.success) {
        const op = closing2.data.operation;
        this.reply(closing2.data.id, op.kind === "lifecycle" && op.state === "release" ? { result: result({ released: true }) } : { error: "Desktop Computer Use is shutting down" });
      }
      return true;
    }
    const canceled = cancelSchema.safeParse(value);
    if (canceled.success) {
      const pending = this.pending.get(canceled.data.id);
      if (pending) {
        pending.abort.abort(new Error("Computer Use canceled"));
        const owner = this.owners.get(pending.owner);
        if (owner) {
          owner.suspended = true;
          owner.previews.suspend();
          owner.browser.invalidateAll();
          owner.native.invalidateAll();
        }
      }
      return true;
    }
    const parsed = requestSchema.safeParse(value);
    if (!parsed.success) return true;
    const request = parsed.data;
    if (this.pending.has(request.id)) return true;
    const abort = new AbortController();
    this.pending.set(request.id, { owner: request.owner, abort });
    const task = this.dispatch(request, abort.signal).then(
      (response) => this.reply(request.id, { result: response }),
      (error) => this.reply(request.id, { error: error instanceof Error ? error.message : String(error) })
    ).finally(() => {
      this.pending.delete(request.id);
      this.tasks.delete(task);
    });
    this.tasks.add(task);
    return true;
  }
  reply(id2, payload) {
    this.options.send({ type: "dsh-cua/reply", version: 1, id: id2, ...payload });
  }
  async dispatch(request, signal) {
    signal.throwIfAborted();
    const { operation, owner: id2 } = request;
    if (operation.kind === "configure") {
      if (this.retired.has(id2)) throw new Error("Session resource expired; reset Computer Use before continuing");
      if (!this.owners.has(id2)) {
        if (this.owners.size >= 32) throw new Error("Too many live Computer Use sessions");
        const config = operation.config;
        const previews = new PreviewWindows(config.pip);
        const browser = new BrowserSurface(this.options.hostUrl, config.maxTargets, (t) => previews.touch(t), (key) => previews.invalidate(key));
        const native = new NativeSurface(this.native, config.maxTargets, (t) => previews.touch(t), (key) => previews.invalidate(key), async (windowId, active2) => {
          const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
          active2.throwIfAborted();
          const source = sources.find((s) => s.id.split(":")[1] === String(windowId));
          if (!source) throw new Error("Selected native window is not available for capture");
          return source;
        });
        this.owners.set(id2, { config, previews, browser, native, lifetime: new AbortController(), tail: Promise.resolve(), suspended: false, touched: Date.now() });
      }
      return result({ ready: true, protocol: 1, surfaces: ["browser", ...operation.config.native ? ["native"] : []] });
    }
    if (operation.kind === "lifecycle" && operation.state === "release" || operation.kind === "command" && operation.command.surface === "session" && operation.command.operation === "reset") {
      await this.release(id2);
      return result({ released: true });
    }
    const owner = this.owners.get(id2);
    if (!owner || owner.closing) throw new Error("Session resource expired; reset Computer Use before continuing");
    owner.touched = Date.now();
    if (operation.kind === "lifecycle") {
      owner.suspended = operation.state === "suspend";
      if (owner.suspended) {
        owner.previews.suspend();
        owner.browser.invalidateAll();
        owner.native.invalidateAll();
      } else owner.previews.resume();
      return result({ state: operation.state });
    }
    const command = operation.command;
    if (command.surface === "session") return result({ state: owner.suspended ? "paused" : "active", protocol: 1 });
    if (owner.suspended) throw new Error("Computer Use is paused; continue in a new turn and observe again");
    const active = AbortSignal.any([signal, owner.lifetime.signal, AbortSignal.timeout(owner.config.timeoutMs)]);
    const job = owner.tail.then(async () => {
      active.throwIfAborted();
      if (owner.suspended) throw new Error("Computer Use is paused");
      try {
        const output = command.surface === "browser" ? await owner.browser.execute(command.operation, active) : owner.config.native ? await owner.native.execute(command.operation, active) : (() => {
          throw new Error("Native Computer Use is disabled in configuration");
        })();
        active.throwIfAborted();
        return output;
      } catch (error) {
        owner.browser.invalidateAll();
        owner.native.invalidateAll();
        if (active.aborted) {
          owner.suspended = true;
          owner.previews.suspend();
        }
        throw error;
      } finally {
        owner.touched = Date.now();
      }
    });
    owner.tail = job.then(() => {
    }, () => {
    });
    return job;
  }
  release(id2) {
    const owner = this.owners.get(id2);
    if (!owner) return Promise.resolve();
    if (owner.closing) return owner.closing;
    this.retired.add(id2);
    owner.lifetime.abort(new Error("Session closed"));
    owner.previews.dispose();
    owner.browser.dispose();
    owner.closing = (async () => {
      await owner.tail;
      await owner.native.dispose();
      this.owners.delete(id2);
    })();
    return owner.closing;
  }
  dispose() {
    if (this.disposing) return this.disposing;
    this.closed = true;
    this.disposing = this.teardown();
    return this.disposing;
  }
  async teardown() {
    clearInterval(this.timer);
    for (const pending of this.pending.values()) pending.abort.abort(new Error("Desktop disconnected"));
    const releases = await Promise.allSettled([...this.owners.keys()].map((id2) => this.release(id2)));
    await Promise.allSettled(this.tasks);
    await this.native.dispose();
    const errors = releases.flatMap((r) => r.status === "rejected" ? [r.reason] : []);
    if (errors.length) throw new AggregateError(errors, "Computer Use cleanup failed");
  }
};
function createDesktopBridge(options) {
  if (!app.isReady()) throw new Error("Computer Use requires Electron app.whenReady()");
  return new DesktopBridge(options);
}

// src/companion-main.ts
import { isAbsolute } from "node:path";
var profile = process.argv[2];
if (!process.send || !process.connected || !profile || !isAbsolute(profile)) throw new Error("Launch this companion through the DSH plugin");
app2.setName("DSH Computer Use");
app2.setPath("userData", profile);
app2.on("window-all-closed", () => {
});
var bridge;
var closing;
var send = (message) => {
  if (process.connected) process.send?.(message, () => {
  });
};
function shutdown() {
  return closing ??= (async () => {
    const deadline = setTimeout(() => app2.exit(1), 7e3);
    try {
      await bridge?.dispose();
      send({ type: "dsh-cua/stopped", version: 1 });
    } finally {
      clearTimeout(deadline);
      app2.exit(0);
    }
  })();
}
process.on("disconnect", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("message", (message) => {
  if (message && typeof message === "object" && "type" in message && message.type === "dsh-cua/shutdown") {
    void shutdown();
    return;
  }
  bridge?.handle(message);
});
app2.on("before-quit", (event) => {
  if (!closing) {
    event.preventDefault();
    void shutdown();
  }
});
void app2.whenReady().then(() => {
  if (closing || !process.connected) return shutdown();
  bridge = createDesktopBridge({ hostUrl: () => void 0, send });
  send({ type: "dsh-cua/ready", version: 1, electron: process.versions.electron });
}).catch((error) => {
  send({ type: "dsh-cua/fatal", message: String(error) });
  app2.exit(1);
});
//# sourceMappingURL=companion-main.js.map
