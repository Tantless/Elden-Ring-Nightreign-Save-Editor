const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { basename, dirname, join, resolve } = require('node:path')
const { MANIFEST_NAME, readLegacyArtifactNames } = require('./check-release-artifact-bundle.cjs')
const { readPackageVersion } = require('./release-policy.cjs')

const DEFAULT_PUBLICATION_REPORT_PATH = 'github-publication-report.json'

function parseArgs(argv) {
  const args = [...argv]
  let repo = null
  let tag = null
  let apiBase = 'https://api.github.com'
  let verifyHashes = false
  let reportPath = null
  let writeReport = false
  let retries = 0
  let retryDelayMs = 0

  while (args.length > 0) {
    const current = args.shift()
    if (current === '--repo') {
      repo = takeValue(args, current)
      continue
    }
    if (current === '--tag') {
      tag = takeValue(args, current)
      continue
    }
    if (current === '--api-base') {
      apiBase = takeValue(args, current)
      continue
    }
    if (current === '--verify-hashes') {
      verifyHashes = true
      continue
    }
    if (current === '--report') {
      reportPath = takeValue(args, current)
      continue
    }
    if (current === '--write-report') {
      writeReport = true
      continue
    }
    if (current === '--retries') {
      retries = parseNonNegativeInteger(takeValue(args, current), current)
      continue
    }
    if (current === '--retry-delay-ms') {
      retryDelayMs = parseNonNegativeInteger(takeValue(args, current), current)
      continue
    }
    throw new Error(`Unexpected argument: ${current}`)
  }

  return { repo, tag, apiBase, verifyHashes, reportPath, writeReport, retries, retryDelayMs }
}

function takeValue(args, name) {
  const value = args.shift()
  if (!value) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function parseNonNegativeInteger(value, name) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return number
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
}

function normalizeApiBase(apiBase) {
  return apiBase.replace(/\/+$/, '')
}

function defaultGithubPublicationReportPath(frontendRoot) {
  return join(frontendRoot, DEFAULT_PUBLICATION_REPORT_PATH)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeGithubPublicationReport(reportPath, report) {
  const absolutePath = resolve(reportPath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return absolutePath
}

function parseGitHubRemote(remoteUrl) {
  const trimmed = String(remoteUrl || '').trim()
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/i)
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`
  }
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i)
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`
  }
  return null
}

function inferGitHubRepository(repoRoot, env = process.env) {
  if (env.GITHUB_REPOSITORY) {
    return env.GITHUB_REPOSITORY
  }
  try {
    return parseGitHubRemote(
      execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
    )
  } catch {
    return null
  }
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function fetchJson(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers })
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      value: null,
      error: `GET ${url} failed with status ${response.status}`
    }
  }
  return {
    ok: true,
    status: response.status,
    value: await response.json(),
    error: ''
  }
}

async function fetchText(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers })
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      value: '',
      error: `GET ${url} failed with status ${response.status}`
    }
  }
  return {
    ok: true,
    status: response.status,
    value: await response.text(),
    error: ''
  }
}

async function fetchBuffer(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers })
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      value: Buffer.alloc(0),
      error: `GET ${url} failed with status ${response.status}`
    }
  }
  return {
    ok: true,
    status: response.status,
    value: Buffer.from(await response.arrayBuffer()),
    error: ''
  }
}

function githubToken(env = process.env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || ''
}

function githubHeaders(token = githubToken()) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

function findUniqueAsset(assets, name, failures, label) {
  const matches = assets.filter((asset) => asset.name === name)
  if (matches.length === 0) {
    failures.push(`${label} missing from GitHub release assets: ${name}`)
    return null
  }
  if (matches.length > 1) {
    failures.push(`${label} appears more than once in GitHub release assets: ${name}`)
    return null
  }
  return matches[0]
}

function findLegacyAsset(assets, artifactName, failures) {
  const matches = assets.filter((asset) => asset.name.startsWith(artifactName))
  if (matches.length === 0) {
    failures.push(`Legacy artifact missing from GitHub release assets: ${artifactName}`)
    return null
  }
  return {
    artifactName,
    assets: matches.map((asset) => ({
      name: asset.name,
      size: asset.size,
      browserDownloadUrl: asset.browser_download_url
    }))
  }
}

async function verifyPublishedElectronArtifact({ fetchImpl, headers, assets, artifact, failures, verifyHashes }) {
  const name = basename(artifact.relativePath)
  const asset = findUniqueAsset(assets, name, failures, artifact.label)
  if (!asset) {
    return {
      label: artifact.label,
      name,
      ok: false,
      hashVerified: false,
      expectedSize: artifact.size,
      actualSize: 0,
      expectedSha256: artifact.sha256,
      actualSha256: null
    }
  }

  const sizeOk = asset.size === artifact.size
  if (!sizeOk) {
    failures.push(`${artifact.label} size mismatch in GitHub release assets: ${name}`)
  }

  let actualSha256 = null
  if (verifyHashes) {
    const download = await fetchBuffer(fetchImpl, asset.browser_download_url, headers)
    if (!download.ok) {
      failures.push(`${artifact.label} could not be downloaded for hash verification: ${download.error}`)
    } else {
      actualSha256 = sha256Buffer(download.value)
      if (actualSha256 !== artifact.sha256) {
        failures.push(`${artifact.label} SHA-256 mismatch in GitHub release assets: ${name}`)
      }
    }
  }

  return {
    label: artifact.label,
    name,
    ok: sizeOk && (!verifyHashes || actualSha256 === artifact.sha256),
    hashVerified: verifyHashes,
    expectedSize: artifact.size,
    actualSize: asset.size,
    expectedSha256: artifact.sha256,
    actualSha256,
    browserDownloadUrl: asset.browser_download_url
  }
}

async function createGithubPublicationReport({
  repoRoot,
  frontendRoot = join(repoRoot, 'frontend'),
  repo = null,
  tag = null,
  apiBase = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
  token = githubToken(),
  verifyHashes = false,
  generatedAt = new Date().toISOString()
}) {
  const failures = []
  const version = readPackageVersion(frontendRoot)
  const resolvedRepo = repo || inferGitHubRepository(repoRoot)
  const resolvedTag = tag || `V${version}`

  if (!resolvedRepo) {
    failures.push('GitHub repository could not be inferred; pass --repo owner/name.')
  }
  if (!fetchImpl) {
    failures.push('fetch is unavailable in this Node runtime.')
  }

  let release = null
  let manifest = null
  let manifestAsset = null
  const headers = githubHeaders(token)
  if (resolvedRepo && fetchImpl) {
    const releaseUrl = `${normalizeApiBase(apiBase)}/repos/${resolvedRepo}/releases/tags/${encodeURIComponent(resolvedTag)}`
    const releaseResult = await fetchJson(fetchImpl, releaseUrl, headers)
    if (!releaseResult.ok) {
      failures.push(`GitHub release was not found or could not be read: ${releaseResult.error}`)
    } else {
      release = releaseResult.value
    }
  }

  const assets = Array.isArray(release?.assets) ? release.assets : []
  if (release && assets.length === 0) {
    failures.push(`GitHub release ${resolvedTag} has no assets.`)
  }

  if (release) {
    manifestAsset = findUniqueAsset(assets, MANIFEST_NAME, failures, 'Electron preview manifest')
    if (manifestAsset) {
      const manifestResult = await fetchText(fetchImpl, manifestAsset.browser_download_url, headers)
      if (!manifestResult.ok) {
        failures.push(`Electron preview manifest could not be downloaded: ${manifestResult.error}`)
      } else {
        try {
          manifest = JSON.parse(manifestResult.value)
        } catch (error) {
          failures.push(`Electron preview manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }

  if (manifest) {
    if (manifest.kind !== 'nightreign-electron-preview-manifest') {
      failures.push('Electron preview manifest has an unexpected kind.')
    }
    if (manifest.version !== version) {
      failures.push(`Electron preview manifest version ${manifest.version} does not match package version ${version}.`)
    }
    if (manifest.resolvedPolicy?.channel !== 'preview') {
      failures.push('Electron preview manifest must resolve to preview channel.')
    }
    if (manifest.publication?.defaultPublicPathChanged !== false) {
      failures.push('Electron preview manifest must prove the default public path was not changed.')
    }
  }

  const publishArtifacts = Array.isArray(manifest?.publishArtifacts) ? manifest.publishArtifacts : []
  if (manifest && publishArtifacts.length === 0) {
    failures.push('Electron preview manifest does not list publishArtifacts.')
  }

  const electronArtifacts = []
  for (const artifact of publishArtifacts) {
    electronArtifacts.push(
      await verifyPublishedElectronArtifact({ fetchImpl, headers, assets, artifact, failures, verifyHashes })
    )
  }

  const legacyArtifactNames = readLegacyArtifactNames(repoRoot)
  if (legacyArtifactNames.length === 0) {
    failures.push('No legacy artifact names found in .github/workflows/main.yml.')
  }
  const legacyArtifacts = release
    ? legacyArtifactNames
        .map((artifactName) => findLegacyAsset(assets, artifactName, failures))
        .filter(Boolean)
    : []

  return {
    ok: failures.length === 0,
    schemaVersion: 1,
    kind: 'nightreign-github-release-publication',
    generatedAt,
    version,
    repo: resolvedRepo,
    tag: resolvedTag,
    verifyHashes,
    release: release
      ? {
          id: release.id,
          name: release.name,
          tagName: release.tag_name,
          draft: release.draft,
          prerelease: release.prerelease,
          htmlUrl: release.html_url,
          assetCount: assets.length
        }
      : null,
    electronPreview: {
      manifestAsset: manifestAsset
        ? {
            name: manifestAsset.name,
            size: manifestAsset.size,
            browserDownloadUrl: manifestAsset.browser_download_url
          }
        : null,
      artifactUploadName: manifest?.publication?.artifactUploadName ?? null,
      defaultPublicPathChanged: manifest?.publication?.defaultPublicPathChanged ?? null,
      publishArtifacts: electronArtifacts
    },
    legacyArtifacts,
    failures
  }
}

async function createGithubPublicationReportWithRetries({
  retries = 0,
  retryDelayMs = 0,
  sleepImpl = sleep,
  ...reportOptions
}) {
  const attempts = []
  let report = null
  for (let index = 0; index <= retries; index += 1) {
    report = await createGithubPublicationReport(reportOptions)
    attempts.push({
      attempt: index + 1,
      ok: report.ok,
      failures: report.failures
    })
    if (report.ok || index === retries) {
      break
    }
    if (retryDelayMs > 0) {
      await sleepImpl(retryDelayMs)
    }
  }

  return {
    ...report,
    retry: {
      attempts: attempts.length,
      retries,
      retryDelayMs,
      attemptsDetail: attempts
    }
  }
}

function validateGithubPublicationReport(report, version, repoRoot) {
  const errors = []
  const expectedLegacyArtifacts = readLegacyArtifactNames(repoRoot)
  const publishedLegacyArtifacts = Array.isArray(report?.legacyArtifacts)
    ? report.legacyArtifacts.map((item) => item.artifactName)
    : []

  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    errors.push('GitHub publication report must be a JSON object.')
    return { ok: false, errors, expectedLegacyArtifacts, publishedLegacyArtifacts }
  }
  if (report.kind !== 'nightreign-github-release-publication') {
    errors.push('GitHub publication report has an unexpected kind.')
  }
  if (report.version !== version) {
    errors.push(`GitHub publication report version must be "${version}".`)
  }
  if (report.tag !== `V${version}`) {
    errors.push(`GitHub publication report tag must be "V${version}".`)
  }
  if (report.ok !== true) {
    errors.push('GitHub publication report must have ok=true.')
  }
  if (Array.isArray(report.failures)) {
    for (const failure of report.failures) {
      if (typeof failure === 'string' && failure.trim()) {
        errors.push(`GitHub publication report failure: ${failure}`)
      }
    }
  }
  if (!report.release || typeof report.release !== 'object') {
    errors.push('GitHub publication report requires release evidence.')
  }
  if (report.electronPreview?.manifestAsset?.name !== MANIFEST_NAME) {
    errors.push('GitHub publication report requires the published Electron preview manifest asset.')
  }
  if (report.electronPreview?.defaultPublicPathChanged !== false) {
    errors.push('GitHub publication report must prove defaultPublicPathChanged=false.')
  }
  if (report.verifyHashes !== true) {
    errors.push('GitHub publication report must be generated with --verify-hashes.')
  }

  const publishArtifacts = Array.isArray(report.electronPreview?.publishArtifacts)
    ? report.electronPreview.publishArtifacts
    : []
  if (publishArtifacts.length === 0) {
    errors.push('GitHub publication report must include Electron publish artifacts.')
  }
  for (const artifact of publishArtifacts) {
    if (artifact.ok !== true) {
      errors.push(`GitHub publication Electron artifact must be ok: ${artifact.name || artifact.label || 'unknown'}`)
    }
    if (artifact.hashVerified !== true) {
      errors.push(
        `GitHub publication Electron artifact must have hashVerified=true: ${artifact.name || artifact.label || 'unknown'}`
      )
    }
    if (
      typeof artifact.expectedSha256 !== 'string' ||
      artifact.expectedSha256.length === 0 ||
      typeof artifact.actualSha256 !== 'string' ||
      artifact.actualSha256.length === 0 ||
      artifact.expectedSha256 !== artifact.actualSha256
    ) {
      errors.push(
        `GitHub publication Electron artifact must have matching SHA-256 evidence: ${artifact.name || artifact.label || 'unknown'}`
      )
    }
  }

  if (expectedLegacyArtifacts.length === 0) {
    errors.push('No legacy artifact names found in .github/workflows/main.yml.')
  }
  for (const artifactName of expectedLegacyArtifacts) {
    const published = Array.isArray(report.legacyArtifacts)
      ? report.legacyArtifacts.find((item) => item.artifactName === artifactName)
      : null
    if (!published || !Array.isArray(published.assets) || published.assets.length === 0) {
      errors.push(`GitHub publication report is missing legacy artifact evidence: ${artifactName}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    expectedLegacyArtifacts,
    publishedLegacyArtifacts
  }
}

function readGithubPublicationReportState({
  frontendRoot,
  repoRoot = resolve(frontendRoot, '..'),
  version = readPackageVersion(frontendRoot),
  reportPath = defaultGithubPublicationReportPath(frontendRoot)
}) {
  const absolutePath = resolve(reportPath)
  if (!existsSync(absolutePath)) {
    return {
      path: absolutePath,
      exists: false,
      ok: false,
      errors: [`Missing GitHub publication report: ${absolutePath}`],
      expectedLegacyArtifacts: readLegacyArtifactNames(repoRoot),
      publishedLegacyArtifacts: []
    }
  }

  try {
    const report = readJson(absolutePath)
    const result = validateGithubPublicationReport(report, version, repoRoot)
    return {
      path: absolutePath,
      exists: true,
      ok: result.ok,
      errors: result.errors,
      expectedLegacyArtifacts: result.expectedLegacyArtifacts,
      publishedLegacyArtifacts: result.publishedLegacyArtifacts,
      summary: {
        version: report.version,
        repo: report.repo,
        tag: report.tag,
        release: report.release || null,
        verifyHashes: report.verifyHashes === true,
        retry: report.retry && typeof report.retry === 'object'
          ? {
              attempts: Number.isInteger(report.retry.attempts) ? report.retry.attempts : null,
              retries: Number.isInteger(report.retry.retries) ? report.retry.retries : null,
              retryDelayMs: Number.isInteger(report.retry.retryDelayMs) ? report.retry.retryDelayMs : null
            }
          : null,
        electronPublishArtifactCount: Array.isArray(report.electronPreview?.publishArtifacts)
          ? report.electronPreview.publishArtifacts.length
          : 0,
        legacyArtifactCount: Array.isArray(report.legacyArtifacts) ? report.legacyArtifacts.length : 0
      }
    }
  } catch (error) {
    return {
      path: absolutePath,
      exists: true,
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      expectedLegacyArtifacts: readLegacyArtifactNames(repoRoot),
      publishedLegacyArtifacts: []
    }
  }
}

async function main() {
  const { repo, tag, apiBase, verifyHashes, reportPath, writeReport, retries, retryDelayMs } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const repoRoot = resolve(frontendRoot, '..')
  const report = await createGithubPublicationReportWithRetries({
    repoRoot,
    frontendRoot,
    repo,
    tag,
    apiBase,
    verifyHashes,
    retries,
    retryDelayMs
  })
  if (writeReport) {
    report.reportPath = writeGithubPublicationReport(
      reportPath ? resolve(reportPath) : defaultGithubPublicationReportPath(frontendRoot),
      report
    )
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exitCode = 1
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

module.exports = {
  createGithubPublicationReport,
  createGithubPublicationReportWithRetries,
  defaultGithubPublicationReportPath,
  inferGitHubRepository,
  githubToken,
  parseArgs,
  parseGitHubRemote,
  readGithubPublicationReportState,
  sha256Buffer,
  validateGithubPublicationReport,
  writeGithubPublicationReport
}
