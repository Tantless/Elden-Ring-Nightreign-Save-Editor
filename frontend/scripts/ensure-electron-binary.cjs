const { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { downloadArtifact } = require('@electron/get')
const extract = require('extract-zip')

const electronPackagePath = require.resolve('electron/package.json')
const electronRoot = dirname(electronPackagePath)
const electronPackage = require(electronPackagePath)
const electronVersion = electronPackage.version
const platform = process.env.npm_config_platform || process.platform
const arch = process.env.npm_config_arch || process.arch
const platformExecutable = electronPlatformExecutable(platform)
const distPath = join(electronRoot, 'dist')
const pathFile = join(electronRoot, 'path.txt')

function electronPlatformExecutable(targetPlatform) {
  switch (targetPlatform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Electron builds are not available on platform: ${targetPlatform}`)
  }
}

function installedElectronPath() {
  return join(distPath, platformExecutable)
}

function hasUsableElectronBinary() {
  try {
    const installedVersion = readFileSync(join(distPath, 'version'), 'utf8').replace(/^v/, '').trim()
    const installedExecutable = readFileSync(pathFile, 'utf8').trim()
    return (
      installedVersion === electronVersion &&
      installedExecutable === platformExecutable &&
      existsSync(installedElectronPath())
    )
  } catch {
    return false
  }
}

async function installElectronBinary() {
  const zipPath = await downloadArtifact({
    version: electronVersion,
    artifactName: 'electron',
    force: true,
    cacheRoot: process.env.electron_config_cache,
    checksums: require(join(electronRoot, 'checksums.json')),
    platform,
    arch
  })

  rmSync(distPath, { recursive: true, force: true })
  mkdirSync(distPath, { recursive: true })
  await extract(zipPath, { dir: distPath })

  const extractedTypes = join(distPath, 'electron.d.ts')
  if (existsSync(extractedTypes)) {
    const packageTypes = join(electronRoot, 'electron.d.ts')
    rmSync(packageTypes, { force: true })
    renameSync(extractedTypes, packageTypes)
  }

  writeFileSync(pathFile, platformExecutable, 'utf8')
}

async function main() {
  if (!hasUsableElectronBinary()) {
    await installElectronBinary()
  }

  const electronPath = require('electron')
  if (!existsSync(electronPath)) {
    throw new Error(`Electron binary was not found after installation: ${electronPath}`)
  }

  console.log(JSON.stringify({
    ok: true,
    electronPath,
    version: electronVersion,
    platform,
    arch
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
