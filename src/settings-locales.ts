/** Settings copy registered with DSH's locale service, like official plugin forms. */
export const NS = 'settings.unified-computer-use'
export const en = {
  title: 'Computer Use settings',
  approval: 'Execution approval',
  ask: 'Ask every time (default)',
  inherit: 'Follow DSH policy',
  askHint: 'Request approval for each tool call. One call may contain multiple operations.',
  inheritHint: 'The plugin adds no extra confirmation. DSH may still require approval or deny execution.',
  native: 'Native app control',
  nativeLabel: 'Enable native app control',
  nativeHint: 'When disabled, only the built-in browser remains available. macOS manages the system permissions required by native apps.',
  advanced: 'Advanced settings',
  timeout: 'Call timeout (seconds)',
  timeoutHint: '1–120 seconds; default 30. The tool can specify a timeout for an individual call.',
  idle: 'Idle cleanup (seconds)',
  idleHint: '10–3600 seconds; default 600. Starts after the next call finishes; expiry releases the interpreter and tabs.',
  targets: 'Native target limit',
  targetsHint: '1–32; default 12. Lowering the limit does not close existing targets. The browser limit is 12.',
  loading: 'Loading settings…',
  unavailable: 'Settings are unavailable on this connection. Open this plugin in local DSH Desktop.',
  readOnly: 'Settings are read-only on this connection.',
  invalidNumber: 'Enter a valid number within the indicated range.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved. Subsequent operations use the new settings; calls already running keep their timeout.',
  saveFailed: 'Settings could not be saved. Your edits have been kept; try again.',
  conflict: 'Settings changed elsewhere. Reopen this plugin page to load the latest values, then make your changes again. Unsaved edits will be discarded.',
}
export type SettingsLocaleKey = keyof typeof en
export const zh: Record<SettingsLocaleKey, string> = {
  title: 'Computer Use 设置',
  approval: '执行确认',
  ask: '每次确认（默认）',
  inherit: '跟随 DSH 策略',
  askHint: '每段工具调用请求批准，一段可以包含多个操作。',
  inheritHint: '插件不额外请求确认。DSH 自身仍可要求审批或拒绝。',
  native: '原生应用操作',
  nativeLabel: '启用原生应用操作',
  nativeHint: '关闭后仅保留内置浏览器操作。原生应用所需的系统权限由 macOS 管理。',
  advanced: '高级设置',
  timeout: '单次调用超时（秒）',
  timeoutHint: '1–120 秒，默认 30 秒。工具可为单次调用指定时限。',
  idle: '空闲释放时间（秒）',
  idleHint: '10–3600 秒，默认 600 秒。后续调用结束后开始计时，到期清理解释器和标签。',
  targets: '原生目标数量上限',
  targetsHint: '1–32 个，默认 12 个。降低上限不关闭已有目标；浏览器上限为 12 个。',
  loading: '正在加载设置…',
  unavailable: '当前连接无法读取设置，请在本机 DSH Desktop 中打开此插件。',
  readOnly: '当前连接的设置为只读。',
  invalidNumber: '请输入提示范围内的有效数值。',
  save: '保存',
  saving: '保存中…',
  saved: '已保存。后续操作使用新设置；正在执行的调用保留原超时时限。',
  saveFailed: '设置未能保存，已保留你的修改，请重试。',
  conflict: '设置已在其他位置更新。请重新打开插件页面，加载最新值后再修改；未保存的编辑将被放弃。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.unified-computer-use': SettingsLocaleKey
  }
}
