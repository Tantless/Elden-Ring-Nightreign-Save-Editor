import { app, BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type BridgeResponse = {
  id: number
  ok: boolean
  result?: unknown
  error?: {
    code: string
    message: string
    detail?: string
  }
}

type SaveMetadata = {
  savePath: string
  mode: string
  defaultExtension: string
}

type SaveTargetInfo = {
  steamIdMismatch: boolean
  currentSteamId: number | null
  targetSteamId: number | null
}

type PythonLaunchConfig = {
  command: string
  args: string[]
  cwd: string
}

class PythonBridge {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: Interface | null = null
  private nextId = 1
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
    }
  >()

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const child = this.ensureStarted()
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      })
      child.stdin.write(`${payload}\n`, 'utf8', (error) => {
        if (error) {
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  stop(): void {
    this.lines?.close()
    this.lines = null
    this.child?.kill()
    this.child = null
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) {
      return this.child
    }

    const launchConfig = this.getLaunchConfig()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8'
    }
    if (app.isPackaged && !env.NIGHTREIGN_ELECTRON_WORK_DIR) {
      env.NIGHTREIGN_ELECTRON_WORK_DIR = join(app.getPath('userData'), 'python-work')
    }

    this.child = spawn(launchConfig.command, launchConfig.args, {
      cwd: launchConfig.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.lines = createInterface({ input: this.child.stdout })
    this.lines.on('line', (line) => this.handleLine(line))
    this.child.stderr.on('data', (chunk) => {
      console.error(`[python] ${chunk.toString('utf8')}`)
    })
    this.child.on('exit', (code, signal) => {
      const error = new Error(`Python bridge exited (${code ?? signal ?? 'unknown'})`)
      for (const { reject } of this.pending.values()) {
        reject(error)
      }
      this.pending.clear()
      this.child = null
    })

    return this.child
  }

  private getLaunchConfig(): PythonLaunchConfig {
    const packagedBridgeName =
      process.platform === 'win32' ? 'NightreignElectronBridge.exe' : 'NightreignElectronBridge'
    const packagedBridge = join(process.resourcesPath, 'python', packagedBridgeName)
    if (app.isPackaged && existsSync(packagedBridge)) {
      return {
        command: packagedBridge,
        args: [],
        cwd: dirname(packagedBridge)
      }
    }

    const projectRoot = resolve(process.cwd(), '..')
    const venvPython = join(projectRoot, '.venv', 'Scripts', 'python.exe')
    const python = process.env.NIGHTREIGN_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python')
    return {
      command: python,
      args: [join(projectRoot, 'src', 'electron_api', 'bridge.py')],
      cwd: projectRoot
    }
  }

  private handleLine(line: string): void {
    let response: BridgeResponse
    try {
      response = JSON.parse(line) as BridgeResponse
    } catch (error) {
      console.error('[python] invalid JSON response', line, error)
      return
    }

    const pending = this.pending.get(response.id)
    if (!pending) {
      return
    }
    this.pending.delete(response.id)

    if (response.ok) {
      pending.resolve(response.result)
    } else {
      const detail = response.error?.detail ? `\n${response.error.detail}` : ''
      pending.reject(new Error(`${response.error?.message ?? 'Python bridge error'}${detail}`))
    }
  }
}

const pythonBridge = new PythonBridge()

const smokePath = (envName: string): string | null => {
  const value = process.env[envName]?.trim()
  return value ? value : null
}

const smokeUserData = smokePath('NIGHTREIGN_ELECTRON_SMOKE_USER_DATA')
if (smokeUserData) {
  app.setPath('userData', smokeUserData)
}

const showOpenDialog = (
  envName: string,
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> => {
  const filePath = smokePath(envName)
  if (filePath) {
    return Promise.resolve({ canceled: false, filePaths: [filePath] })
  }
  return dialog.showOpenDialog(options)
}

const showSaveDialog = (
  envName: string,
  options: Electron.SaveDialogOptions
): Promise<Electron.SaveDialogReturnValue> => {
  const filePath = smokePath(envName)
  if (filePath) {
    return Promise.resolve({ canceled: false, filePath })
  }
  return dialog.showSaveDialog(options)
}

const showSteamResignDialog = (
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> => {
  const response = process.env.NIGHTREIGN_ELECTRON_SMOKE_STEAM_RESPONSE
  if (response !== undefined) {
    return Promise.resolve({
      response: Number.parseInt(response, 10),
      checkboxChecked: false
    })
  }
  return dialog.showMessageBox(options)
}

const saveFiltersForMode = (mode: string): FileFilter[] => {
  if (mode === 'PS') {
    return [
      { name: 'Save File', extensions: ['dat'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }
  if (mode === 'PC') {
    return [
      { name: 'Save File', extensions: ['sl2', 'co2'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }
  return [{ name: 'All Files', extensions: ['*'] }]
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1672,
    height: 937,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#070b14',
    title: 'Elden Ring Nightreign Save Editor',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.NIGHTREIGN_ELECTRON_SMOKE === '1') {
    mainWindow.webContents.on('console-message', (event) => {
      console.log(event.message)
      const resultFile = process.env.NIGHTREIGN_ELECTRON_SMOKE_RESULT_FILE
      if (resultFile && event.message.startsWith('NIGHTREIGN_SMOKE_RESULT ')) {
        writeFileSync(resultFile, event.message.slice('NIGHTREIGN_SMOKE_RESULT '.length), 'utf8')
      }
    })
  }

  const smokeUiScript = smokePath('NIGHTREIGN_ELECTRON_SMOKE_UI_SCRIPT')
  if (smokeUiScript) {
    mainWindow.webContents.once('did-finish-load', () => {
      try {
        const source = readFileSync(smokeUiScript, 'utf8')
        void mainWindow.webContents.executeJavaScript(source, true)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[smoke-ui] ${message}`)
        const resultFile = process.env.NIGHTREIGN_ELECTRON_SMOKE_RESULT_FILE
        if (resultFile) {
          writeFileSync(resultFile, JSON.stringify({ ok: false, error: message }), 'utf8')
        }
        mainWindow.close()
      }
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('dialog:open-save-file', async () => {
  const result = await showOpenDialog('NIGHTREIGN_ELECTRON_SMOKE_OPEN_SAVE', {
    title: 'Open save file',
    properties: ['openFile'],
    filters: [
      { name: 'Save File', extensions: ['sl2', 'co2', 'dat'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return pythonBridge.request('open_save', { filePath: result.filePaths[0] })
})

ipcMain.handle('save:open-last', () => {
  return pythonBridge.request('open_last_save')
})

ipcMain.handle('dialog:open-import-save-file', async () => {
  const result = await showOpenDialog('NIGHTREIGN_ELECTRON_SMOKE_OPEN_IMPORT_SAVE', {
    title: '选择要导入角色的存档',
    properties: ['openFile'],
    filters: [
      { name: 'Save File', extensions: ['sl2', 'co2', 'dat'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return pythonBridge.request('open_import_save', { filePath: result.filePaths[0] })
})

ipcMain.handle('backend:ping', () => {
  return pythonBridge.request('ping')
})

ipcMain.handle('settings:get', () => {
  return pythonBridge.request('get_settings')
})

ipcMain.handle('settings:update', (_event, settings: Record<string, unknown>) => {
  return pythonBridge.request('update_settings', settings)
})

ipcMain.handle('character:load', (_event, index: number) => {
  return pythonBridge.request('load_character', { index })
})

ipcMain.handle('character:replace', (_event, importIndex: number) => {
  return pythonBridge.request('replace_character', { importIndex })
})

ipcMain.handle('stats:update', (_event, field: string, value: number) => {
  return pythonBridge.request('update_stat', { field, value })
})

ipcMain.handle('character:save-current', () => {
  return pythonBridge.request('save_current_character')
})

ipcMain.handle('dialog:save-as', async () => {
  const metadata = await pythonBridge.request<SaveMetadata>('get_save_metadata')
  const result = await showSaveDialog('NIGHTREIGN_ELECTRON_SMOKE_SAVE_AS', {
    title: '保存存档',
    defaultPath: metadata.savePath,
    filters: saveFiltersForMode(metadata.mode),
    properties: ['showOverwriteConfirmation']
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  const targetInfo = await pythonBridge.request<SaveTargetInfo>('get_save_target_info', {
    outputFile: result.filePath
  })
  let resignSteamId = false

  if (targetInfo.steamIdMismatch) {
    const answer = await showSteamResignDialog({
      type: 'warning',
      title: 'Steam ID re-sign',
      message: `目标路径属于 Steam ID ${targetInfo.targetSteamId}，当前存档 Steam ID 为 ${targetInfo.currentSteamId}。`,
      detail: '是否在保存前把存档重新签名到目标 Steam ID？',
      buttons: ['重新签名并保存', '不重新签名', '取消'],
      defaultId: 0,
      cancelId: 2
    })
    if (answer.response === 2) {
      return null
    }
    resignSteamId = answer.response === 0
  }

  return pythonBridge.request('save_as', {
    outputFile: result.filePath,
    resignSteamId
  })
})

ipcMain.handle('relic:add', (_event, relicType: string, count: number) => {
  return pythonBridge.request('add_relic', { relicType, count })
})

ipcMain.handle('relic:delete', (_event, gaHandle: number) => {
  return pythonBridge.request('delete_relic', { gaHandle })
})

ipcMain.handle('relic:delete-many', (_event, gaHandles: number[]) => {
  return pythonBridge.request('delete_relics', { gaHandles })
})

ipcMain.handle('relic:toggle-favorite', (_event, gaHandle: number) => {
  return pythonBridge.request('toggle_favorite_relic', { gaHandle })
})

ipcMain.handle('relic:toggle-favorite-many', (_event, gaHandles: number[]) => {
  return pythonBridge.request('toggle_favorite_relics', { gaHandles })
})

ipcMain.handle('relic:copy-effects', (_event, gaHandles: number[]) => {
  return pythonBridge.request('copy_relic_effects', { gaHandles })
})

ipcMain.handle('relic:paste-effects', (_event, gaHandles: number[], effectsText: string) => {
  return pythonBridge.request('paste_relic_effects', { gaHandles, effectsText })
})

ipcMain.handle('relic:reindex', (_event, targetIndex: number, gaHandles: number[]) => {
  return pythonBridge.request('reindex_relics', { targetIndex, gaHandles })
})

ipcMain.handle('relic:delete-illegal', () => {
  return pythonBridge.request('delete_illegal_relics')
})

ipcMain.handle('relic:mass-fix', () => {
  return pythonBridge.request('mass_fix_relics')
})

ipcMain.handle(
  'relic:update',
  (_event, gaHandle: number, relicId: number, effects: number[]) => {
    return pythonBridge.request('update_relic', { gaHandle, relicId, effects })
  }
)

ipcMain.handle('relic:prepare-edit', (_event, relicId: number, effects: number[]) => {
  return pythonBridge.request('prepare_relic_edit', { relicId, effects })
})

ipcMain.handle('relic:inspect-edit', (_event, relicId: number, effects: number[]) => {
  return pythonBridge.request('inspect_relic_edit', { relicId, effects })
})

ipcMain.handle(
  'relic:change-color',
  (_event, gaHandle: number, relicId: number, effects: number[], targetColor: string) => {
    return pythonBridge.request('change_relic_color', {
      gaHandle,
      relicId,
      effects,
      targetColor
    })
  }
)

ipcMain.handle('relic:list-edit-options', (_event, relicId: number, safeMode: boolean) => {
  return pythonBridge.request('list_relic_edit_options', { relicId, safeMode })
})

ipcMain.handle(
  'relic:list-effect-options',
  (_event, relicId: number, slotIndex: number, effects: number[], safeMode: boolean) => {
    return pythonBridge.request('list_effect_edit_options', {
      relicId,
      slotIndex,
      effects,
      safeMode
    })
  }
)

ipcMain.handle('dialog:export-relics-excel', async () => {
  const result = await showSaveDialog('NIGHTREIGN_ELECTRON_SMOKE_EXPORT_RELICS_EXCEL', {
    title: '导出遗物 Excel',
    defaultPath: 'relics.xlsx',
    filters: [
      { name: 'Excel files', extensions: ['xlsx'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['showOverwriteConfirmation']
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return pythonBridge.request('export_relics_excel', {
    outputFile: result.filePath
  })
})

ipcMain.handle('dialog:import-relics-excel', async () => {
  const result = await showOpenDialog('NIGHTREIGN_ELECTRON_SMOKE_IMPORT_RELICS_EXCEL', {
    title: '导入遗物 Excel',
    properties: ['openFile'],
    filters: [
      { name: 'Excel files', extensions: ['xlsx'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return pythonBridge.request('import_relics_excel', {
    inputFile: result.filePaths[0]
  })
})

ipcMain.handle(
  'vessel:list-relic-options',
  (_event, heroType: number, vesselId: number, slotIndex: number) => {
    return pythonBridge.request('list_vessel_relic_options', { heroType, vesselId, slotIndex })
  }
)

ipcMain.handle('vessel:list', (_event, heroType: number) => {
  return pythonBridge.request('list_vessels', { heroType })
})

ipcMain.handle('preset:list', (_event, heroType: number) => {
  return pythonBridge.request('list_presets', { heroType })
})

ipcMain.handle(
  'vessel:replace-relic',
  (_event, heroType: number, vesselId: number, slotIndex: number, gaHandle: number) => {
    return pythonBridge.request('replace_vessel_relic', {
      heroType,
      vesselId,
      slotIndex,
      gaHandle
    })
  }
)

ipcMain.handle(
  'preset:replace-relic',
  (_event, heroType: number, presetIndex: number, slotIndex: number, gaHandle: number) => {
    return pythonBridge.request('replace_preset_relic', {
      heroType,
      presetIndex,
      slotIndex,
      gaHandle
    })
  }
)

ipcMain.handle(
  'preset:save-vessel',
  (_event, heroType: number, vesselId: number, name: string) => {
    return pythonBridge.request('save_vessel_as_preset', { heroType, vesselId, name })
  }
)

ipcMain.handle('preset:equip', (_event, heroType: number, presetIndex: number) => {
  return pythonBridge.request('equip_preset', { heroType, presetIndex })
})

ipcMain.handle('preset:delete', (_event, heroType: number, presetIndex: number) => {
  return pythonBridge.request('delete_preset', { heroType, presetIndex })
})

ipcMain.handle('preset:rename', (_event, heroType: number, presetIndex: number, name: string) => {
  return pythonBridge.request('rename_preset', { heroType, presetIndex, name })
})

ipcMain.handle('dialog:export-loadout', async (_event, heroType: number, defaultName: string) => {
  const result = await showSaveDialog('NIGHTREIGN_ELECTRON_SMOKE_EXPORT_LOADOUT', {
    title: '保存配装',
    defaultPath: `${defaultName || 'nightreign'}_loadout.json`,
    filters: [
      { name: 'JSON files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['showOverwriteConfirmation']
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return pythonBridge.request('export_loadout', {
    heroType,
    outputFile: result.filePath
  })
})

ipcMain.handle('dialog:preview-import-loadout', async () => {
  const result = await showOpenDialog('NIGHTREIGN_ELECTRON_SMOKE_IMPORT_LOADOUT', {
    title: '加载配装',
    properties: ['openFile'],
    filters: [
      { name: 'JSON files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled) {
    return null
  }

  return pythonBridge.request('preview_import_loadout', {
    inputFile: result.filePaths[0]
  })
})

ipcMain.handle(
  'loadout:apply-import',
  (_event, vesselIndices: number[], presetIndices: number[]) => {
    return pythonBridge.request('apply_import_loadout', { vesselIndices, presetIndices })
  }
)

ipcMain.handle('loadout:cancel-import', () => {
  return pythonBridge.request('cancel_import_loadout')
})

ipcMain.handle('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})

ipcMain.handle('window:toggle-maximize', () => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return
  }
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
})

ipcMain.handle('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

void app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  pythonBridge.stop()
})
