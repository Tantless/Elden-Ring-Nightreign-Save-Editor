const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { tmpdir } = require('node:os')
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
const downloadTimeoutMs = Number.parseInt(process.env.ELECTRON_DOWNLOAD_TIMEOUT_MS || '180000', 10)
const watchdogMs = downloadTimeoutMs + 60000

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

function hasMatchingElectronDist() {
  try {
    const installedVersion = readFileSync(join(distPath, 'version'), 'utf8').replace(/^v/, '').trim()
    return installedVersion === electronVersion && existsSync(installedElectronPath())
  } catch {
    return false
  }
}

function hasUsableElectronBinary() {
  try {
    const installedExecutable = readFileSync(pathFile, 'utf8').trim()
    return (
      hasMatchingElectronDist() &&
      installedExecutable === platformExecutable &&
      existsSync(installedElectronPath())
    )
  } catch {
    return false
  }
}

function repairElectronPathFile() {
  if (!hasMatchingElectronDist()) {
    return false
  }
  writeFileSync(pathFile, platformExecutable, 'utf8')
  return true
}

async function installElectronBinary() {
  const zipName = `electron-v${electronVersion}-${platform}-${arch}.zip`
  const checksums = require(join(electronRoot, 'checksums.json'))
  const expectedSha256 = checksums[zipName]
  if (!expectedSha256) {
    throw new Error(`Electron checksum was not found for ${zipName}`)
  }

  const zipUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`
  const zipPath = join(tmpdir(), zipName)
  console.log(`Downloading ${zipUrl}`)
  await downloadFile(zipUrl, zipPath, downloadTimeoutMs)
  const actualSha256 = sha256File(zipPath)
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Electron download checksum mismatch for ${zipName}: expected ${expectedSha256}, got ${actualSha256}`)
  }

  rmSync(distPath, { recursive: true, force: true })
  mkdirSync(distPath, { recursive: true })
  await extract(zipPath, { dir: distPath })
  unlinkSync(zipPath)

  const extractedTypes = join(distPath, 'electron.d.ts')
  if (existsSync(extractedTypes)) {
    const packageTypes = join(electronRoot, 'electron.d.ts')
    rmSync(packageTypes, { force: true })
    renameSync(extractedTypes, packageTypes)
  }

  writeFileSync(pathFile, platformExecutable, 'utf8')
}

async function downloadFile(url, destination, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`GET ${url} failed with status ${response.status}`)
    }
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
  } finally {
    clearTimeout(timeout)
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

async function main() {
  if (!hasUsableElectronBinary()) {
    if (!repairElectronPathFile()) {
      await installElectronBinary()
    }
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

const watchdog = setTimeout(() => {
  console.error(`Electron binary verification timed out after ${watchdogMs}ms`)
  process.exit(1)
}, watchdogMs)

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => {
    clearTimeout(watchdog)
  })
