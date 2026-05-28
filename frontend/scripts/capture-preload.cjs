const { contextBridge } = require('electron')

const settings = {
  configPath: 'D:\\Elden-Ring-Nightreign-Save-Editor\\src\\editor_config.json',
  lastFile: '',
  lastCharIndex: 0,
  language: 'zh_CN',
  languageName: '简体中文',
  languages: [
    { code: 'en_US', name: 'English' },
    { code: 'zh_CN', name: '简体中文' }
  ],
  theme: 'Dark',
  reduceMessagePop: true,
  autoBackup: true,
  maxBackups: 5
}

contextBridge.exposeInMainWorld('nightreign', {
  getSettings: async () => settings,
  openLastSave: async () => null,
  updateSettings: async (patch) => {
    Object.assign(settings, patch)
    settings.languageName = settings.language === 'zh_CN' ? '简体中文' : 'English'
    return { settings, selectedCharacter: null }
  },
  minimize: async () => undefined,
  toggleMaximize: async () => undefined,
  close: async () => undefined
})
