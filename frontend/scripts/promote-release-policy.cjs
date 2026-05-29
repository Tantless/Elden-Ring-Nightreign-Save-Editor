const { writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { verifyPromotionSignatures } = require('./authenticode.cjs')
const { inferGitHubRepository } = require('./check-github-release-publication.cjs')
const {
  RELEASE_POLICY_PATH,
  defaultReleasePolicy,
  normalizeReleasePolicy,
  readPackageVersion,
  readReleasePolicyState,
  releasePolicyPromotesVersion,
  resolveReleasePolicyState
} = require('./release-policy.cjs')

const DEFAULT_PUBLICATION_RETRIES = 6
const DEFAULT_PUBLICATION_RETRY_DELAY_MS = 10000

function parseArgs(argv) {
  let write = false
  for (const arg of argv) {
    if (arg === '--write') {
      write = true
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }
  return { write }
}

function finalPromotionCommand({
  repo,
  version,
  publicationRetries = DEFAULT_PUBLICATION_RETRIES,
  publicationRetryDelayMs = DEFAULT_PUBLICATION_RETRY_DELAY_MS
}) {
  return [
    'npm run verify:promotion -- --build --write-policy',
    `--repo ${repo}`,
    `--tag V${version}`,
    '--verify-publication-hashes',
    `--publication-retries ${publicationRetries}`,
    `--publication-retry-delay-ms ${publicationRetryDelayMs}`
  ].join(' ')
}

function publicationReportCommand({
  repo,
  version,
  retries = DEFAULT_PUBLICATION_RETRIES,
  retryDelayMs = DEFAULT_PUBLICATION_RETRY_DELAY_MS
}) {
  return [
    'npm run release:github-publication:report --',
    `--repo ${repo}`,
    `--tag V${version}`,
    '--verify-hashes',
    `--retries ${retries}`,
    `--retry-delay-ms ${retryDelayMs}`
  ].join(' ')
}

function createPromotionReport({
  frontendRoot,
  repoRoot = resolve(frontendRoot, '..'),
  env = process.env,
  write,
  verifySignatures = verifyPromotionSignatures
}) {
  const version = readPackageVersion(frontendRoot)
  const githubRepo = inferGitHubRepository(repoRoot, env) || '<owner/name>'
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`
  const targetPolicy = defaultReleasePolicy(version)
  const targetState = normalizeReleasePolicy(targetPolicy, version)
  const currentState = readReleasePolicyState(frontendRoot, version)

  if (!targetState.valid) {
    throw new Error(targetState.errors[0] || 'Generated default release policy is invalid.')
  }

  const alreadyPromoted = releasePolicyPromotesVersion(currentState, version)
  const signatureFailures = []
  const signatureChecks = write ? verifySignatures(frontendRoot, artifactBase, signatureFailures) : []
  const signaturesOk = !write || (signatureChecks.length > 0 && signatureChecks.every((item) => item.ok))
  if (write && !signaturesOk) {
    signatureFailures.push(
      'Policy was not updated. Run npm run dist:win on the signing-capable Windows host, then pass npm run release:check-signatures before promoting Electron to default.'
    )
  }

  if (write && signaturesOk && !alreadyPromoted) {
    writeFileSync(join(frontendRoot, RELEASE_POLICY_PATH), `${JSON.stringify(targetPolicy, null, 2)}\n`, 'utf8')
  }

  const resultingState = write ? readReleasePolicyState(frontendRoot, version) : currentState
  const report = {
    ok: !write || (signaturesOk && releasePolicyPromotesVersion(resultingState, version)),
    mode: write ? 'write' : 'dry-run',
    version,
    path: RELEASE_POLICY_PATH,
    changed: write && signaturesOk && !alreadyPromoted,
    current: currentState,
    target: {
      policy: targetPolicy,
      state: targetState,
      resolved: resolveReleasePolicyState(targetState)
    },
    resulting: resultingState,
    signatureChecks,
    signatureFailures,
    nextRequiredCommands: [
      'npm run release:policy',
      'npm run release:policy:test',
      'npm run release:promote-policy:test',
      'npm run release:promotion-handoff:test',
      'npm run verify:promotion:test',
      'npm run acceptance:handoff:test',
      'npm run acceptance:report:test',
      'npm run acceptance:launch:test',
      'npm run release:preview-manifest:test',
      'npm run release:publication-bundle:test',
      'npm run release:github-publication:test',
      'npm run release:preview-manifest',
      'npm run release:promotion-handoff',
      'npm run acceptance:report:status',
      'npm run acceptance:launch',
      'npm run release:readiness:test',
      'npm run release:signing:test',
      'npm run dist:win',
      'npm run release:check-signatures',
      'npm run release:promote-policy:write',
      'npm run release:check-promotion',
      publicationReportCommand({ repo: githubRepo, version }),
      'npm run acceptance:report:check',
      'npm run migration:audit:strict',
      finalPromotionCommand({ repo: githubRepo, version })
    ],
    warning: write
      ? 'Write mode requires valid Authenticode signatures for the installer, unpacked app executable, and packaged Python sidecar before updating policy.'
      : 'Dry run only. Re-run with --write after the human release decision is made and signed artifacts have passed npm run release:check-signatures.'
  }

  return report
}

function main() {
  const { write } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const report = createPromotionReport({ frontendRoot, write })

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

module.exports = {
  DEFAULT_PUBLICATION_RETRIES,
  DEFAULT_PUBLICATION_RETRY_DELAY_MS,
  createPromotionReport,
  finalPromotionCommand,
  publicationReportCommand,
  parseArgs
}
