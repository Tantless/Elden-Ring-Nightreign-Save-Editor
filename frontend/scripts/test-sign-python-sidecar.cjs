const { mkdtempSync, readdirSync, rmSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

const frontendRoot = resolve(__dirname, '..')
const scriptPath = join(frontendRoot, 'scripts', 'sign-python-sidecar.cjs')
const tempDir = mkdtempSync(join(tmpdir(), 'nightreign-sign-test-'))
const targetPath = join(tempDir, 'NightreignElectronBridge.exe')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function scrubbedEnv(overrides = {}) {
  const env = { ...process.env }
  for (const key of [
    'WIN_CSC_LINK',
    'CSC_LINK',
    'WIN_CSC_KEY_PASSWORD',
    'CSC_KEY_PASSWORD',
    'WIN_CSC_NAME',
    'CSC_NAME'
  ]) {
    delete env[key]
  }
  return { ...env, ...overrides }
}

function tempCertificateDirCount() {
  return readdirSync(tmpdir(), { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('nightreign-csc-')
  ).length
}

function parseJsonOutput(stdout, name) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${name}: expected JSON output, got ${JSON.stringify(stdout)}`)
  }
}

function runDryRun(name, overrides = {}) {
  const result = spawnSync(process.execPath, [scriptPath, '--dry-run', '--target', targetPath], {
    cwd: frontendRoot,
    env: scrubbedEnv(overrides),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  assert(!result.error, `${name}: ${result.error?.message}`)
  assert(result.status === 0, `${name}: expected exit 0, got ${result.status}: ${result.stderr}`)
  return parseJsonOutput(result.stdout, name)
}

function main() {
  writeFileSync(targetPath, 'sidecar-signing-test', 'utf8')
  const cases = []

  const missing = runDryRun('missing credentials')
  assert(missing.ok === true, 'missing credentials: dry-run should be non-blocking')
  assert(missing.signing.ready === false, 'missing credentials: signing should not be ready')
  assert(missing.failures.some((failure) => failure.includes('WIN_CSC_LINK')), 'missing credentials: expected env hint')
  cases.push({ name: 'missing credentials', ready: missing.signing.ready, cscSource: missing.signing.cscSource })

  const certName = runDryRun('certificate name', {
    WIN_CSC_NAME: 'Nightreign Test Certificate'
  })
  assert(certName.signing.ready === true, 'certificate name: signing should be ready')
  assert(certName.signing.mode === 'certificate-name', 'certificate name: expected certificate-name mode')
  assert(certName.signing.cscSource === 'certificate-store', 'certificate name: expected certificate-store source')
  cases.push({ name: 'certificate name', ready: certName.signing.ready, cscSource: certName.signing.cscSource })

  const beforeHttp = tempCertificateDirCount()
  const httpLink = runDryRun('http csc link', {
    WIN_CSC_LINK: 'https://example.invalid/nightreign-test-certificate.p12',
    WIN_CSC_KEY_PASSWORD: 'secret'
  })
  const afterHttp = tempCertificateDirCount()
  assert(httpLink.signing.ready === true, 'http csc link: signing should be ready')
  assert(httpLink.signing.mode === 'pfx', 'http csc link: expected pfx mode')
  assert(httpLink.signing.cscSource === 'http-url', 'http csc link: expected http-url source')
  assert(afterHttp === beforeHttp, 'http csc link: dry-run must not download or write temporary certificates')
  cases.push({ name: 'http csc link', ready: httpLink.signing.ready, cscSource: httpLink.signing.cscSource })

  const beforeBase64 = tempCertificateDirCount()
  const base64Link = runDryRun('base64 csc link', {
    WIN_CSC_LINK: Buffer.from('nightreign-test-certificate'.repeat(8)).toString('base64'),
    WIN_CSC_KEY_PASSWORD: 'secret'
  })
  const afterBase64 = tempCertificateDirCount()
  assert(base64Link.signing.ready === true, 'base64 csc link: signing should be ready')
  assert(base64Link.signing.mode === 'pfx', 'base64 csc link: expected pfx mode')
  assert(base64Link.signing.cscSource === 'base64', 'base64 csc link: expected base64 source')
  assert(afterBase64 === beforeBase64, 'base64 csc link: dry-run must not decode or write temporary certificates')
  cases.push({ name: 'base64 csc link', ready: base64Link.signing.ready, cscSource: base64Link.signing.cscSource })

  console.log(
    JSON.stringify(
      {
        ok: true,
        target: targetPath,
        cases
      },
      null,
      2
    )
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
