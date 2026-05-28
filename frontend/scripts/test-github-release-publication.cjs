const { createHash } = require('node:crypto')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  createGithubPublicationReport,
  createGithubPublicationReportWithRetries,
  defaultGithubPublicationReportPath,
  githubToken,
  parseArgs,
  parseGitHubRemote,
  readGithubPublicationReportState,
  writeGithubPublicationReport
} = require('./check-github-release-publication.cjs')

const VERSION = '4.6.6'
const TAG = `V${VERSION}`
const REPO = 'Tantless/Elden-Ring-Nightreign-Save-Editor'
const API_BASE = 'https://api.example.test'
const ELECTRON_EXE = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64.exe`
const ELECTRON_BLOCKMAP = `${ELECTRON_EXE}.blockmap`
const ELECTRON_ZIP = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64.zip`
const LEGACY_ARTIFACTS = [
  'Nightreign_Relic_Editor_WIN64',
  'Nightreign_Relic_Editor_WIN64_Onedir',
  'Nightreign_Relic_Editor_WIN32',
  'Nightreign_Relic_Editor_LINUX_x86_64',
  'Nightreign_Relic_Editor_MAC-Silicon',
  'Nightreign_Relic_Editor_MAC-Intel'
]

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeFile(path, value = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, value, 'utf8')
}

function manifestArtifact(relativePath, value, label) {
  return {
    label,
    relativePath,
    publish: true,
    exists: true,
    size: Buffer.byteLength(value),
    sha256: sha256(value)
  }
}

function previewManifest(overrides = {}) {
  const artifacts = [
    manifestArtifact(`release/${ELECTRON_EXE}`, 'installer', 'Windows installer'),
    manifestArtifact(`release/${ELECTRON_BLOCKMAP}`, 'blockmap', 'Windows installer blockmap'),
    manifestArtifact(`release/${ELECTRON_ZIP}`, 'zip', 'Windows portable zip')
  ]
  return {
    ok: true,
    schemaVersion: 1,
    kind: 'nightreign-electron-preview-manifest',
    generatedAt: '2026-05-28T00:00:00.000Z',
    version: VERSION,
    resolvedPolicy: {
      channel: 'preview',
      artifactName: 'Nightreign_Save_Editor_Electron_WIN64_Preview'
    },
    publication: {
      artifactUploadName: 'Nightreign_Save_Editor_Electron_WIN64_Preview',
      defaultPublicPathChanged: false,
      draftReleaseArtifactPattern: './artifacts/*'
    },
    artifacts,
    publishArtifacts: artifacts,
    failures: [],
    ...overrides
  }
}

function asset(name, value) {
  return {
    id: name.length,
    name,
    size: Buffer.byteLength(value),
    browser_download_url: `${API_BASE}/download/${encodeURIComponent(name)}`
  }
}

function createFixture({ omitElectron = null, omitLegacy = null, manifestOverrides = {} } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-github-publication-'))
  const frontendRoot = join(repoRoot, 'frontend')
  mkdirSync(join(repoRoot, '.github', 'workflows'), { recursive: true })
  mkdirSync(frontendRoot, { recursive: true })
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeFile(
    join(repoRoot, '.github', 'workflows', 'main.yml'),
    LEGACY_ARTIFACTS.map((artifactName) => `artifact: ${artifactName}`).join('\n')
  )

  const bodies = {
    [ELECTRON_EXE]: 'installer',
    [ELECTRON_BLOCKMAP]: 'blockmap',
    [ELECTRON_ZIP]: 'zip',
    'electron-preview-manifest.json': JSON.stringify(previewManifest(manifestOverrides))
  }
  for (const artifactName of LEGACY_ARTIFACTS) {
    bodies[`${artifactName}.zip`] = artifactName
  }

  const releaseAssets = Object.entries(bodies)
    .filter(([name]) => name !== omitElectron && !name.startsWith(`${omitLegacy}.`))
    .map(([name, value]) => asset(name, value))
  const release = {
    id: 123,
    name: TAG,
    tag_name: TAG,
    draft: true,
    prerelease: false,
    html_url: 'https://github.example.test/releases/V4.6.6',
    assets: releaseAssets
  }

  const fetchImpl = async (url) => {
    if (url === `${API_BASE}/repos/${REPO}/releases/tags/${encodeURIComponent(TAG)}`) {
      return jsonResponse(200, release)
    }
    const downloadPrefix = `${API_BASE}/download/`
    if (url.startsWith(downloadPrefix)) {
      const name = decodeURIComponent(url.slice(downloadPrefix.length))
      if (Object.prototype.hasOwnProperty.call(bodies, name)) {
        return textResponse(200, bodies[name])
      }
      return textResponse(404, 'missing')
    }
    return textResponse(404, 'missing')
  }

  return { repoRoot, frontendRoot, fetchImpl }
}

function jsonResponse(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value),
    arrayBuffer: async () => Buffer.from(JSON.stringify(value)).buffer
  }
}

function textResponse(status, value) {
  const buffer = Buffer.from(value)
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(value),
    text: async () => value,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }
}

async function main() {
  const cases = []

  const parsed = parseArgs([
    '--repo',
    REPO,
    '--tag',
    TAG,
    '--api-base',
    API_BASE,
    '--verify-hashes',
    '--report',
    'custom-report.json',
    '--write-report',
    '--retries',
    '2',
    '--retry-delay-ms',
    '25'
  ])
  assert(parsed.repo === REPO, 'parseArgs should capture repo')
  assert(parsed.tag === TAG, 'parseArgs should capture tag')
  assert(parsed.apiBase === API_BASE, 'parseArgs should capture API base')
  assert(parsed.verifyHashes === true, 'parseArgs should capture hash verification')
  assert(parsed.reportPath === 'custom-report.json', 'parseArgs should capture report path')
  assert(parsed.writeReport === true, 'parseArgs should capture report writing')
  assert(parsed.retries === 2, 'parseArgs should capture retries')
  assert(parsed.retryDelayMs === 25, 'parseArgs should capture retry delay')
  try {
    parseArgs(['--retries', '-1'])
    throw new Error('invalid retries should fail')
  } catch (error) {
    assert(String(error.message).includes('--retries must be a non-negative integer'), 'invalid retries error should be explicit')
  }
  assert(parseGitHubRemote('https://github.com/Tantless/Elden-Ring-Nightreign-Save-Editor.git') === REPO, 'https remote should parse')
  assert(parseGitHubRemote('git@github.com:Tantless/Elden-Ring-Nightreign-Save-Editor.git') === REPO, 'ssh remote should parse')
  assert(githubToken({ GITHUB_TOKEN: 'github-token', GH_TOKEN: 'gh-token' }) === 'github-token', 'GITHUB_TOKEN should take precedence')
  assert(githubToken({ GH_TOKEN: 'gh-token' }) === 'gh-token', 'GH_TOKEN should be used as a fallback')
  assert(githubToken({}) === '', 'missing GitHub tokens should resolve to an empty token')
  cases.push({ name: 'argument and remote parsing', ok: true })
  cases.push({ name: 'GitHub token resolution', ok: true })

  const valid = createFixture()
  try {
    const missingState = readGithubPublicationReportState({
      repoRoot: valid.repoRoot,
      frontendRoot: valid.frontendRoot,
      version: VERSION
    })
    assert(missingState.ok === false, 'missing publication report state should fail')
    assert(missingState.exists === false, 'missing publication report state should report exists=false')

    const report = await createGithubPublicationReport({
      repoRoot: valid.repoRoot,
      frontendRoot: valid.frontendRoot,
      repo: REPO,
      tag: TAG,
      apiBase: API_BASE,
      fetchImpl: valid.fetchImpl,
      verifyHashes: true,
      generatedAt: '2026-05-28T00:00:00.000Z'
    })
    assert(report.ok === true, 'valid GitHub publication should pass')
    assert(report.electronPreview.publishArtifacts.length === 3, 'publication should verify all Electron publish assets')
    assert(report.electronPreview.publishArtifacts.every((item) => item.hashVerified), 'hash verification should run')
    assert(report.legacyArtifacts.length === LEGACY_ARTIFACTS.length, 'publication should include every legacy artifact')
    writeGithubPublicationReport(defaultGithubPublicationReportPath(valid.frontendRoot), report)
    const reportState = readGithubPublicationReportState({
      repoRoot: valid.repoRoot,
      frontendRoot: valid.frontendRoot,
      version: VERSION
    })
    assert(reportState.ok === true, 'valid publication report state should pass')
    assert(reportState.summary.electronPublishArtifactCount === 3, 'publication report state should summarize Electron artifacts')
    const noHashReportPath = join(valid.frontendRoot, 'github-publication-report-no-hash.json')
    const noHashReport = {
      ...report,
      verifyHashes: false,
      electronPreview: {
        ...report.electronPreview,
        publishArtifacts: report.electronPreview.publishArtifacts.map((item) => ({
          ...item,
          hashVerified: false,
          actualSha256: null
        }))
      }
    }
    writeGithubPublicationReport(noHashReportPath, noHashReport)
    const noHashReportState = readGithubPublicationReportState({
      repoRoot: valid.repoRoot,
      frontendRoot: valid.frontendRoot,
      version: VERSION,
      reportPath: noHashReportPath
    })
    assert(noHashReportState.ok === false, 'publication report state should require hash verification')
    assert(
      noHashReportState.errors.some((error) => error.includes('--verify-hashes')),
      'publication report state should explain missing hash verification'
    )
    const failedReportPath = join(valid.frontendRoot, 'github-publication-report-failed.json')
    writeGithubPublicationReport(failedReportPath, {
      ok: false,
      schemaVersion: 1,
      kind: 'nightreign-github-release-publication',
      generatedAt: '2026-05-28T00:00:00.000Z',
      version: VERSION,
      repo: REPO,
      tag: TAG,
      verifyHashes: true,
      release: null,
      electronPreview: {
        manifestAsset: null,
        artifactUploadName: null,
        defaultPublicPathChanged: null,
        publishArtifacts: []
      },
      legacyArtifacts: [],
      failures: [
        'GitHub release was not found or could not be read: GET https://api.example.test/releases/tags/V4.6.6 failed with status 404'
      ],
      retry: {
        attempts: 2,
        retries: 1,
        retryDelayMs: 25,
        attemptsDetail: []
      }
    })
    const failedReportState = readGithubPublicationReportState({
      repoRoot: valid.repoRoot,
      frontendRoot: valid.frontendRoot,
      version: VERSION,
      reportPath: failedReportPath
    })
    assert(failedReportState.ok === false, 'failed publication report state should fail')
    assert(
      failedReportState.errors.some((error) => error.includes('failed with status 404')),
      'publication report state should expose upstream GitHub failures'
    )
    assert(failedReportState.summary.retry.attempts === 2, 'publication report state should summarize retry attempts')
    assert(failedReportState.summary.retry.retries === 1, 'publication report state should summarize retry count')
    assert(failedReportState.summary.retry.retryDelayMs === 25, 'publication report state should summarize retry delay')
    cases.push({ name: 'valid GitHub publication', ok: true })
    cases.push({ name: 'publication report state', ok: true })
    cases.push({ name: 'publication report state requires hashes', ok: true })
    cases.push({ name: 'publication report state exposes upstream failures', ok: true })
    cases.push({ name: 'publication report state summarizes retries', ok: true })
  } finally {
    rmSync(valid.repoRoot, { recursive: true, force: true })
  }

  const retryFixture = createFixture()
  try {
    let releaseAttempts = 0
    let sleptMs = 0
    const releaseUrl = `${API_BASE}/repos/${REPO}/releases/tags/${encodeURIComponent(TAG)}`
    const retryFetch = async (url) => {
      if (url === releaseUrl) {
        releaseAttempts += 1
        if (releaseAttempts === 1) {
          return jsonResponse(404, { message: 'not yet visible' })
        }
      }
      return retryFixture.fetchImpl(url)
    }
    const report = await createGithubPublicationReportWithRetries({
      repoRoot: retryFixture.repoRoot,
      frontendRoot: retryFixture.frontendRoot,
      repo: REPO,
      tag: TAG,
      apiBase: API_BASE,
      fetchImpl: retryFetch,
      retries: 1,
      retryDelayMs: 25,
      sleepImpl: async (ms) => {
        sleptMs += ms
      }
    })
    assert(report.ok === true, 'publication retry should pass after transient release miss')
    assert(releaseAttempts === 2, 'publication retry should fetch release twice')
    assert(sleptMs === 25, 'publication retry should wait between attempts')
    assert(report.retry.attempts === 2, 'publication retry report should record attempts')
    assert(report.retry.attemptsDetail[0].ok === false, 'publication retry should record the failed attempt')
    assert(report.retry.attemptsDetail[1].ok === true, 'publication retry should record the passing attempt')
    cases.push({ name: 'transient publication miss retries', ok: true })
  } finally {
    rmSync(retryFixture.repoRoot, { recursive: true, force: true })
  }

  const missingElectron = createFixture({ omitElectron: ELECTRON_ZIP })
  try {
    const report = await createGithubPublicationReport({
      repoRoot: missingElectron.repoRoot,
      frontendRoot: missingElectron.frontendRoot,
      repo: REPO,
      tag: TAG,
      apiBase: API_BASE,
      fetchImpl: missingElectron.fetchImpl
    })
    assert(report.ok === false, 'publication should fail when Electron zip is missing')
    assert(
      report.failures.some((failure) => failure.includes(ELECTRON_ZIP)),
      'publication should report missing Electron zip'
    )
    cases.push({ name: 'missing Electron asset fails', ok: true })
  } finally {
    rmSync(missingElectron.repoRoot, { recursive: true, force: true })
  }

  const missingLegacy = createFixture({ omitLegacy: 'Nightreign_Relic_Editor_MAC-Intel' })
  try {
    const report = await createGithubPublicationReport({
      repoRoot: missingLegacy.repoRoot,
      frontendRoot: missingLegacy.frontendRoot,
      repo: REPO,
      tag: TAG,
      apiBase: API_BASE,
      fetchImpl: missingLegacy.fetchImpl
    })
    assert(report.ok === false, 'publication should fail when legacy artifact is missing')
    assert(
      report.failures.some((failure) => failure.includes('Nightreign_Relic_Editor_MAC-Intel')),
      'publication should report missing legacy artifact'
    )
    cases.push({ name: 'missing legacy asset fails', ok: true })
  } finally {
    rmSync(missingLegacy.repoRoot, { recursive: true, force: true })
  }

  const defaultChanged = createFixture({
    manifestOverrides: {
      publication: {
        artifactUploadName: 'Nightreign_Save_Editor_Electron_WIN64_Preview',
        defaultPublicPathChanged: true,
        draftReleaseArtifactPattern: './artifacts/*'
      }
    }
  })
  try {
    const report = await createGithubPublicationReport({
      repoRoot: defaultChanged.repoRoot,
      frontendRoot: defaultChanged.frontendRoot,
      repo: REPO,
      tag: TAG,
      apiBase: API_BASE,
      fetchImpl: defaultChanged.fetchImpl
    })
    assert(report.ok === false, 'publication should fail when preview changed default path')
    assert(
      report.failures.some((failure) => failure.includes('default public path')),
      'publication should report default path change'
    )
    cases.push({ name: 'default path change fails', ok: true })
  } finally {
    rmSync(defaultChanged.repoRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
