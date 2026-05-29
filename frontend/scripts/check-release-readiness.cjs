const { existsSync, readFileSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { verifyPromotionSignatures } = require('./authenticode.cjs')
const { readReleasePolicyState, releasePolicyPromotesVersion } = require('./release-policy.cjs')

function parseArgs(argv) {
  let mode = 'preview'
  for (const arg of argv) {
    if (arg === '--preview') {
      mode = 'preview'
      continue
    }
    if (arg === '--promotion') {
      mode = 'promotion'
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }
  return { mode }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function checkFile(root, relativePath, label, failures) {
  const absolutePath = join(root, relativePath)
  const exists = existsSync(absolutePath)
  const size = exists ? statSync(absolutePath).size : 0
  const ok = exists && size > 0
  if (!ok) {
    failures.push(`${label} missing or empty: ${relativePath}`)
  }
  return { label, relativePath, ok, size }
}

function checkContains(text, pattern, label, failures) {
  const ok = text.includes(pattern)
  if (!ok) {
    failures.push(`${label} is missing: ${pattern}`)
  }
  return { label, ok, pattern }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function checkWorkflowRunCommand(text, command, label, failures) {
  const pattern = new RegExp(`(^|\\r?\\n)\\s*run:\\s*${escapeRegExp(command)}\\s*(\\r?\\n|$)`)
  const ok = pattern.test(text)
  if (!ok) {
    failures.push(`${label} is missing workflow run command: ${command}`)
  }
  return { label, ok, pattern: command }
}

function signingState(env) {
  const hasCertLink = Boolean(env.WIN_CSC_LINK || env.CSC_LINK)
  const hasCertPassword = Boolean(env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD)
  const hasCertName = Boolean(env.WIN_CSC_NAME || env.CSC_NAME)
  return {
    hasCertLink,
    hasCertPassword,
    hasCertName,
    ready: (hasCertLink && hasCertPassword) || hasCertName
  }
}

function createReadinessReport({
  mode,
  frontendRoot,
  repoRoot = resolve(frontendRoot, '..'),
  env = process.env,
  verifySignatures = verifyPromotionSignatures,
  requirePreviewManifest = false
}) {
  const failures = []
  const packageJson = readJson(join(frontendRoot, 'package.json'))
  const version = packageJson.version
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`

  const artifacts = [
    checkFile(frontendRoot, `release/${artifactBase}.exe`, 'Windows installer', failures),
    checkFile(frontendRoot, `release/${artifactBase}.exe.blockmap`, 'Windows installer blockmap', failures),
    checkFile(frontendRoot, `release/${artifactBase}.zip`, 'Windows portable zip', failures),
    checkFile(frontendRoot, 'release/win-unpacked/Nightreign Save Editor.exe', 'Unpacked app executable', failures),
    checkFile(
      frontendRoot,
      'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
      'Packaged Python sidecar',
      failures
    ),
    checkFile(frontendRoot, 'build/icon.ico', 'Windows app icon', failures),
    checkFile(frontendRoot, 'build/icon.png', 'PNG app icon', failures)
  ]
  if (mode === 'preview' && requirePreviewManifest) {
    artifacts.push(
      checkFile(
        frontendRoot,
        'release/electron-preview-manifest.json',
        'Electron preview manifest',
        failures
      )
    )
  }

  const workflowPath = join(repoRoot, '.github', 'workflows', 'main.yml')
  const workflowText = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf8') : ''
  if (!workflowText) {
    failures.push('GitHub Actions workflow is missing: .github/workflows/main.yml')
  }
  const releasePolicyResolverPath = join(frontendRoot, 'scripts', 'resolve-release-policy.cjs')
  const releasePolicyResolverText = existsSync(releasePolicyResolverPath)
    ? readFileSync(releasePolicyResolverPath, 'utf8')
    : ''
  if (!releasePolicyResolverText) {
    failures.push('Electron release policy resolver is missing: frontend/scripts/resolve-release-policy.cjs')
  }
  const releasePolicyModulePath = join(frontendRoot, 'scripts', 'release-policy.cjs')
  const releasePolicyModuleText = existsSync(releasePolicyModulePath)
    ? readFileSync(releasePolicyModulePath, 'utf8')
    : ''
  if (!releasePolicyModuleText) {
    failures.push('Electron release policy module is missing: frontend/scripts/release-policy.cjs')
  }
  const releasePolicyText = `${releasePolicyResolverText}\n${releasePolicyModuleText}`
  const ciPreview = [
    checkContains(workflowText, 'electron-preview:', 'Electron preview job', failures),
    checkContains(
      workflowText,
      'node scripts/resolve-release-policy.cjs',
      'Electron release policy resolver',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:policy:test',
      'Electron release policy tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:promote-policy:test',
      'Electron promotion policy tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:promotion-handoff:test',
      'Electron promotion handoff tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run verify:promotion:test',
      'Electron promotion verifier tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run acceptance:handoff:test',
      'Electron manual acceptance handoff tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run acceptance:report:test',
      'Electron manual acceptance report tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run acceptance:launch:test',
      'Electron manual acceptance launch tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:readiness:test',
      'Electron release readiness tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:preview-manifest:test',
      'Electron preview manifest tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:publication-bundle:test',
      'Release artifact bundle tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:github-publication:test',
      'GitHub release publication tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run release:signing:test',
      'Electron signing dry-run tests',
      failures
    ),
    checkContains(
      workflowText,
      'npm run electron:ensure',
      'Electron binary install verification in CI',
      failures
    ),
    checkContains(
      workflowText,
      'npm run smoke:renderer',
      'Electron renderer smoke in CI',
      failures
    ),
    checkWorkflowRunCommand(
      workflowText,
      'npm run release:preview-manifest',
      'Electron preview manifest generation in CI',
      failures
    ),
    checkContains(
      workflowText,
      'frontend/release/electron-preview-manifest.json',
      'Electron preview manifest artifact upload',
      failures
    ),
    checkWorkflowRunCommand(
      workflowText,
      'node frontend/scripts/check-release-artifact-bundle.cjs ./artifacts',
      'Draft release artifact bundle check',
      failures
    ),
    checkWorkflowRunCommand(
      workflowText,
      'npm run migration:audit',
      'Electron migration audit in CI',
      failures
    ),
    checkWorkflowRunCommand(
      workflowText,
      'npm run migration:audit:promotion-dry-run',
      'Electron promotion dry-run audit in CI',
      failures
    ),
    checkContains(
      workflowText,
      'frontend/release/*.blockmap',
      'Electron blockmap artifact upload',
      failures
    ),
    checkContains(
      workflowText,
      '- electron-preview',
      'Electron preview completion before release check',
      failures
    ),
    checkContains(
      workflowText,
      'uses: actions/download-artifact@v8',
      'Draft release artifact download',
      failures
    ),
    checkContains(
      workflowText,
      'merge-multiple: true',
      'Draft release merges all artifacts',
      failures
    ),
    checkContains(
      workflowText,
      'release_exists: ${{ steps.check_release.outputs.exists }}',
      'Draft release existence output',
      failures
    ),
    checkContains(
      workflowText,
      'publication_ok: ${{ steps.check_publication.outputs.ok }}',
      'Draft release publication output',
      failures
    ),
    checkContains(
      workflowText,
      '/releases/tags/${TAG_NAME}',
      'Draft release existence lookup',
      failures
    ),
    checkContains(
      workflowText,
      'node frontend/scripts/check-github-release-publication.cjs --repo "${GITHUB_REPOSITORY}" --tag "${TAG_NAME}" --verify-hashes --retries 0 --retry-delay-ms 0',
      'Draft release existing-publication verifier',
      failures
    ),
    checkContains(
      workflowText,
      "if: needs.check.outputs.publication_ok != 'true'",
      'Draft release runs when publication is incomplete',
      failures
    ),
    checkContains(
      workflowText,
      'uses: softprops/action-gh-release@v2',
      'Draft release creation',
      failures
    ),
    checkContains(
      workflowText,
      'overwrite_files: true',
      'Draft release overwrites stale assets',
      failures
    ),
    checkContains(
      workflowText,
      'files: ./artifacts/*',
      'Draft release includes downloaded artifacts',
      failures
    ),
    checkWorkflowRunCommand(
      workflowText,
      'node frontend/scripts/check-github-release-publication.cjs --repo ${{ github.repository }} --tag ${{ needs.check.outputs.newtag }} --verify-hashes --retries 6 --retry-delay-ms 10000',
      'Draft release post-publication GitHub hash check',
      failures
    ),
    checkContains(
      workflowText,
      'steps.electron_policy.outputs.build_script',
      'Electron policy-driven build script',
      failures
    ),
    checkContains(
      workflowText,
      'steps.electron_policy.outputs.check_script',
      'Electron policy-driven check script',
      failures
    ),
    checkContains(
      workflowText,
      'steps.electron_policy.outputs.artifact_name',
      'Electron policy-driven artifact name',
      failures
    ),
    checkContains(
      releasePolicyText,
      'dist:win:unsigned',
      'Electron unsigned preview build script',
      failures
    ),
    checkContains(
      releasePolicyText,
      'release:check-preview',
      'Electron preview artifact audit script',
      failures
    ),
    checkContains(
      releasePolicyText,
      'Nightreign_Save_Editor_Electron_WIN64_Preview',
      'Electron preview artifact upload',
      failures
    )
  ]

  const signing = signingState(env)
  const releasePolicy = readReleasePolicyState(frontendRoot, version)
  const defaultReleaseDecision = {
    ok: releasePolicyPromotesVersion(releasePolicy, version),
    reason: `Requires ${releasePolicy.path} to promote Electron ${version} to the default public artifact while keeping legacy artifacts available for rollback. Review with npm run release:promote-policy and write with npm run release:promote-policy:write when the release decision is made.`
  }
  if (mode === 'promotion' && !signing.ready) {
    failures.push(
      'Promotion mode requires Windows signing credentials: set WIN_CSC_LINK/CSC_LINK with WIN_CSC_KEY_PASSWORD/CSC_KEY_PASSWORD, or provide WIN_CSC_NAME/CSC_NAME on the signing host.'
    )
  }
  if (mode === 'promotion' && !defaultReleaseDecision.ok) {
    failures.push(defaultReleaseDecision.reason)
  }
  const shouldVerifySignatures = mode === 'promotion' && signing.ready && defaultReleaseDecision.ok
  const signatureChecks = shouldVerifySignatures ? verifySignatures(frontendRoot, artifactBase, failures) : []

  return {
    ok: failures.length === 0,
    mode,
    version,
    artifacts,
    ciPreview,
    signing,
    signatureChecks,
    releasePolicy,
    defaultReleaseDecision,
    failures
  }
}

function main() {
  const { mode } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const report = createReadinessReport({
    mode,
    frontendRoot,
    requirePreviewManifest: mode === 'preview'
  })
  console.log(JSON.stringify(report, null, 2))

  if (report.failures.length > 0) {
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
  createReadinessReport,
  parseArgs,
  signingState
}
