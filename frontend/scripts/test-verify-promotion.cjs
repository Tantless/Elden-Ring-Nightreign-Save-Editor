const {
  commandInvocation,
  createPromotionVerificationPlan,
  npmCommandForPlatform,
  parseArgs
} = require('./verify-promotion.cjs')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function scripts(plan) {
  return plan.map((item) => item.script)
}

function indexOf(values, value) {
  const index = values.indexOf(value)
  assert(index >= 0, `missing script: ${value}`)
  return index
}

function lastIndexOf(values, value) {
  const index = values.lastIndexOf(value)
  assert(index >= 0, `missing script: ${value}`)
  return index
}

function assertBefore(values, earlier, later) {
  assert(indexOf(values, earlier) < indexOf(values, later), `${earlier} should run before ${later}`)
}

function main() {
  const cases = []

  const parsedEmpty = parseArgs([])
  assert(parsedEmpty.build === false, 'default args should not build')
  assert(parsedEmpty.writePolicy === false, 'default args should not write policy')
  assert(parsedEmpty.repo === null, 'default args should not set repo')
  assert(parsedEmpty.tag === null, 'default args should not set tag')
  assert(parsedEmpty.verifyPublicationHashes === false, 'default args should not verify publication hashes')
  assert(parsedEmpty.publicationRetries === null, 'default args should not set publication retries')
  assert(parsedEmpty.publicationRetryDelayMs === null, 'default args should not set publication retry delay')

  const parsedFull = parseArgs([
    '--build',
    '--write-policy',
    '--repo',
    'Tantless/Elden-Ring-Nightreign-Save-Editor',
    '--tag',
    'V4.6.6',
    '--verify-publication-hashes',
    '--publication-retries',
    '6',
    '--publication-retry-delay-ms',
    '10000'
  ])
  assert(parsedFull.build === true, '--build should enable build')
  assert(parsedFull.writePolicy === true, '--write-policy should enable policy write')
  assert(parsedFull.repo === 'Tantless/Elden-Ring-Nightreign-Save-Editor', '--repo should set publication repo')
  assert(parsedFull.tag === 'V4.6.6', '--tag should set publication tag')
  assert(parsedFull.verifyPublicationHashes === true, '--verify-publication-hashes should enable hash verification')
  assert(parsedFull.publicationRetries === 6, '--publication-retries should set publication retry count')
  assert(parsedFull.publicationRetryDelayMs === 10000, '--publication-retry-delay-ms should set retry delay')

  try {
    parseArgs(['--unexpected'])
    throw new Error('unexpected argument should fail')
  } catch (error) {
    assert(String(error.message).includes('Unexpected argument'), 'unexpected argument error should be explicit')
  }
  try {
    parseArgs(['--repo'])
    throw new Error('missing repo argument should fail')
  } catch (error) {
    assert(String(error.message).includes('--repo requires a value'), 'missing repo value error should be explicit')
  }
  try {
    parseArgs(['--publication-retries', '-1'])
    throw new Error('invalid publication retries should fail')
  } catch (error) {
    assert(String(error.message).includes('--publication-retries must be a non-negative integer'), 'invalid retry count error should be explicit')
  }
  cases.push({ name: 'argument parsing', ok: true })

  const defaultPlan = createPromotionVerificationPlan({ build: false, writePolicy: false })
  const defaultScripts = scripts(defaultPlan)
  assert(!defaultScripts.includes('dist:win'), 'non-build plan should not build signed artifacts')
  assert(!defaultScripts.includes('release:promote-policy:write'), 'non-write plan should not write policy')
  assert(defaultScripts.includes('release:check-signatures'), 'plan should check signatures')
  assert(defaultScripts.includes('release:promotion-handoff'), 'plan should include handoff report')
  assert(defaultScripts.includes('release:check-promotion'), 'plan should check default promotion readiness')
  assert(defaultScripts.includes('release:github-publication:report'), 'plan should verify GitHub publication evidence')
  assert(defaultScripts.includes('acceptance:report:check'), 'plan should check manual acceptance report')
  assert(defaultScripts.includes('migration:audit:strict'), 'plan should end with strict migration audit')
  assertBefore(defaultScripts, 'release:check-signatures', 'release:promotion-handoff')
  assertBefore(defaultScripts, 'release:promotion-handoff', 'release:check-promotion')
  assertBefore(defaultScripts, 'release:check-promotion', 'release:github-publication:report')
  assertBefore(defaultScripts, 'release:github-publication:report', 'acceptance:report:check')
  assertBefore(defaultScripts, 'acceptance:report:check', 'migration:audit:strict')
  cases.push({ name: 'non-mutating promotion plan', ok: true })

  const fullPlan = createPromotionVerificationPlan({
    build: true,
    writePolicy: true,
    repo: 'Tantless/Elden-Ring-Nightreign-Save-Editor',
    tag: 'V4.6.6',
    verifyPublicationHashes: true,
    publicationRetries: 6,
    publicationRetryDelayMs: 10000
  })
  const fullScripts = scripts(fullPlan)
  const fullPublicationStep = fullPlan.find((item) => item.script === 'release:github-publication:report')
  assert(fullScripts.includes('dist:win'), 'build plan should include signed Windows build')
  assert(fullScripts.includes('release:promote-policy:write'), 'write plan should include policy write')
  assert(fullPublicationStep, 'full plan should include publication report step')
  assert(
    fullPublicationStep.args.join(' ') ===
      'run release:github-publication:report -- --repo Tantless/Elden-Ring-Nightreign-Save-Editor --tag V4.6.6 --verify-hashes --retries 6 --retry-delay-ms 10000',
    'publication report step should pass explicit repo, tag, hash verification, and retry settings'
  )
  assertBefore(fullScripts, 'dist:win', 'release:check-signatures')
  assertBefore(fullScripts, 'release:check-signatures', 'release:promotion-handoff')
  assertBefore(fullScripts, 'release:promotion-handoff', 'release:github-publication:report')
  assertBefore(fullScripts, 'release:github-publication:report', 'acceptance:report:check')
  assertBefore(fullScripts, 'acceptance:report:check', 'release:promote-policy:write')
  assert(
    indexOf(fullScripts, 'release:promote-policy:write') < lastIndexOf(fullScripts, 'release:policy'),
    'policy write should run before the post-write policy resolve'
  )
  assert(lastIndexOf(fullScripts, 'release:policy') < indexOf(fullScripts, 'release:check-promotion'), 'post-write policy resolve should run before promotion check')
  assertBefore(fullScripts, 'release:check-promotion', 'migration:audit:strict')
  assert(
    indexOf(fullScripts, 'release:github-publication:report') < indexOf(fullScripts, 'release:promote-policy:write'),
    'publication report should run before policy write'
  )
  assert(
    indexOf(fullScripts, 'acceptance:report:check') < indexOf(fullScripts, 'release:promote-policy:write'),
    'acceptance report should run before policy write'
  )
  cases.push({ name: 'signed build and policy-write promotion plan', ok: true })

  assert(npmCommandForPlatform('win32') === 'npm.cmd', 'Windows npm command should use npm.cmd')
  assert(npmCommandForPlatform('linux') === 'npm', 'Non-Windows npm command should use npm')

  const winInvocation = commandInvocation('npm.cmd', ['run', 'release:policy'], 'win32', 'C:\\Windows\\System32\\cmd.exe')
  assert(winInvocation.command === 'C:\\Windows\\System32\\cmd.exe', 'Windows .cmd should be invoked through ComSpec')
  assert(winInvocation.args.join(' ') === '/d /s /c npm.cmd run release:policy', 'Windows .cmd invocation args should be stable')

  const nodeInvocation = commandInvocation('node', ['scripts/verify-promotion.cjs'], 'win32', 'cmd.exe')
  assert(nodeInvocation.command === 'node', 'Direct node command should remain shell-free')
  assert(nodeInvocation.args[0] === 'scripts/verify-promotion.cjs', 'Direct node args should be preserved')
  cases.push({ name: 'shell-free command invocation', ok: true })

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
