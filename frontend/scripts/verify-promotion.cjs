const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

function parseArgs(argv) {
  let build = false
  let writePolicy = false
  let repo = null
  let tag = null
  let verifyPublicationHashes = false
  let publicationRetries = null
  let publicationRetryDelayMs = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--build') {
      build = true
      continue
    }
    if (arg === '--write-policy') {
      writePolicy = true
      continue
    }
    if (arg === '--repo') {
      repo = takeValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg === '--tag') {
      tag = takeValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg === '--verify-publication-hashes') {
      verifyPublicationHashes = true
      continue
    }
    if (arg === '--publication-retries') {
      publicationRetries = parseNonNegativeInteger(takeValue(argv, i, arg), arg)
      i += 1
      continue
    }
    if (arg === '--publication-retry-delay-ms') {
      publicationRetryDelayMs = parseNonNegativeInteger(takeValue(argv, i, arg), arg)
      i += 1
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }
  return { build, writePolicy, repo, tag, verifyPublicationHashes, publicationRetries, publicationRetryDelayMs }
}

function takeValue(argv, index, name) {
  const value = argv[index + 1]
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

function createPromotionVerificationPlan({
  build,
  writePolicy,
  repo = null,
  tag = null,
  verifyPublicationHashes = false,
  publicationRetries = null,
  publicationRetryDelayMs = null
}) {
  const npmCommand = npmCommandForPlatform()
  const publicationArgs = []
  if (repo) {
    publicationArgs.push('--repo', repo)
  }
  if (tag) {
    publicationArgs.push('--tag', tag)
  }
  if (verifyPublicationHashes) {
    publicationArgs.push('--verify-hashes')
  }
  if (publicationRetries !== null) {
    publicationArgs.push('--retries', String(publicationRetries))
  }
  if (publicationRetryDelayMs !== null) {
    publicationArgs.push('--retry-delay-ms', String(publicationRetryDelayMs))
  }
  const steps = [
    step('Version alignment', 'version:check'),
    step('Electron release policy', 'release:policy'),
    step('Electron release policy tests', 'release:policy:test'),
    step('Electron promotion policy tests', 'release:promote-policy:test'),
    step('Electron promotion handoff tests', 'release:promotion-handoff:test'),
    step('Electron manual acceptance launch tests', 'acceptance:launch:test'),
    step('Electron readiness tests', 'release:readiness:test'),
    step('Electron signing dry-run tests', 'release:signing:test')
  ]

  if (build) {
    steps.push(step('Signed Windows build', 'dist:win'))
  }

  steps.push(
    step('Authenticode signature check', 'release:check-signatures'),
    step('Promotion handoff report', 'release:promotion-handoff')
  )

  if (!writePolicy) {
    steps.push(step('Default promotion readiness', 'release:check-promotion'))
  }

  steps.push(
    step('GitHub publication report', 'release:github-publication:report', npmCommand, publicationArgs),
    step('Manual acceptance report', 'acceptance:report:check')
  )

  if (writePolicy) {
    steps.push(
      step('Write default Electron release policy', 'release:promote-policy:write'),
      step('Resolve promoted Electron release policy', 'release:policy')
    )
  }

  steps.push(
    ...(writePolicy ? [step('Default promotion readiness', 'release:check-promotion')] : []),
    step('Strict migration completion audit', 'migration:audit:strict')
  )

  return steps
}

function npmCommandForPlatform(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}

function step(label, script, command = npmCommandForPlatform(), scriptArgs = []) {
  return {
    label,
    command,
    args: ['run', script, ...(scriptArgs.length > 0 ? ['--', ...scriptArgs] : [])],
    script,
    scriptArgs
  }
}

function commandInvocation(command, args, platform = process.platform, comSpec = process.env.ComSpec) {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args]
    }
  }

  return { command, args }
}

function runStep(stepConfig, cwd = resolve(__dirname, '..')) {
  console.log(`\n==> ${stepConfig.label}`)
  console.log(`${stepConfig.command} ${stepConfig.args.join(' ')}`)
  const invocation = commandInvocation(stepConfig.command, stepConfig.args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env: process.env,
    shell: false,
    stdio: 'inherit'
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${stepConfig.label} failed with exit code ${result.status}`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const plan = createPromotionVerificationPlan(options)

  console.log(JSON.stringify({
    mode: 'promotion',
    build: options.build,
    writePolicy: options.writePolicy,
    repo: options.repo,
    tag: options.tag,
    verifyPublicationHashes: options.verifyPublicationHashes,
    publicationRetries: options.publicationRetries,
    publicationRetryDelayMs: options.publicationRetryDelayMs,
    steps: plan.map((item) => item.script),
    note: options.writePolicy
      ? 'This run may update release-policy.json after signed artifacts pass.'
      : 'This run is non-mutating and assumes release-policy.json is already promoted.'
  }, null, 2))

  for (const planStep of plan) {
    runStep(planStep)
  }

  console.log('\nPromotion verification passed.')
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
  commandInvocation,
  createPromotionVerificationPlan,
  npmCommandForPlatform,
  parseArgs
}
