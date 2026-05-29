const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } = require('node:fs')
const https = require('node:https')
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
const downloadTimeoutMs = Number.parseInt(process.env.ELECTRON_DOWNLOAD_TIMEOUT_MS || '120000', 10)
const downloadAttempts = Number.parseInt(process.env.ELECTRON_DOWNLOAD_ATTEMPTS || '3', 10)
const downloadStallTimeoutMs = Number.parseInt(process.env.ELECTRON_DOWNLOAD_STALL_TIMEOUT_MS || '30000', 10)
const extractTimeoutMs = Number.parseInt(process.env.ELECTRON_EXTRACT_TIMEOUT_MS || '120000', 10)
const watchdogMs = downloadTimeoutMs * downloadAttempts + extractTimeoutMs + 60000
let curlAvailability = null

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

  const zipUrls = electronDownloadUrls(zipName)
  const zipPath = join(tmpdir(), zipName)
  await downloadFileWithRetries(zipUrls, zipPath, downloadTimeoutMs, downloadAttempts)
  console.log(`Verifying Electron download checksum for ${zipName}`)
  const actualSha256 = sha256File(zipPath)
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Electron download checksum mismatch for ${zipName}: expected ${expectedSha256}, got ${actualSha256}`)
  }

  rmSync(distPath, { recursive: true, force: true })
  mkdirSync(distPath, { recursive: true })
  console.log(`Extracting ${zipName} to ${distPath}`)
  await extractElectronZip(zipPath, distPath)
  console.log(`Extracted ${zipName}`)
  unlinkSync(zipPath)

  const extractedTypes = join(distPath, 'electron.d.ts')
  if (existsSync(extractedTypes)) {
    const packageTypes = join(electronRoot, 'electron.d.ts')
    rmSync(packageTypes, { force: true })
    renameSync(extractedTypes, packageTypes)
  }

  writeFileSync(pathFile, platformExecutable, 'utf8')
}

async function extractElectronZip(zipPath, destination) {
  if (process.platform === 'win32') {
    extractElectronZipWithTar(zipPath, destination)
    return
  }
  await extract(zipPath, { dir: destination })
}

function extractElectronZipWithTar(zipPath, destination) {
  console.log(`Extracting Electron zip with tar.exe (timeout ${Math.ceil(extractTimeoutMs / 1000)}s)`)
  const result = spawnSync('tar.exe', ['-xf', zipPath, '-C', destination], {
    stdio: 'inherit',
    timeout: extractTimeoutMs
  })
  if (result.error) {
    throw result.error
  }
  if (result.signal) {
    throw new Error(`tar.exe was terminated by signal ${result.signal}`)
  }
  if (result.status !== 0) {
    throw new Error(`tar.exe exited with status ${result.status}`)
  }
}

function electronDownloadUrls(zipName) {
  const customUrls = process.env.ELECTRON_DOWNLOAD_URLS
  if (customUrls) {
    return uniqueUrls(customUrls.split(/[|,]/).map((url) => url.trim()).filter(Boolean))
  }

  const configuredMirror = process.env.ELECTRON_MIRROR || process.env.npm_config_electron_mirror
  const urls = []
  if (configuredMirror) {
    urls.push(electronMirrorUrl(configuredMirror, zipName))
  }
  urls.push(`https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`)
  urls.push(`https://npmmirror.com/mirrors/electron/${electronVersion}/${zipName}`)
  urls.push(`https://registry.npmmirror.com/-/binary/electron/${electronVersion}/${zipName}`)
  return uniqueUrls(urls)
}

function electronMirrorUrl(mirror, zipName) {
  const normalizedMirror = mirror.endsWith('/') ? mirror : `${mirror}/`
  return new URL(`${electronVersion}/${zipName}`, normalizedMirror).toString()
}

function uniqueUrls(urls) {
  return [...new Set(urls)]
}

async function downloadFileWithRetries(urls, destination, timeoutMs, attempts) {
  let lastError = null
  const useCurl = canUseCurlDownloader()
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const url of urls) {
      rmSync(destination, { force: true })
      try {
        console.log(`Downloading ${url}`)
        if (useCurl) {
          downloadFileWithCurl(url, destination, timeoutMs)
        } else {
          await downloadFileWithRedirects(url, destination, timeoutMs, 0)
        }
        return
      } catch (error) {
        lastError = error
        rmSync(destination, { force: true })
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Electron download attempt ${attempt}/${attempts} from ${url} failed: ${message}`)
      }
    }
    if (attempt < attempts) {
      await sleep(1000 * attempt)
    }
  }
  throw lastError || new Error(`Electron download failed after ${attempts} attempts`)
}

function canUseCurlDownloader() {
  if (process.env.ELECTRON_DOWNLOAD_DISABLE_CURL === '1') {
    return false
  }
  if (process.platform !== 'win32' || platform !== 'win32') {
    return false
  }
  if (curlAvailability !== null) {
    return curlAvailability
  }

  const result = spawnSync('curl.exe', ['--version'], { encoding: 'utf8' })
  curlAvailability = !result.error && result.status === 0
  if (!curlAvailability) {
    console.error('curl.exe was not available; using the Node HTTPS downloader for Electron')
  }
  return curlAvailability
}

function downloadFileWithCurl(url, destination, timeoutMs) {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000))
  const stalledTransferSeconds = Math.max(1, Math.min(Math.ceil(downloadStallTimeoutMs / 1000), timeoutSeconds))
  const args = [
    '--fail',
    '--location',
    '--http1.1',
    '--connect-timeout',
    '30',
    '--max-time',
    String(timeoutSeconds),
    '--speed-time',
    String(stalledTransferSeconds),
    '--speed-limit',
    '1024',
    '--output',
    destination,
    url
  ]

  console.log(`Downloading Electron binary with curl.exe (timeout ${timeoutSeconds}s, stall ${stalledTransferSeconds}s)`)
  const result = spawnSync('curl.exe', args, {
    stdio: 'inherit',
    timeout: timeoutMs + 10000
  })
  if (result.error) {
    throw result.error
  }
  if (result.signal) {
    throw new Error(`curl.exe was terminated by signal ${result.signal}`)
  }
  if (result.status !== 0) {
    throw new Error(`curl.exe exited with status ${result.status}`)
  }
}

function downloadFileWithRedirects(url, destination, timeoutMs, redirectCount) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`Too many redirects while downloading ${url}`))
  }

  return new Promise((resolveDownload, rejectDownload) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        const redirectedUrl = new URL(response.headers.location, url).toString()
        downloadFileWithRedirects(redirectedUrl, destination, timeoutMs, redirectCount + 1)
          .then(resolveDownload)
          .catch(rejectDownload)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        rejectDownload(new Error(`GET ${url} failed with status ${response.statusCode}`))
        return
      }

      const totalBytes = Number.parseInt(response.headers['content-length'] || '0', 10)
      let downloadedBytes = 0
      let lastProgressAt = Date.now()
      let settled = false
      let stallTimer = null
      const file = createWriteStream(destination)
      const clearStallTimer = () => {
        if (stallTimer) {
          clearTimeout(stallTimer)
          stallTimer = null
        }
      }
      const rejectOnce = (error) => {
        if (settled) {
          return
        }
        settled = true
        clearStallTimer()
        file.destroy()
        response.destroy(error)
        rejectDownload(error)
      }
      const resetStallTimer = () => {
        clearStallTimer()
        stallTimer = setTimeout(() => {
          rejectOnce(new Error(`GET ${url} stalled for ${downloadStallTimeoutMs}ms after ${downloadedBytes} bytes`))
        }, downloadStallTimeoutMs)
      }

      resetStallTimer()

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length
        resetStallTimer()
        const now = Date.now()
        if (now - lastProgressAt >= 10000) {
          lastProgressAt = now
          const progress = totalBytes > 0
            ? `${Math.round((downloadedBytes / totalBytes) * 100)}%`
            : `${downloadedBytes} bytes`
          console.log(`Electron download progress: ${progress}`)
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        if (settled) {
          return
        }
        settled = true
        clearStallTimer()
        file.close(() => resolveDownload())
      })
      file.on('error', rejectOnce)
      response.on('error', rejectOnce)
    })

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`GET ${url} timed out after ${timeoutMs}ms`))
    })
    request.on('error', rejectDownload)
  })
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
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
