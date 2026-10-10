window.__ModuleLoader__.load({id:"dsh-unified-computer-use",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// src/settings-client.ts
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/settings-locales.ts
var NS = "settings.unified-computer-use";
var en = {
  title: "Computer Use settings",
  native: "Native app control",
  nativeLabel: "Enable native app control",
  nativeHint: "Allow reading and controlling native apps. Chrome browser automation remains available when disabled.",
  permissionsTitle: "macOS permissions",
  permissionsHint: "Required on the computer running DSH. Status refreshes automatically when you return to this window.",
  permissionAccessibility: "Accessibility",
  permissionAccessibilityHint: "Read app content and control the keyboard and pointer.",
  permissionScreenRecording: "Screen Recording",
  permissionScreenRecordingHint: "Capture screenshots of native apps.",
  permissionChecking: "Checking\u2026",
  granted: "Granted",
  notGranted: "Not granted",
  unsupported: "Not applicable",
  permissionOpenSettings: "Open System Settings",
  permissionsAuthorize: "Authorize required permissions",
  permissionsFailed: "Could not read permission status. Reopen this page to retry, or view the error details.",
  permissionsRequestFailed: "The permission request did not complete. Return to this window to refresh the status before requesting again.",
  permissionsSettingsFailed: "Could not open System Settings. You can open Privacy & Security manually.",
  permissionsErrorDetails: "Error details",
  permissionsUnsupported: "This setup is for macOS Hosts. Native permissions on other systems are managed by their operating system.",
  permissionsEnableFirst: "Enable Native app control and save to authorize.",
  permissionsPending: "Complete authorization in System Settings, then return here to refresh the status. If macOS asks you to restart DSH, fully quit and reopen it.",
  permissionsOnboardingTitle: "Set up native app access",
  permissionsOnboardingHint: "Before your first native app task, check Accessibility and Screen Recording in this plugin\u2019s settings. You can use Chrome browser automation immediately.",
  permissionsConfigure: "Set up permissions",
  permissionsLater: "Later",
  advanced: "Advanced settings",
  timeout: "Call timeout (seconds)",
  timeoutHint: "1\u2013120 seconds; default 30. The tool can specify a timeout for an individual call.",
  idle: "Idle cleanup (seconds)",
  idleHint: "10\u20133600 seconds; default 600. Starts after the next call finishes; expiry releases the interpreter and tabs.",
  targets: "Native target limit",
  targetsHint: "1\u201332; default 12. Lowering the limit does not close existing targets. The browser limit is 12.",
  loading: "Loading settings\u2026",
  unavailable: "Settings are unavailable on this connection. Open this plugin in local DSH Desktop.",
  readOnly: "Settings are read-only on this connection.",
  invalidNumber: "Enter a valid number within the indicated range.",
  save: "Save",
  saving: "Saving\u2026",
  saved: "Saved. Subsequent operations use the new settings; calls already running keep their timeout.",
  saveFailed: "Settings could not be saved. Your edits have been kept; try again.",
  conflict: "Settings changed elsewhere. Reopen this plugin page to load the latest values, then make your changes again. Unsaved edits will be discarded."
};
var zh = {
  title: "Computer Use \u8BBE\u7F6E",
  native: "\u539F\u751F\u5E94\u7528\u64CD\u4F5C",
  nativeLabel: "\u542F\u7528\u539F\u751F\u5E94\u7528\u64CD\u4F5C",
  nativeHint: "\u5141\u8BB8\u8BFB\u53D6\u548C\u64CD\u4F5C\u539F\u751F\u5E94\u7528\u3002\u5173\u95ED\u540E\u4ECD\u53EF\u4F7F\u7528 Chrome \u6D4F\u89C8\u5668\u64CD\u4F5C\u3002",
  permissionsTitle: "macOS \u7CFB\u7EDF\u6743\u9650",
  permissionsHint: "\u9700\u5728\u8FD0\u884C DSH \u7684\u7535\u8111\u4E0A\u6388\u6743\u3002\u8FD4\u56DE\u6B64\u7A97\u53E3\u65F6\u4F1A\u81EA\u52A8\u66F4\u65B0\u72B6\u6001\u3002",
  permissionAccessibility: "\u8F85\u52A9\u529F\u80FD",
  permissionAccessibilityHint: "\u8BFB\u53D6\u5E94\u7528\u5185\u5BB9\uFF0C\u5E76\u64CD\u4F5C\u952E\u76D8\u548C\u6307\u9488\u3002",
  permissionScreenRecording: "\u5C4F\u5E55\u5F55\u5236",
  permissionScreenRecordingHint: "\u622A\u53D6\u539F\u751F\u5E94\u7528\u7684\u753B\u9762\u3002",
  permissionChecking: "\u6B63\u5728\u68C0\u6D4B\u2026",
  granted: "\u5DF2\u6388\u6743",
  notGranted: "\u672A\u6388\u6743",
  unsupported: "\u4E0D\u9002\u7528",
  permissionOpenSettings: "\u6253\u5F00\u7CFB\u7EDF\u8BBE\u7F6E",
  permissionsAuthorize: "\u6388\u6743\u6240\u9700\u6743\u9650",
  permissionsFailed: "\u65E0\u6CD5\u8BFB\u53D6\u6743\u9650\u72B6\u6001\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u6B64\u9875\u9762\u91CD\u8BD5\uFF0C\u6216\u67E5\u770B\u9519\u8BEF\u8BE6\u60C5\u3002",
  permissionsRequestFailed: "\u6743\u9650\u7533\u8BF7\u672A\u5B8C\u6210\u3002\u8BF7\u8FD4\u56DE\u6B64\u7A97\u53E3\u66F4\u65B0\u72B6\u6001\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u518D\u6B21\u7533\u8BF7\u3002",
  permissionsSettingsFailed: "\u65E0\u6CD5\u6253\u5F00\u7CFB\u7EDF\u8BBE\u7F6E\u3002\u4F60\u53EF\u4EE5\u624B\u52A8\u6253\u5F00\u201C\u9690\u79C1\u4E0E\u5B89\u5168\u6027\u201D\u3002",
  permissionsErrorDetails: "\u9519\u8BEF\u8BE6\u60C5",
  permissionsUnsupported: "\u6B64\u6388\u6743\u6D41\u7A0B\u9002\u7528\u4E8E macOS Host\uFF1B\u5176\u4ED6\u7CFB\u7EDF\u7684\u539F\u751F\u6743\u9650\u7531\u5BF9\u5E94\u64CD\u4F5C\u7CFB\u7EDF\u7BA1\u7406\u3002",
  permissionsEnableFirst: "\u8BF7\u5148\u5F00\u542F\u539F\u751F\u5E94\u7528\u64CD\u4F5C\u5E76\u4FDD\u5B58\uFF0C\u518D\u7533\u8BF7\u6743\u9650\u3002",
  permissionsPending: "\u8BF7\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u5B8C\u6210\u6388\u6743\uFF0C\u8FD4\u56DE\u6B64\u7A97\u53E3\u540E\u4F1A\u81EA\u52A8\u66F4\u65B0\u72B6\u6001\u3002\u82E5 macOS \u63D0\u793A\u91CD\u542F DSH\uFF0C\u8BF7\u5B8C\u5168\u9000\u51FA\u540E\u91CD\u65B0\u6253\u5F00\u3002",
  permissionsOnboardingTitle: "\u8BBE\u7F6E\u539F\u751F\u5E94\u7528\u8BBF\u95EE\u6743\u9650",
  permissionsOnboardingHint: "\u9996\u6B21\u64CD\u4F5C\u539F\u751F\u5E94\u7528\u524D\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u68C0\u6D4B\u8F85\u52A9\u529F\u80FD\u548C\u5C4F\u5E55\u5F55\u5236\u6743\u9650\u3002Chrome \u6D4F\u89C8\u5668\u64CD\u4F5C\u53EF\u7ACB\u5373\u4F7F\u7528\u3002",
  permissionsConfigure: "\u8BBE\u7F6E\u6743\u9650",
  permissionsLater: "\u7A0D\u540E\u8BBE\u7F6E",
  advanced: "\u9AD8\u7EA7\u8BBE\u7F6E",
  timeout: "\u5355\u6B21\u8C03\u7528\u8D85\u65F6\uFF08\u79D2\uFF09",
  timeoutHint: "1\u2013120 \u79D2\uFF0C\u9ED8\u8BA4 30 \u79D2\u3002\u5DE5\u5177\u53EF\u4E3A\u5355\u6B21\u8C03\u7528\u6307\u5B9A\u65F6\u9650\u3002",
  idle: "\u7A7A\u95F2\u91CA\u653E\u65F6\u95F4\uFF08\u79D2\uFF09",
  idleHint: "10\u20133600 \u79D2\uFF0C\u9ED8\u8BA4 600 \u79D2\u3002\u540E\u7EED\u8C03\u7528\u7ED3\u675F\u540E\u5F00\u59CB\u8BA1\u65F6\uFF0C\u5230\u671F\u6E05\u7406\u89E3\u91CA\u5668\u548C\u6807\u7B7E\u3002",
  targets: "\u539F\u751F\u76EE\u6807\u6570\u91CF\u4E0A\u9650",
  targetsHint: "1\u201332 \u4E2A\uFF0C\u9ED8\u8BA4 12 \u4E2A\u3002\u964D\u4F4E\u4E0A\u9650\u4E0D\u5173\u95ED\u5DF2\u6709\u76EE\u6807\uFF1B\u6D4F\u89C8\u5668\u4E0A\u9650\u4E3A 12 \u4E2A\u3002",
  loading: "\u6B63\u5728\u52A0\u8F7D\u8BBE\u7F6E\u2026",
  unavailable: "\u5F53\u524D\u8FDE\u63A5\u65E0\u6CD5\u8BFB\u53D6\u8BBE\u7F6E\uFF0C\u8BF7\u5728\u672C\u673A DSH Desktop \u4E2D\u6253\u5F00\u6B64\u63D2\u4EF6\u3002",
  readOnly: "\u5F53\u524D\u8FDE\u63A5\u7684\u8BBE\u7F6E\u4E3A\u53EA\u8BFB\u3002",
  invalidNumber: "\u8BF7\u8F93\u5165\u63D0\u793A\u8303\u56F4\u5185\u7684\u6709\u6548\u6570\u503C\u3002",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saved: "\u5DF2\u4FDD\u5B58\u3002\u540E\u7EED\u64CD\u4F5C\u4F7F\u7528\u65B0\u8BBE\u7F6E\uFF1B\u6B63\u5728\u6267\u884C\u7684\u8C03\u7528\u4FDD\u7559\u539F\u8D85\u65F6\u65F6\u9650\u3002",
  saveFailed: "\u8BBE\u7F6E\u672A\u80FD\u4FDD\u5B58\uFF0C\u5DF2\u4FDD\u7559\u4F60\u7684\u4FEE\u6539\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  conflict: "\u8BBE\u7F6E\u5DF2\u5728\u5176\u4ED6\u4F4D\u7F6E\u66F4\u65B0\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u63D2\u4EF6\u9875\u9762\uFF0C\u52A0\u8F7D\u6700\u65B0\u503C\u540E\u518D\u4FEE\u6539\uFF1B\u672A\u4FDD\u5B58\u7684\u7F16\u8F91\u5C06\u88AB\u653E\u5F03\u3002"
};

// src/settings-model.ts
function draftFrom(value) {
  return { native: value?.native ?? true, timeoutSeconds: String((value?.timeoutMs ?? 3e4) / 1e3), idleSeconds: String((value?.idleTimeoutMs ?? 6e5) / 1e3), maxTargets: String(value?.maxTargets ?? 12) };
}
function settingsEdits(draft) {
  function number(value, scale, min, max, label) {
    const parsed = Math.round(Number(value) * scale);
    const format = scale === 1 ? /^\d+$/ : /^\d+(?:\.\d{1,3})?$/;
    if (!format.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}\u8D85\u51FA\u5141\u8BB8\u8303\u56F4\u6216\u683C\u5F0F\u4E0D\u6B63\u786E`);
    return parsed;
  }
  if (typeof draft.native !== "boolean") throw new Error("\u8BBE\u7F6E\u9009\u9879\u65E0\u6548");
  const values = {
    native: draft.native,
    timeoutMs: number(draft.timeoutSeconds, 1e3, 1e3, 12e4, "\u8C03\u7528\u8D85\u65F6"),
    idleTimeoutMs: number(draft.idleSeconds, 1e3, 1e4, 36e5, "\u7A7A\u95F2\u91CA\u653E\u65F6\u95F4"),
    maxTargets: number(draft.maxTargets, 1, 1, 32, "\u76EE\u6807\u4E0A\u9650")
  };
  return Object.entries(values).map(([key, value]) => ({ op: "set", path: [key], value }));
}

// src/permissions-panel.ts
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/permissions-model.ts
function diagnostic(error) {
  const object = error && typeof error === "object" ? error : void 0;
  const message = typeof object?.message === "string" ? object.message : String(error);
  const code = typeof object?.code === "string" ? object.code.slice(0, 100) : void 0;
  return { message: message.slice(0, 1e3), ...code ? { code } : {} };
}
var PermissionSetup = class {
  constructor(api, timeoutMs = 3e4) {
    this.api = api;
    this.timeoutMs = timeoutMs;
  }
  state = { busy: false, requested: false };
  listeners = /* @__PURE__ */ new Set();
  pending;
  generation = 0;
  active = false;
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  start() {
    this.active = true;
    void this.query();
  }
  stop() {
    this.active = false;
    this.generation++;
    this.pending = void 0;
  }
  query = () => this.run("query", () => this.api.query());
  request = () => this.run("request", () => this.api.request());
  openSettings = (permission) => this.run("openSettings", () => this.api.openSettings(permission));
  publish(state) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  run(operation, action) {
    if (!this.active) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    this.publish({ ...this.state, busy: true, failure: void 0 });
    const current = () => this.active && this.generation === generation;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Permission operation timed out. Recheck the current status before requesting again.")), this.timeoutMs);
    });
    const pending = (async () => {
      try {
        const status = await Promise.race([Promise.resolve().then(() => {
          if (!current()) throw new Error("Permission view was closed");
          return action();
        }), timeout]);
        if (current()) this.publish({ status, busy: false, requested: this.state.requested || operation === "request" });
      } catch (error) {
        if (current()) this.publish({ busy: false, requested: this.state.requested, failure: { operation, ...diagnostic(error) } });
      } finally {
        clearTimeout(timer);
        if (this.generation === generation) this.pending = void 0;
      }
    })();
    this.pending = pending;
    return pending;
  }
};

// src/permissions-panel.ts
var hintStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, margin: "6px 0", lineHeight: 1.5 };
function PermissionsPanel({ api, nativeEnabled, t }) {
  const setup = (0, import_react.useMemo)(() => new PermissionSetup(api), [api]);
  const snapshot = (0, import_react.useSyncExternalStore)(setup.subscribe, setup.getSnapshot);
  const { status: state, busy, failure, requested } = snapshot;
  (0, import_react.useEffect)(() => {
    setup.start();
    const focus = () => {
      void setup.query();
    };
    window.addEventListener("focus", focus);
    return () => {
      setup.stop();
      window.removeEventListener("focus", focus);
    };
  }, [setup, nativeEnabled]);
  const mac = state?.platform === "darwin";
  const canRequest = mac && state.nativeEnabled && !busy;
  const granted = state?.accessibility === "granted" && state.screenRecording === "granted";
  const row = (permission, label, hint) => (0, import_react.createElement)(
    "div",
    { key: permission, style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 24px", padding: "10px 0" } },
    (0, import_react.createElement)(
      "div",
      { style: { flex: "1 1 220px", minWidth: 0 } },
      (0, import_react.createElement)("div", { style: { fontSize: 13 } }, label),
      (0, import_react.createElement)("p", { style: { ...hintStyle, margin: "3px 0 0" } }, hint)
    ),
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8 } },
      (0, import_react.createElement)(import_dsh_client_ui_primitives.StateDot, { state: state?.[permission] === "granted" ? "done" : state?.[permission] === "unsupported" ? "idle" : state ? "warning" : "ongoing" }),
      (0, import_react.createElement)("span", { style: { fontSize: 12 }, role: "status" }, t(state?.[permission] ?? "permissionChecking"))
    ),
    mac && state?.[permission] === "notGranted" ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { size: "sm", type: "button", disabled: !canRequest, "aria-label": `${t("permissionOpenSettings")}: ${label}`, onClick: () => {
      void setup.openSettings(permission);
    } }, t("permissionOpenSettings")) : null
  );
  return (0, import_react.createElement)(
    "section",
    { "aria-label": t("permissionsTitle"), "aria-busy": busy, style: { marginTop: 20 } },
    (0, import_react.createElement)("h3", { style: { fontSize: 13, fontWeight: 500, margin: 0, color: "var(--dsw-alias-label-primary)" } }, t("permissionsTitle")),
    (0, import_react.createElement)("p", { style: hintStyle }, t("permissionsHint")),
    failure ? (0, import_react.createElement)(
      "div",
      { role: "alert" },
      (0, import_react.createElement)("p", { style: hintStyle }, t(failure.operation === "request" ? "permissionsRequestFailed" : failure.operation === "openSettings" ? "permissionsSettingsFailed" : "permissionsFailed")),
      (0, import_react.createElement)(
        "details",
        { style: hintStyle },
        (0, import_react.createElement)("summary", null, t("permissionsErrorDetails")),
        (0, import_react.createElement)("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, [failure.code, failure.message].filter(Boolean).join(": "))
      )
    ) : null,
    state || !failure ? [row("accessibility", t("permissionAccessibility"), t("permissionAccessibilityHint")), row("screenRecording", t("permissionScreenRecording"), t("permissionScreenRecordingHint"))] : null,
    state && !mac ? (0, import_react.createElement)("p", { style: hintStyle }, t("permissionsUnsupported")) : null,
    mac && !state.nativeEnabled ? (0, import_react.createElement)("p", { style: hintStyle }, t("permissionsEnableFirst")) : null,
    requested && mac && !granted ? (0, import_react.createElement)("p", { role: "status", style: hintStyle }, t("permissionsPending")) : null,
    mac && !granted ? (0, import_react.createElement)(
      "div",
      { style: { marginTop: 10 } },
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", type: "button", disabled: !canRequest, onClick: () => {
        void setup.request();
      } }, t("permissionsAuthorize"))
    ) : null
  );
}
function PermissionsOnboarding({ onOpenDetails, onDismiss, t }) {
  return (0, import_react.createElement)(
    "section",
    { "aria-label": t("permissionsOnboardingTitle") },
    (0, import_react.createElement)("p", { style: { fontSize: 13, fontWeight: 500, margin: "0 0 6px" } }, t("permissionsOnboardingTitle")),
    (0, import_react.createElement)("p", { style: hintStyle }, t("permissionsOnboardingHint")),
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", type: "button", onClick: onOpenDetails }, t("permissionsConfigure")),
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { size: "sm", type: "button", onClick: onDismiss }, t("permissionsLater"))
    )
  );
}

// src/settings-client.ts
function SettingsPanel({ form, permissions, t }) {
  const snapshot = (0, import_react2.useSyncExternalStore)((listener) => form.subscribe(listener), () => form.getSnapshot());
  const [draft, setDraft] = (0, import_react2.useState)(() => draftFrom(snapshot.value));
  const [revision, setRevision] = (0, import_react2.useState)(snapshot.revision);
  const [dirty, setDirty] = (0, import_react2.useState)(false);
  const [saving, setSaving] = (0, import_react2.useState)(false);
  const [message, setMessage] = (0, import_react2.useState)();
  const [failed, setFailed] = (0, import_react2.useState)(false);
  const [advanced, setAdvanced] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
    if (!dirty && !saving) {
      setDraft(draftFrom(snapshot.value));
      setRevision(snapshot.revision);
    }
  }, [snapshot, dirty, saving]);
  const writable = snapshot.status === "ready" && snapshot.writable && snapshot.mode === "host" && snapshot.revision !== void 0;
  const edit = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setMessage(void 0);
    setFailed(false);
  };
  async function save() {
    if (!writable || saving || revision === void 0) return;
    setSaving(true);
    setMessage(void 0);
    setFailed(false);
    try {
      const accepted = await form.mutate(settingsEdits(draft), revision);
      if (!accepted) {
        setFailed(true);
        setMessage(form.getSnapshot().revision !== revision ? "conflict" : "saveFailed");
        return;
      }
      setDirty(false);
      setMessage("saved");
    } catch {
      setFailed(true);
      setMessage("saveFailed");
    } finally {
      setSaving(false);
    }
  }
  const disabled = !writable || saving;
  let invalid = false;
  try {
    settingsEdits(draft);
  } catch {
    invalid = true;
  }
  const hintStyle2 = { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 };
  const labelStyle = { color: "var(--dsw-alias-label-primary)", fontSize: 13, fontWeight: 500, lineHeight: 1.5 };
  const fieldStyle = { padding: "12px 0", borderBottom: "0.5px solid var(--dsw-alias-border-l2)" };
  const number = (key, label, hint) => {
    let invalid2 = false;
    try {
      settingsEdits({ ...draftFrom(), [key]: draft[key] });
    } catch {
      invalid2 = true;
    }
    return (0, import_react2.createElement)(import_dsh_client_ui_primitives2.SettingsValueField, {
      id: `cua-settings-${key}`,
      label,
      hint,
      numeric: true,
      text: draft[key],
      disabled,
      invalid: invalid2,
      // Shared field requires reset props; this form deliberately exposes no reset action.
      overridden: false,
      overriddenLabel: "",
      resetLabel: "",
      invalidLabel: t("invalidNumber"),
      onEdit: (value) => edit(key, value),
      onReset: () => {
      }
    });
  };
  return (0, import_react2.createElement)(
    "section",
    { "aria-label": t("title") },
    (0, import_react2.createElement)(import_dsh_client_ui_primitives2.SettingsForm, {
      labels: { unavailable: t(snapshot.status === "loading" ? "loading" : "unavailable"), readOnly: t("readOnly"), saveFailed: t(message ?? "saveFailed"), save: t("save"), saving: t("saving") },
      state: { available: snapshot.status === "ready", writable, dirty: dirty && writable, invalid, saving, failed },
      onSave: () => {
        void save();
      },
      // Drafts are component-local and disappear on unmount; no shared draft to discard.
      onDiscard: () => {
      },
      children: [
        (0, import_react2.createElement)(
          "div",
          { key: "native", style: fieldStyle },
          (0, import_react2.createElement)(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 } },
            (0, import_react2.createElement)("span", { style: labelStyle }, t("native")),
            (0, import_react2.createElement)(import_dsh_client_ui_primitives2.Switch, { label: t("nativeLabel"), checked: draft.native, disabled, onChange: (value) => edit("native", value) })
          ),
          (0, import_react2.createElement)("p", { style: hintStyle2 }, t("nativeHint")),
          (0, import_react2.createElement)(PermissionsPanel, { api: permissions, nativeEnabled: snapshot.value?.native ?? true, t })
        ),
        (0, import_react2.createElement)(
          "div",
          { key: "advanced", style: { paddingTop: 12 } },
          (0, import_react2.createElement)(
            import_dsh_client_ui_primitives2.DisclosureRow,
            { title: t("advanced"), icon: null, open: advanced, expandable: true, expandOnRowClick: true, onToggle: () => setAdvanced((value) => !value) },
            number("timeoutSeconds", t("timeout"), t("timeoutHint")),
            number("idleSeconds", t("idle"), t("idleHint")),
            number("maxTargets", t("targets"), t("targetsHint"))
          )
        ),
        dirty && revision !== snapshot.revision && !(failed && message === "conflict") ? (0, import_react2.createElement)("p", { key: "conflict", role: "status", style: hintStyle2 }, t("conflict")) : null
      ]
    }),
    message && !failed ? (0, import_react2.createElement)("p", { role: "status", style: hintStyle2 }, t(message)) : null
  );
}
function registerSettings(ctx, permissions) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "unified-cua: settings dictionaries");
  const form = ctx.configForms.get("unified-computer-use");
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({ name: "plugins.bundle.config", key: "dsh-unified-computer-use", locale: NS, inject: () => ({ form, permissions }) }, SettingsPanel));
  ctx.slots.inject("plugins.bundle.activation", () => ctx.slots.register({ name: "plugins.bundle.activation", key: "dsh-unified-computer-use", locale: NS }, PermissionsOnboarding));
}

// src/permissions-contract.ts
var permissionSchema = {
  parse(value) {
    if (value !== "accessibility" && value !== "screenRecording") throw new TypeError("Unknown permission");
    return value;
  }
};
function isStatus(value) {
  return value === "granted" || value === "notGranted" || value === "unsupported";
}
var permissionsSchema = {
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid permission state");
    const raw = value;
    const fields = ["platform", "nativeEnabled", "accessibility", "screenRecording"];
    if (Object.keys(raw).length !== fields.length || fields.some((key) => !Object.hasOwn(raw, key))) throw new TypeError("Invalid permission state fields");
    if (typeof raw.platform !== "string" || typeof raw.nativeEnabled !== "boolean" || !isStatus(raw.accessibility) || !isStatus(raw.screenRecording)) throw new TypeError("Invalid permission state values");
    return { platform: raw.platform, nativeEnabled: raw.nativeEnabled, accessibility: raw.accessibility, screenRecording: raw.screenRecording };
  }
};
var packageName = "dsh-unified-computer-use";
var namespace = "unifiedCuaPermissions";
var descriptors = ["query", "request", "openSettings"].map((method) => ({
  id: `${packageName}#${namespace}/${method}`,
  service: namespace,
  namespace,
  method,
  invocation: { kind: "direct" },
  parameters: method === "openSettings" ? [{
    name: "permission",
    wire: "permission",
    source: "json",
    codec: { mode: "strict", typeSymbol: `${packageName}#permission`, create: () => permissionSchema }
  }] : [],
  result: { mode: "strict", typeSymbol: `${packageName}#permissions`, create: () => permissionsSchema }
}));
var permissionsRemote = { package: packageName, descriptors };

// src/permissions-client.ts
function unwrap(result) {
  if (!result.ok) throw result.error;
  return permissionsSchema.parse(result.value);
}
function permissionsApi(remote) {
  return {
    query: async () => unwrap(await remote.unifiedCuaPermissions.query()),
    request: async () => unwrap(await remote.unifiedCuaPermissions.request()),
    openSettings: async (permission) => unwrap(await remote.unifiedCuaPermissions.openSettings(permission))
  };
}
async function mountPermissionsClient(ctx, ready) {
  await ctx.effect(() => ctx.remote.$mount(permissionsRemote));
  ctx.inject(["remote.unifiedCuaPermissions"], (scoped) => {
    ready(scoped, permissionsApi(scoped.remote));
  });
}

// src/client.ts
var inject = ["slots", "configForms", "locale", "remote"];
async function apply(ctx) {
  await mountPermissionsClient(ctx, registerSettings);
}

return module.exports;}});
