const { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join, resolve, isAbsolute } = require('node:path')
const { tmpdir } = require('node:os')
const { fileURLToPath } = require('node:url')

const DEFAULT_TIMESTAMP_URL = 'http://timestamp.digicert.com'

function parseArgs(argv) {
  const options = {
    dryRun: false,
    target: null
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--target') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--target requires a path')
      }
      options.target = value
      index += 1
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }

  return options
}

function resolveTarget(frontendRoot, target) {
  if (target) {
    return isAbsolute(target) ? target : resolve(frontendRoot, target)
  }
  return resolve(frontendRoot, '..', 'src', 'dist', 'NightreignElectronBridge.exe')
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value)
}

function isFileUrl(value) {
  return /^file:\/\//i.test(value)
}

function localPathFromCscLink(value, frontendRoot) {
  if (isFileUrl(value)) {
    return fileURLToPath(value)
  }

  const absolute = isAbsolute(value) ? value : resolve(frontendRoot, value)
  return existsSync(absolute) ? absolute : null
}

function classifyCscLink(value, frontendRoot) {
  if (isFileUrl(value)) {
    const localPath = fileURLToPath(value)
    return existsSync(localPath)
      ? { valid: true, source: 'file-url', localPath }
      : { valid: false, source: 'file-url', localPath, reason: `Certificate file does not exist: ${localPath}` }
  }

  const localPath = localPathFromCscLink(value, frontendRoot)
  if (localPath) {
    return { valid: true, source: 'local-path', localPath }
  }
  if (isHttpUrl(value)) {
    return { valid: true, source: 'http-url', localPath: null }
  }
  if (looksLikeBase64(value)) {
    return { valid: true, source: 'base64', localPath: null }
  }

  return {
    valid: false,
    source: null,
    localPath: null,
    reason:
      'WIN_CSC_LINK/CSC_LINK for sidecar signing must be a local file path, file:// URL, HTTP(S) URL, or base64 PFX/PKCS#12 data.'
  }
}

function looksLikeBase64(value) {
  const normalized = value.replace(/^data:.*?;base64,/i, '').replace(/\s+/g, '')
  return normalized.length > 64 && /^[A-Za-z0-9+/_=-]+$/.test(normalized)
}

function decodeBase64(value) {
  const normalized = value
    .replace(/^data:.*?;base64,/i, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Buffer.from(normalized, 'base64')
}

async function writeTempCertificate(buffer) {
  const tempDir = mkdtempSync(join(tmpdir(), 'nightreign-csc-'))
  const certPath = join(tempDir, 'certificate.p12')
  writeFileSync(certPath, buffer)
  return {
    path: certPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true })
  }
}

async function materializeCscLink(cscLink, frontendRoot) {
  const classified = classifyCscLink(cscLink, frontendRoot)
  if (!classified.valid) {
    throw new Error(classified.reason)
  }

  if (classified.localPath) {
    return {
      path: classified.localPath,
      source: classified.source,
      cleanup: () => {}
    }
  }

  if (isHttpUrl(cscLink)) {
    if (typeof fetch !== 'function') {
      throw new Error('WIN_CSC_LINK/CSC_LINK is an HTTP URL, but this Node runtime has no fetch support.')
    }
    const response = await fetch(cscLink, { redirect: 'follow' })
    if (!response.ok) {
      throw new Error(`Failed to download WIN_CSC_LINK/CSC_LINK certificate: HTTP ${response.status}`)
    }
    const certificate = await writeTempCertificate(Buffer.from(await response.arrayBuffer()))
    return {
      path: certificate.path,
      source: 'http-url',
      cleanup: certificate.cleanup
    }
  }

  if (looksLikeBase64(cscLink)) {
    const certificate = await writeTempCertificate(decodeBase64(cscLink))
    return {
      path: certificate.path,
      source: 'base64',
      cleanup: certificate.cleanup
    }
  }

  throw new Error(classified.reason)
}

function findSigntool() {
  if (process.env.SIGNTOOL_PATH) {
    return process.env.SIGNTOOL_PATH
  }

  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean)
  const candidates = []
  for (const root of roots) {
    const binRoot = join(root, 'Windows Kits', '10', 'bin')
    if (!existsSync(binRoot)) {
      continue
    }
    const versions = readdirSync(binRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
    for (const version of versions) {
      for (const arch of ['x64', 'x86']) {
        candidates.push(join(binRoot, version, arch, 'signtool.exe'))
      }
    }
  }

  return candidates.find((candidate) => existsSync(candidate)) || 'signtool.exe'
}

async function resolveSigningConfig(frontendRoot, options = {}) {
  const materializeCertificate = options.materializeCertificate !== false
  const certName = process.env.WIN_CSC_NAME || process.env.CSC_NAME
  if (certName) {
    return {
      ready: true,
      mode: 'certificate-name',
      cscSource: 'certificate-store',
      signtoolArgs: ['/a', '/n', certName],
      cleanup: () => {}
    }
  }

  const cscLink = process.env.WIN_CSC_LINK || process.env.CSC_LINK
  const password = process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD
  if (!cscLink || !password) {
    return {
      ready: false,
      mode: null,
      cscSource: null,
      signtoolArgs: [],
      cleanup: () => {},
      reason:
        'Set WIN_CSC_LINK/CSC_LINK with WIN_CSC_KEY_PASSWORD/CSC_KEY_PASSWORD, or set WIN_CSC_NAME/CSC_NAME on the signing host.'
    }
  }

  const classified = classifyCscLink(cscLink, frontendRoot)
  if (!classified.valid) {
    return {
      ready: false,
      mode: 'pfx',
      cscSource: classified.source,
      signtoolArgs: [],
      cleanup: () => {},
      reason: classified.reason
    }
  }

  if (!materializeCertificate) {
    return {
      ready: true,
      mode: 'pfx',
      cscSource: classified.source,
      signtoolArgs: [],
      cleanup: () => {}
    }
  }

  const certificate = await materializeCscLink(cscLink, frontendRoot)
  return {
    ready: true,
    mode: 'pfx',
    cscSource: certificate.source,
    signtoolArgs: ['/f', certificate.path, '/p', password],
    cleanup: certificate.cleanup
  }
}

async function main() {
  const { dryRun, target } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const targetPath = resolveTarget(frontendRoot, target)
  const targetExists = existsSync(targetPath)
  const timestampUrl = process.env.SIGNTOOL_TIMESTAMP_URL || process.env.WIN_CSC_TIMESTAMP_URL || process.env.CSC_TIMESTAMP_URL || DEFAULT_TIMESTAMP_URL
  const signtool = findSigntool()
  const failures = []
  let signing = null

  try {
    signing = await resolveSigningConfig(frontendRoot, { materializeCertificate: !dryRun })
  } catch (error) {
    signing = {
      ready: false,
      mode: null,
      cscSource: null,
      signtoolArgs: [],
      cleanup: () => {},
      reason: error instanceof Error ? error.message : String(error)
    }
  }

  if (!targetExists) {
    failures.push(`Python sidecar is missing: ${targetPath}`)
  }
  if (process.platform !== 'win32') {
    failures.push(`Python sidecar signing requires Windows; current platform is ${process.platform}.`)
  }
  if (!signing.ready) {
    failures.push(signing.reason)
  }

  const baseReport = {
    ok: dryRun ? true : failures.length === 0,
    dryRun,
    target: {
      path: targetPath,
      exists: targetExists,
      size: targetExists ? statSync(targetPath).size : 0
    },
    signing: {
      ready: signing.ready,
      mode: signing.mode,
      cscSource: signing.cscSource,
      timestampUrl,
      signtool
    },
    failures
  }

  if (dryRun) {
    console.log(JSON.stringify(baseReport, null, 2))
    signing.cleanup()
    return
  }

  if (failures.length > 0) {
    console.log(JSON.stringify(baseReport, null, 2))
    signing.cleanup()
    process.exit(1)
  }

  const result = spawnSync(
    signtool,
    ['sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', timestampUrl, ...signing.signtoolArgs, targetPath],
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000
    }
  )
  signing.cleanup()

  if (result.error || result.status !== 0) {
    const message = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `signtool exited with ${result.status}`
    console.log(
      JSON.stringify(
        {
          ...baseReport,
          ok: false,
          failures: [`Python sidecar signing failed: ${message}`]
        },
        null,
        2
      )
    )
    process.exit(1)
  }

  console.log(
    JSON.stringify(
      {
        ...baseReport,
        ok: true,
        signed: true,
        failures: []
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
