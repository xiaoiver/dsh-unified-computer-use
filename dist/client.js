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
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/settings-locales.ts
var NS = "settings.unified-computer-use";
var en = {
  title: "Computer Use settings",
  native: "Native app control",
  nativeLabel: "Enable native app control",
  nativeHint: "When disabled, Chrome browser automation remains available. macOS manages the system permissions required by native apps.",
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
  nativeHint: "\u5173\u95ED\u540E\u4ECD\u53EF\u4F7F\u7528 Chrome \u6D4F\u89C8\u5668\u64CD\u4F5C\u3002\u539F\u751F\u5E94\u7528\u6240\u9700\u7684\u7CFB\u7EDF\u6743\u9650\u7531 macOS \u7BA1\u7406\u3002",
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

// src/settings-client.ts
function SettingsPanel({ form, t }) {
  const snapshot = (0, import_react.useSyncExternalStore)((listener) => form.subscribe(listener), () => form.getSnapshot());
  const [draft, setDraft] = (0, import_react.useState)(() => draftFrom(snapshot.value));
  const [revision, setRevision] = (0, import_react.useState)(snapshot.revision);
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)();
  const [failed, setFailed] = (0, import_react.useState)(false);
  const [advanced, setAdvanced] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
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
  const hintStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 };
  const labelStyle = { color: "var(--dsw-alias-label-primary)", fontSize: 13, fontWeight: 500, lineHeight: 1.5 };
  const fieldStyle = { padding: "12px 0", borderBottom: "0.5px solid var(--dsw-alias-border-l2)" };
  const number = (key, label, hint) => {
    let invalid2 = false;
    try {
      settingsEdits({ ...draftFrom(), [key]: draft[key] });
    } catch {
      invalid2 = true;
    }
    return (0, import_react.createElement)(import_dsh_client_ui_primitives.SettingsValueField, {
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
  return (0, import_react.createElement)(
    "section",
    { "aria-label": t("title") },
    (0, import_react.createElement)(import_dsh_client_ui_primitives.SettingsForm, {
      labels: { unavailable: t(snapshot.status === "loading" ? "loading" : "unavailable"), readOnly: t("readOnly"), saveFailed: t(message ?? "saveFailed"), save: t("save"), saving: t("saving") },
      state: { available: snapshot.status === "ready", writable, dirty: dirty && writable, invalid, saving, failed },
      onSave: () => {
        void save();
      },
      // Drafts are component-local and disappear on unmount; no shared draft to discard.
      onDiscard: () => {
      },
      children: [
        (0, import_react.createElement)(
          "div",
          { key: "native", style: fieldStyle },
          (0, import_react.createElement)(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 } },
            (0, import_react.createElement)("span", { style: labelStyle }, t("native")),
            (0, import_react.createElement)(import_dsh_client_ui_primitives.Switch, { label: t("nativeLabel"), checked: draft.native, disabled, onChange: (value) => edit("native", value) })
          ),
          (0, import_react.createElement)("p", { style: hintStyle }, t("nativeHint"))
        ),
        (0, import_react.createElement)(
          "div",
          { key: "advanced", style: { paddingTop: 12 } },
          (0, import_react.createElement)(
            import_dsh_client_ui_primitives.DisclosureRow,
            { title: t("advanced"), icon: null, open: advanced, expandable: true, expandOnRowClick: true, onToggle: () => setAdvanced((value) => !value) },
            number("timeoutSeconds", t("timeout"), t("timeoutHint")),
            number("idleSeconds", t("idle"), t("idleHint")),
            number("maxTargets", t("targets"), t("targetsHint"))
          )
        ),
        dirty && revision !== snapshot.revision && !(failed && message === "conflict") ? (0, import_react.createElement)("p", { key: "conflict", role: "status", style: hintStyle }, t("conflict")) : null
      ]
    }),
    message && !failed ? (0, import_react.createElement)("p", { role: "status", style: hintStyle }, t(message)) : null
  );
}
function registerSettings(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "unified-cua: settings dictionaries");
  const form = ctx.configForms.get("unified-computer-use");
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({ name: "plugins.bundle.config", key: "dsh-unified-computer-use", locale: NS, inject: () => ({ form }) }, SettingsPanel));
}

// src/client.ts
var inject = ["slots", "configForms", "locale"];
function apply(ctx) {
  registerSettings(ctx);
}

return module.exports;}});
