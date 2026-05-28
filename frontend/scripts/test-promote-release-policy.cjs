const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createPromotionReport } = require('./promote-release-policy.cjs')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function previewPolicy() {
  return {
    electronRelease: {
      channel: 'preview',
      defaultArtifact: false,
      promotedVersion: null,
      keepLegacyArtifacts: true
    }
  }
}

function createFrontendRoot() {
  const frontendRoot = mkdtempSync(join(tmpdir(), 'nightreign-promote-policy-'))
  writeJson(join(frontendRoot, 'package.json'), {
    version: '4.6.6'
  })
  writeJson(join(frontendRoot, 'release-policy.json'), previewPolicy())
  return frontendRoot
}

function failingSignatureVerifier(_frontendRoot, _artifactBase, failures) {
  failures.push('test signature failure')
  return [
    {
      label: 'Windows installer',
      relativePath: 'release/Nightreign-Save-Editor-Electron-4.6.6-win-x64.exe',
      ok: false,
      status: 'Missing'
    }
  ]
}

function validSignatureVerifier() {
  return [
    {
      label: 'Windows installer',
      relativePath: 'release/Nightreign-Save-Editor-Electron-4.6.6-win-x64.exe',
      ok: true,
      status: 'Valid'
    },
    {
      label: 'Unpacked app executable',
      relativePath: 'release/win-unpacked/Nightreign Save Editor.exe',
      ok: true,
      status: 'Valid'
    },
    {
      label: 'Packaged Python sidecar',
      relativePath: 'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
      ok: true,
      status: 'Valid'
    }
  ]
}

function main() {
  const cases = []

  const dryRunRoot = createFrontendRoot()
  try {
    const dryRun = createPromotionReport({
      frontendRoot: dryRunRoot,
      write: false,
      verifySignatures: failingSignatureVerifier
    })
    const policy = readJson(join(dryRunRoot, 'release-policy.json'))
    assert(dryRun.ok === true, 'dry-run should succeed')
    assert(dryRun.changed === false, 'dry-run must not report changes')
    assert(dryRun.signatureChecks.length === 0, 'dry-run must not verify signatures')
    assert(policy.electronRelease.channel === 'preview', 'dry-run must keep preview policy')
    assert(
      dryRun.nextRequiredCommands.includes(
        'npm run verify:promotion -- --build --write-policy --repo <owner/name> --tag V4.6.6 --verify-publication-hashes --publication-retries 6 --publication-retry-delay-ms 10000'
      ),
      'dry-run should keep a placeholder repo when no GitHub repository can be inferred'
    )
    cases.push({ name: 'dry-run keeps policy', ok: true })
  } finally {
    rmSync(dryRunRoot, { recursive: true, force: true })
  }

  const inferredRepoRoot = createFrontendRoot()
  try {
    const inferredRepo = createPromotionReport({
      frontendRoot: inferredRepoRoot,
      env: { GITHUB_REPOSITORY: 'Tantless/Elden-Ring-Nightreign-Save-Editor' },
      write: false,
      verifySignatures: failingSignatureVerifier
    })
    assert(
      inferredRepo.nextRequiredCommands.includes(
        'npm run release:github-publication:report -- --repo Tantless/Elden-Ring-Nightreign-Save-Editor --tag V4.6.6 --verify-hashes --retries 6 --retry-delay-ms 10000'
      ),
      'dry-run should include inferred repo in publication report command'
    )
    assert(
      inferredRepo.nextRequiredCommands.includes(
        'npm run verify:promotion -- --build --write-policy --repo Tantless/Elden-Ring-Nightreign-Save-Editor --tag V4.6.6 --verify-publication-hashes --publication-retries 6 --publication-retry-delay-ms 10000'
      ),
      'dry-run should include inferred repo in final promotion command'
    )
    cases.push({ name: 'dry-run infers GitHub repository', ok: true })
  } finally {
    rmSync(inferredRepoRoot, { recursive: true, force: true })
  }

  const blockedRoot = createFrontendRoot()
  try {
    const blocked = createPromotionReport({
      frontendRoot: blockedRoot,
      write: true,
      verifySignatures: failingSignatureVerifier
    })
    const policy = readJson(join(blockedRoot, 'release-policy.json'))
    assert(blocked.ok === false, 'write must fail when signatures are invalid')
    assert(blocked.changed === false, 'write must not report changes when signatures are invalid')
    assert(blocked.signatureFailures.some((failure) => failure.includes('Policy was not updated')), 'write should explain blocked policy update')
    assert(policy.electronRelease.channel === 'preview', 'write must keep preview policy when signatures are invalid')
    cases.push({ name: 'write blocked by signatures', ok: true })
  } finally {
    rmSync(blockedRoot, { recursive: true, force: true })
  }

  const promotedRoot = createFrontendRoot()
  try {
    const promoted = createPromotionReport({
      frontendRoot: promotedRoot,
      write: true,
      verifySignatures: validSignatureVerifier
    })
    const policy = readJson(join(promotedRoot, 'release-policy.json'))
    assert(promoted.ok === true, 'write should succeed with valid signatures')
    assert(promoted.changed === true, 'write should report changes with valid signatures')
    assert(policy.electronRelease.channel === 'default', 'write should promote policy to default')
    assert(policy.electronRelease.defaultArtifact === true, 'default policy should set defaultArtifact=true')
    assert(policy.electronRelease.promotedVersion === '4.6.6', 'default policy should promote current version')
    assert(policy.electronRelease.keepLegacyArtifacts === true, 'default policy should keep legacy artifacts')
    cases.push({ name: 'write allowed by signatures', ok: true })
  } finally {
    rmSync(promotedRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
