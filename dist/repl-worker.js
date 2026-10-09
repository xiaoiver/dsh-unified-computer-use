// src/repl-worker.ts
import { start } from "node:repl";
import { PassThrough, Writable } from "node:stream";
import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";

// node_modules/@deepseek-ai/dsh-subprocess/lib/control.js
import { Socket } from "node:net";
var SUBPROCESS_CONTROL_ENV = "DSH_SUBPROCESS_CONTROL";
function openInheritedControlChannel() {
  const marker = process.env[SUBPROCESS_CONTROL_ENV];
  Reflect.deleteProperty(process.env, SUBPROCESS_CONTROL_ENV);
  if (marker !== "pipe") throw new Error("subprocess control channel was not inherited");
  return new Socket({
    fd: 7,
    readable: true,
    writable: true,
    allowHalfOpen: true
  });
}

// src/repl-channel.ts
var MAX_FRAME = 4 * 1024 * 1024;
var ReplChannel = class {
  constructor(stream, receive, fail) {
    this.stream = stream;
    this.fail = fail;
    stream.on("data", (part) => {
      if (this.closed) return;
      this.buffered = Buffer.concat([this.buffered, part]);
      try {
        while (this.buffered.length >= 4) {
          const size = this.buffered.readUInt32BE();
          if (size > MAX_FRAME) throw new Error("REPL control frame exceeds 4 MiB");
          if (this.buffered.length < size + 4) return;
          const message = JSON.parse(this.buffered.subarray(4, size + 4).toString("utf8"));
          this.buffered = this.buffered.subarray(size + 4);
          receive(message);
        }
      } catch (error) {
        this.abort(error instanceof Error ? error : new Error("Invalid REPL frame"));
      }
    });
    stream.on("error", (error) => this.abort(error));
    stream.on("close", () => this.abort(new Error("REPL control channel closed")));
  }
  buffered = Buffer.alloc(0);
  closed = false;
  send(value) {
    if (this.closed) throw new Error("REPL control channel is closed");
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > MAX_FRAME || this.stream.writableLength > MAX_FRAME) throw new Error("REPL control output exceeds 4 MiB");
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    this.stream.write(Buffer.concat([header, body]));
  }
  abort(error) {
    if (!this.closed) {
      this.closed = true;
      this.stream.destroy();
      this.fail(error);
    }
  }
  close() {
    this.closed = true;
    this.stream.destroy();
  }
};

// src/errors.ts
function errorText(error, depth = 0) {
  if (depth > 3) return "nested error";
  if (typeof error === "string") return error.slice(0, 2e3);
  if (!error || typeof error !== "object") return String(error);
  const fields = error;
  const detail = ["message", "code", "kind"].flatMap((key) => typeof fields[key] === "string" ? [String(fields[key]).slice(0, 2e3)] : []);
  if (fields.cause !== void 0 && fields.cause !== error) detail.push(errorText(fields.cause, depth + 1));
  return detail.join(": ") || "Unknown error (no message provided)";
}

// src/repl-worker.ts
var control = openInheritedControlChannel();
for (const key of Object.keys(process.env)) delete process.env[key];
var run = new AsyncLocalStorage();
var active;
var sequence = 0;
var pending = /* @__PURE__ */ new Map();
var channel = new ReplChannel(control, (message) => {
  const m = message;
  if (m.type === "reply" && typeof m.seq === "number") {
    const call2 = pending.get(m.seq);
    if (!call2) return;
    pending.delete(m.seq);
    if (m.error) call2.reject(new Error(m.error));
    else if (m.result) call2.resolve(m.result);
    else call2.reject(new Error("Missing Computer Use result"));
  } else if (m.type === "eval" && typeof m.id === "string" && typeof m.code === "string" && !active) {
    void evaluate(m.id, m.code).catch(() => process.exit(1));
  } else process.exit(1);
}, () => process.exit(1));
function output(value) {
  if (!active || run.getStore() !== active) throw new Error("Output requires an active cua_repl call");
  channel.send({ type: "output", id: active, content: { type: "text", text: typeof value === "string" ? value : inspect(value, { depth: 6, maxArrayLength: 100, maxStringLength: 32768 }) } });
}
async function call(surface, operation) {
  if (!active || run.getStore() !== active) throw new Error("Computer Use calls must belong to the active evaluation");
  if (pending.size >= 16) throw new Error("At most 16 pending Computer Use calls are allowed");
  const seq = ++sequence;
  const deferred = Promise.withResolvers();
  pending.set(seq, deferred);
  void deferred.promise.catch(() => {
  });
  channel.send({ type: "call", id: active, seq, command: { surface, operation } });
  return deferred.promise;
}
async function data(surface, operation) {
  const result = await call(surface, operation);
  if (result.isError) throw new Error(result.content.filter((x) => x.type === "text").map((x) => x.text).join("\n"));
  return result.structuredContent ?? result;
}
function tab(target) {
  return Object.freeze({
    id: target,
    getState: (options = {}) => data("browser", { action: "observe", target, screenshot: options.screenshot ?? false }),
    navigate: (url) => data("browser", { action: "navigate", target, url }),
    click: (ref) => data("browser", { action: "click", target, ref }),
    fill: (ref, text) => data("browser", { action: "fill", target, ref, text }),
    press: (key) => data("browser", { action: "press", target, key }),
    scroll: (y, x = 0) => data("browser", { action: "scroll", target, x, y }),
    close: () => data("browser", { action: "close", target })
  });
}
var cua = Object.freeze({
  native: (operation) => call("native", operation),
  browser: (operation) => call("browser", operation),
  getState: () => data("native", { action: "apps" }),
  listWindows: (pid) => data("native", { action: "windows", pid }),
  async getApp(options) {
    const state = await data("native", { action: "select", ...options });
    const target = state.target;
    output(state);
    return Object.freeze({
      id: target,
      getState: (options2 = {}) => call("native", { action: "observe", target, screenshot: options2.screenshot ?? false }),
      act: (tool, args) => data("native", { action: "act", target, tool, args }),
      close: () => data("native", { action: "close", target })
    });
  },
  async createBrowserTab(url) {
    const state = await data("browser", { action: "open", url, visible: true });
    output(state);
    return tab(state.target);
  },
  getTab: (target) => tab(target)
});
var input = new PassThrough();
var repl = start({ input, output: new Writable({ write(_chunk, _encoding, done) {
  done();
} }), terminal: false, prompt: "", useGlobal: false, ignoreUndefined: true });
var evaluationDomain = (() => {
  const domain = repl._domain;
  if (!domain) throw new Error("This Node REPL version does not expose the required error channel");
  return domain;
})();
Object.assign(repl.context, { cua, nodeRepl: Object.freeze({ write: output, emitImage: (value) => {
  if (!active || run.getStore() !== active) throw new Error("Images require an active evaluation");
  channel.send({ type: "output", id: active, content: { type: "image", data: value.data, mimeType: value.mimeType } });
} }), console: Object.freeze({ log: (...values) => output(values.map((v) => typeof v === "string" ? v : inspect(v)).join(" ")), error: output, warn: output }) });
async function evaluate(id, code) {
  active = id;
  let failure;
  let value;
  await run.run(id, () => new Promise((resolve) => {
    const onError = (error) => {
      if (run.getStore() === id) done(error, void 0);
    };
    const done = (error, result) => {
      evaluationDomain.removeListener("error", onError);
      failure = error;
      value = result;
      resolve();
    };
    evaluationDomain.on("error", onError);
    repl.eval(code + "\n", repl.context, "cua_repl", done);
  }));
  active = void 0;
  await Promise.allSettled([...pending.values()].map((item) => item.promise));
  channel.send({ type: "done", id, ...failure ? { error: errorText(failure) } : { value: value === void 0 ? void 0 : inspect(value, { depth: 5, maxArrayLength: 100, maxStringLength: 32768 }) } });
}
channel.send({ type: "ready" });
//# sourceMappingURL=repl-worker.js.map
