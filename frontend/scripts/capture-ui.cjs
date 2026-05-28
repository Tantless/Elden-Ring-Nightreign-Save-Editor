const { app, BrowserWindow } = require('electron')
const { mkdir, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function capture(window, name) {
  await wait(500)
  const image = await window.webContents.capturePage()
  await writeFile(join('out', `${name}.png`), image.toPNG())
  console.log(`captured ${name}`)
}

async function clickNav(window, label) {
  await window.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.nav-item'))
      .find((node) => node.textContent.includes(${JSON.stringify(label)}))
      ?.click()
  `)
}

app.whenReady().then(async () => {
  const failSafe = setTimeout(() => {
    console.error('capture timed out')
    app.exit(1)
  }, 20000)

  try {
    await mkdir('out', { recursive: true })

    const window = new BrowserWindow({
      width: 1672,
      height: 937,
      show: false,
      backgroundColor: '#070b14',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(process.cwd(), 'scripts', 'capture-preload.cjs'),
        offscreen: true,
        sandbox: false
      }
    })

    window.webContents.on('did-fail-load', (_event, code, description) => {
      console.error(`renderer failed to load: ${code} ${description}`)
    })

    await window.loadFile(join(process.cwd(), 'out', 'renderer', 'index.html'))
    await capture(window, 'preview-files')
    await clickNav(window, '遗物')
    await capture(window, 'preview-relics')
    await clickNav(window, '圣杯')
    await capture(window, 'preview-vessels')
    await window.webContents.executeJavaScript('document.querySelector(".main-panel")?.scrollTo(0, document.querySelector(".main-panel")?.scrollHeight ?? 0)')
    await capture(window, 'preview-vessels-presets')
    await clickNav(window, '设置')
    await capture(window, 'preview-settings')
    clearTimeout(failSafe)
    app.quit()
  } catch (error) {
    clearTimeout(failSafe)
    console.error(error)
    app.exit(1)
  }
})
