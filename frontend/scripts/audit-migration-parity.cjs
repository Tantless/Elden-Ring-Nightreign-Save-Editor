const { existsSync, readFileSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { verifyPromotionSignatures } = require('./authenticode.cjs')
const {
  normalizeReleasePolicy,
  readReleasePolicyState,
  releasePolicyPromotesVersion
} = require('./release-policy.cjs')
const { readAcceptanceReportState } = require('./manual-acceptance-report.cjs')
const { inferGitHubRepository, readGithubPublicationReportState } = require('./check-github-release-publication.cjs')
const { finalPromotionCommand, publicationReportCommand } = require('./promote-release-policy.cjs')

function parseArgs(argv) {
  let strict = false
  let simulatePromotion = false
  let simulateAcceptance = false
  let simulatePublication = false
  for (const arg of argv) {
    if (arg === '--strict') {
      strict = true
      continue
    }
    if (arg === '--simulate-promotion') {
      simulatePromotion = true
      continue
    }
    if (arg === '--simulate-acceptance') {
      simulateAcceptance = true
      continue
    }
    if (arg === '--simulate-publication') {
      simulatePublication = true
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }
  return { strict, simulatePromotion, simulateAcceptance, simulatePublication }
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function readJson(path) {
  return JSON.parse(readText(path))
}

function extractArray(text, marker) {
  const index = text.indexOf(marker)
  if (index < 0) {
    return []
  }
  const start = text.indexOf('[', index)
  if (start < 0) {
    return []
  }

  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '[') {
      depth += 1
    } else if (text[i] === ']') {
      depth -= 1
      if (depth === 0) {
        const body = text.slice(start + 1, i)
        return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1])
      }
    }
  }
  return []
}

function fileState(root, relativePath) {
  const absolutePath = join(root, relativePath)
  const exists = existsSync(absolutePath)
  return {
    path: relativePath,
    exists,
    size: exists ? statSync(absolutePath).size : 0
  }
}

function hasScript(packageJson, scriptName) {
  return typeof packageJson.scripts?.[scriptName] === 'string'
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasWorkflowRunCommand(text, command) {
  const pattern = new RegExp(`(^|\\r?\\n)\\s*run:\\s*${escapeRegExp(command)}\\s*(\\r?\\n|$)`)
  return pattern.test(text)
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

function simulatedSigningState() {
  return {
    hasCertLink: true,
    hasCertPassword: true,
    hasCertName: false,
    ready: true,
    simulated: true
  }
}

function status(ok, reason = '') {
  return { ok, reason }
}

function main() {
  const { strict, simulatePromotion, simulateAcceptance, simulatePublication } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const repoRoot = resolve(frontendRoot, '..')
  const packageJson = readJson(join(frontendRoot, 'package.json'))
  const version = packageJson.version
  const githubRepo = inferGitHubRepository(repoRoot, process.env) || '<owner/name>'
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`

  const smokeAppText = readText(join(frontendRoot, 'scripts', 'smoke-app.cjs'))
  const smokeRendererText = readText(join(frontendRoot, 'scripts', 'smoke-renderer.cjs'))
  const paritySmokeText = readText(join(repoRoot, 'src', 'electron_api', 'smoke_parity.py'))
  const workflowText = readText(join(repoRoot, '.github', 'workflows', 'main.yml'))
  const rendererHtmlText = readText(join(frontendRoot, 'src', 'renderer', 'index.html'))
  const verifyReleaseText = readText(join(frontendRoot, 'scripts', 'verify-release.cjs'))
  const verifyPromotionText = readText(join(frontendRoot, 'scripts', 'verify-promotion.cjs'))
  const verifyPromotionTestText = readText(join(frontendRoot, 'scripts', 'test-verify-promotion.cjs'))
  const manualAcceptanceHandoffText = readText(join(frontendRoot, 'scripts', 'manual-acceptance-handoff.cjs'))
  const manualAcceptanceHandoffTestText = readText(join(frontendRoot, 'scripts', 'test-manual-acceptance-handoff.cjs'))
  const manualAcceptanceReportText = readText(join(frontendRoot, 'scripts', 'manual-acceptance-report.cjs'))
  const manualAcceptanceReportTestText = readText(join(frontendRoot, 'scripts', 'test-manual-acceptance-report.cjs'))
  const previewManifestText = readText(join(frontendRoot, 'scripts', 'preview-manifest.cjs'))
  const previewManifestTestText = readText(join(frontendRoot, 'scripts', 'test-preview-manifest.cjs'))
  const publicationBundleText = readText(join(frontendRoot, 'scripts', 'check-release-artifact-bundle.cjs'))
  const publicationBundleTestText = readText(join(frontendRoot, 'scripts', 'test-release-artifact-bundle.cjs'))
  const githubPublicationText = readText(join(frontendRoot, 'scripts', 'check-github-release-publication.cjs'))
  const githubPublicationTestText = readText(join(frontendRoot, 'scripts', 'test-github-release-publication.cjs'))
  const checkReleaseReadinessText = readText(join(frontendRoot, 'scripts', 'check-release-readiness.cjs'))
  const checkReleaseReadinessTestText = readText(join(frontendRoot, 'scripts', 'test-release-readiness.cjs'))
  const authenticodeText = readText(join(frontendRoot, 'scripts', 'authenticode.cjs'))
  const signPythonSidecarText = readText(join(frontendRoot, 'scripts', 'sign-python-sidecar.cjs'))
  const signPythonSidecarTestText = readText(join(frontendRoot, 'scripts', 'test-sign-python-sidecar.cjs'))
  const promoteReleasePolicyText = readText(join(frontendRoot, 'scripts', 'promote-release-policy.cjs'))
  const promoteReleasePolicyTestText = readText(join(frontendRoot, 'scripts', 'test-promote-release-policy.cjs'))
  const promotionHandoffText = readText(join(frontendRoot, 'scripts', 'promotion-handoff.cjs'))
  const promotionHandoffTestText = readText(join(frontendRoot, 'scripts', 'test-promotion-handoff.cjs'))
  const releasePolicyResolverText = readText(join(frontendRoot, 'scripts', 'resolve-release-policy.cjs'))
  const releasePolicyModuleText = readText(join(frontendRoot, 'scripts', 'release-policy.cjs'))
  const releasePolicyText = `${releasePolicyResolverText}\n${releasePolicyModuleText}`

  const appCalls = extractArray(smokeAppText, 'const requiredCalls =')
  const uiSteps = extractArray(smokeAppText, 'const requiredSteps =')
  const rendererCalls = extractArray(smokeRendererText, 'const requiredCalls =')
  const paritySteps = [...paritySmokeText.matchAll(/self\.step\("([^"]+)"/g)].map((match) => match[1])

  const scripts = {
    verifyRelease: hasScript(packageJson, 'verify:release'),
    verifyReleaseFull: hasScript(packageJson, 'verify:release:full'),
    verifyPromotion: hasScript(packageJson, 'verify:promotion'),
    verifyPromotionTest: hasScript(packageJson, 'verify:promotion:test'),
    acceptanceHandoff: hasScript(packageJson, 'acceptance:handoff'),
    acceptanceHandoffTest: hasScript(packageJson, 'acceptance:handoff:test'),
    acceptanceReportTemplate: hasScript(packageJson, 'acceptance:report:template'),
    acceptanceReportInit: hasScript(packageJson, 'acceptance:report:init'),
    acceptanceReportPreflight: hasScript(packageJson, 'acceptance:report:preflight'),
    acceptanceReportCheck: hasScript(packageJson, 'acceptance:report:check'),
    acceptanceReportTest: hasScript(packageJson, 'acceptance:report:test'),
    releaseCheckPreview: hasScript(packageJson, 'release:check-preview'),
    releaseCheckPromotion: hasScript(packageJson, 'release:check-promotion'),
    releaseReadinessTest: hasScript(packageJson, 'release:readiness:test'),
    releasePreviewManifest: hasScript(packageJson, 'release:preview-manifest'),
    releasePreviewManifestTest: hasScript(packageJson, 'release:preview-manifest:test'),
    releasePublicationBundleCheck: hasScript(packageJson, 'release:publication-bundle:check'),
    releasePublicationBundleTest: hasScript(packageJson, 'release:publication-bundle:test'),
    releaseGithubPublicationCheck: hasScript(packageJson, 'release:github-publication:check'),
    releaseGithubPublicationReport: hasScript(packageJson, 'release:github-publication:report'),
    releaseGithubPublicationTest: hasScript(packageJson, 'release:github-publication:test'),
    releaseCheckSignatures: hasScript(packageJson, 'release:check-signatures'),
    releasePolicy: hasScript(packageJson, 'release:policy'),
    releasePromotePolicy: hasScript(packageJson, 'release:promote-policy'),
    releasePromotePolicyTest: hasScript(packageJson, 'release:promote-policy:test'),
    releasePromotionHandoff: hasScript(packageJson, 'release:promotion-handoff'),
    releasePromotionHandoffTest: hasScript(packageJson, 'release:promotion-handoff:test'),
    releasePolicyTest: hasScript(packageJson, 'release:policy:test'),
    releaseSigningTest: hasScript(packageJson, 'release:signing:test'),
    signPythonSidecar: hasScript(packageJson, 'sign:python-sidecar'),
    migrationAuditPromotionDryRun: hasScript(packageJson, 'migration:audit:promotion-dry-run'),
    smokeRenderer: hasScript(packageJson, 'smoke:renderer'),
    smokeApp: hasScript(packageJson, 'smoke:app'),
    smokeUiDev: hasScript(packageJson, 'smoke:ui:dev'),
    smokePackaged: hasScript(packageJson, 'smoke:packaged')
  }

  const artifactChecks = [
    fileState(frontendRoot, `release/${artifactBase}.exe`),
    fileState(frontendRoot, `release/${artifactBase}.exe.blockmap`),
    fileState(frontendRoot, `release/${artifactBase}.zip`),
    fileState(frontendRoot, 'release/electron-preview-manifest.json'),
    fileState(frontendRoot, 'release/win-unpacked/Nightreign Save Editor.exe'),
    fileState(frontendRoot, 'release/win-unpacked/resources/python/NightreignElectronBridge.exe'),
    fileState(frontendRoot, 'build/icon.ico'),
    fileState(frontendRoot, 'build/icon.png')
  ]
  const artifactsOk = artifactChecks.every((item) => item.exists && item.size > 0)
  const workflowOk =
    workflowText.includes('electron-preview:') &&
    workflowText.includes('node scripts/resolve-release-policy.cjs') &&
    workflowText.includes('npm run release:policy:test') &&
    workflowText.includes('npm run release:promote-policy:test') &&
    workflowText.includes('npm run release:promotion-handoff:test') &&
    workflowText.includes('npm run verify:promotion:test') &&
    workflowText.includes('npm run acceptance:handoff:test') &&
    workflowText.includes('npm run acceptance:report:test') &&
    workflowText.includes('npm run release:readiness:test') &&
    workflowText.includes('npm run release:preview-manifest:test') &&
    workflowText.includes('npm run release:publication-bundle:test') &&
    workflowText.includes('npm run release:github-publication:test') &&
    workflowText.includes('npm run release:signing:test') &&
    workflowText.includes('npm run smoke:renderer') &&
    hasWorkflowRunCommand(workflowText, 'npm run release:preview-manifest') &&
    hasWorkflowRunCommand(workflowText, 'npm run migration:audit') &&
    hasWorkflowRunCommand(workflowText, 'npm run migration:audit:promotion-dry-run') &&
    workflowText.includes('frontend/release/*.blockmap') &&
    workflowText.includes('frontend/release/electron-preview-manifest.json') &&
    workflowText.includes('- electron-preview') &&
    workflowText.includes('uses: actions/download-artifact@v8') &&
    workflowText.includes('merge-multiple: true') &&
    workflowText.includes('release_exists: ${{ steps.check_release.outputs.exists }}') &&
    workflowText.includes('publication_ok: ${{ steps.check_publication.outputs.ok }}') &&
    workflowText.includes('/releases/tags/${TAG_NAME}') &&
    workflowText.includes('node frontend/scripts/check-github-release-publication.cjs --repo "${GITHUB_REPOSITORY}" --tag "${TAG_NAME}" --verify-hashes --retries 0 --retry-delay-ms 0') &&
    workflowText.includes("if: needs.check.outputs.publication_ok != 'true'") &&
    workflowText.includes('overwrite_files: true') &&
    hasWorkflowRunCommand(workflowText, 'node frontend/scripts/check-release-artifact-bundle.cjs ./artifacts') &&
    workflowText.includes('uses: softprops/action-gh-release@v2') &&
    workflowText.includes('files: ./artifacts/*') &&
    hasWorkflowRunCommand(
      workflowText,
      'node frontend/scripts/check-github-release-publication.cjs --repo ${{ github.repository }} --tag ${{ needs.check.outputs.newtag }} --verify-hashes --retries 6 --retry-delay-ms 10000'
    ) &&
    workflowText.includes('steps.electron_policy.outputs.build_script') &&
    workflowText.includes('steps.electron_policy.outputs.check_script') &&
    workflowText.includes('steps.electron_policy.outputs.artifact_name') &&
    releasePolicyText.includes('dist:win:unsigned') &&
    releasePolicyText.includes('release:check-preview') &&
    releasePolicyText.includes('Nightreign_Save_Editor_Electron_WIN64_Preview')

  const functionalParity = status(
    appCalls.length >= 41 &&
      uiSteps.length >= 41 &&
      rendererCalls.length >= 32 &&
      paritySteps.length >= 15 &&
      Object.values(scripts).every(Boolean),
    'Requires app smoke >=41 calls, full UI smoke >=41 steps, renderer smoke >=32 calls, backend parity smoke >=15 steps, and all audit scripts.'
  )

  const previewRelease = status(
    artifactsOk && workflowOk && scripts.releaseCheckPreview && scripts.verifyReleaseFull,
    'Requires stable preview artifacts, preview manifest, publication bundle check, packaged sidecar, icons, CI preview job wiring, and full release gate.'
  )

  const releaseHardening = status(
    rendererHtmlText.includes('Content-Security-Policy') &&
      rendererHtmlText.includes("script-src 'self'") &&
      !rendererHtmlText.includes('unsafe-eval') &&
      verifyReleaseText.includes('shell: false') &&
      !verifyReleaseText.includes('shell: process.platform') &&
      verifyPromotionText.includes('shell: false') &&
      verifyPromotionText.includes('createPromotionVerificationPlan') &&
      verifyPromotionText.includes('release:check-signatures') &&
      verifyPromotionText.includes('release:promote-policy:write') &&
      verifyPromotionText.includes('release:github-publication:report') &&
      verifyPromotionText.includes('verifyPublicationHashes') &&
      verifyPromotionText.includes('publicationRetries') &&
      verifyPromotionText.includes('--retry-delay-ms') &&
      verifyPromotionText.includes('migration:audit:strict') &&
      verifyPromotionTestText.includes('signed build and policy-write promotion plan') &&
      verifyPromotionTestText.includes('plan should verify GitHub publication evidence') &&
      verifyPromotionTestText.includes('--verify-publication-hashes should enable hash verification') &&
      verifyPromotionTestText.includes('--publication-retries should set publication retry count') &&
      verifyPromotionTestText.includes('publication report should run before policy write') &&
      verifyPromotionTestText.includes('shell-free command invocation') &&
      manualAcceptanceHandoffText.includes('manualAcceptanceChecks') &&
      manualAcceptanceHandoffText.includes('Use a copied real save') &&
      manualAcceptanceHandoffText.includes('source save size and lastWriteTime') &&
      manualAcceptanceHandoffTestText.includes('acceptance handoff with copied real save') &&
      manualAcceptanceHandoffTestText.includes('missing copied real save blocks handoff') &&
      manualAcceptanceReportText.includes('readAcceptanceReportState') &&
      manualAcceptanceReportText.includes('validateAcceptancePreflight') &&
      manualAcceptanceReportText.includes('acceptance report requires accepted=true') &&
      manualAcceptanceReportText.includes('copiedSavePath must point to a copied save') &&
      manualAcceptanceReportText.includes('copiedSavePath must exist for completed acceptance') &&
      manualAcceptanceReportText.includes('sourceSave.after.lastWriteTime must match sourceSave.before.lastWriteTime') &&
      manualAcceptanceReportText.includes('current source save lastWriteTime must match sourceSave.after.lastWriteTime') &&
      manualAcceptanceReportText.includes('writeAcceptanceReportTemplate') &&
      manualAcceptanceReportTestText.includes('acceptance preflight validation') &&
      manualAcceptanceReportTestText.includes('completed report should reject the source save') &&
      manualAcceptanceReportTestText.includes('source metadata mutation fails') &&
      manualAcceptanceReportTestText.includes('live source metadata mutation fails') &&
      manualAcceptanceReportTestText.includes('template write keeps acceptance incomplete') &&
      manualAcceptanceReportTestText.includes('failed manual check fails') &&
      previewManifestText.includes('sha256') &&
      previewManifestText.includes('electron-preview-manifest.json') &&
      previewManifestTestText.includes('valid preview manifest') &&
      publicationBundleText.includes('nightreign-release-artifact-bundle') &&
      publicationBundleText.includes('defaultPublicPathChanged') &&
      publicationBundleTestText.includes('missing legacy artifact fails') &&
      publicationBundleTestText.includes('missing Electron artifact fails') &&
      githubPublicationText.includes('nightreign-github-release-publication') &&
      githubPublicationText.includes('defaultPublicPathChanged') &&
      githubPublicationText.includes('readGithubPublicationReportState') &&
      githubPublicationText.includes('writeGithubPublicationReport') &&
      githubPublicationText.includes('must be generated with --verify-hashes') &&
      githubPublicationText.includes('GitHub publication report failure') &&
      githubPublicationText.includes('retryDelayMs') &&
      githubPublicationTestText.includes('missing legacy asset fails') &&
      githubPublicationTestText.includes('missing Electron asset fails') &&
      githubPublicationTestText.includes('default path change fails') &&
      githubPublicationTestText.includes('publication report state') &&
      githubPublicationTestText.includes('publication report state requires hashes') &&
      githubPublicationTestText.includes('publication report state exposes upstream failures') &&
      githubPublicationTestText.includes('publication report state summarizes retries') &&
      checkReleaseReadinessText.includes('verifyPromotionSignatures') &&
      checkReleaseReadinessText.includes('createReadinessReport') &&
      checkReleaseReadinessTestText.includes('promotion verifies and rejects invalid signatures') &&
      checkReleaseReadinessTestText.includes('promotion passes with valid signatures') &&
      authenticodeText.includes('Get-AuthenticodeSignature') &&
      authenticodeText.includes('resources/python/NightreignElectronBridge.exe') &&
      signPythonSidecarText.includes('signtool') &&
      signPythonSidecarText.includes('NightreignElectronBridge.exe') &&
      signPythonSidecarText.includes('materializeCertificate: !dryRun') &&
      signPythonSidecarTestText.includes('example.invalid') &&
      signPythonSidecarTestText.includes('nightreign-csc-') &&
      promoteReleasePolicyText.includes('verifyPromotionSignatures') &&
      promoteReleasePolicyText.includes('inferGitHubRepository') &&
      promoteReleasePolicyText.includes('publicationReportCommand') &&
      promoteReleasePolicyText.includes('Policy was not updated') &&
      promoteReleasePolicyText.includes('release:github-publication:report') &&
      promoteReleasePolicyText.includes('--verify-publication-hashes') &&
      promoteReleasePolicyText.includes('--publication-retries') &&
      promoteReleasePolicyTestText.includes('write blocked by signatures') &&
      promoteReleasePolicyTestText.includes('write allowed by signatures') &&
      promotionHandoffText.includes('createPromotionHandoffReport') &&
      promotionHandoffText.includes('inferGitHubRepository') &&
      promotionHandoffText.includes('publicationReportCommand') &&
      promotionHandoffText.includes('readGithubPublicationReportState') &&
      promotionHandoffText.includes('publicationReport') &&
      promotionHandoffText.includes('readyForPolicyWrite') &&
      promotionHandoffTestText.includes('signed preview ready for policy write') &&
      promotionHandoffTestText.includes('signed default waits for publication report') &&
      promotionHandoffTestText.includes('signed default completion handoff') &&
      packageJson.scripts?.['dist:win']?.includes('sign:python-sidecar') &&
      checkReleaseReadinessText.includes('signatureChecks'),
    'Requires renderer CSP without unsafe-eval, shell-free release command execution, Python sidecar signing before default packaging, dry-run certificate safety, signed-artifact policy-write guard, promotion handoff reporting, one-command promotion verification, preview manifest hashing, publication bundle verification, post-publication GitHub release verification tooling with local report evidence, publication-aware final promotion handoff, live source-save acceptance reporting, and Authenticode promotion checks.'
  )

  const signing = simulatePromotion ? simulatedSigningState() : signingState(process.env)
  const releasePolicy = simulatePromotion
    ? normalizeReleasePolicy(
        {
          electronRelease: {
            channel: 'default',
            defaultArtifact: true,
            promotedVersion: version,
            keepLegacyArtifacts: true
          }
        },
        version
      )
    : readReleasePolicyState(frontendRoot, version)
  const manualDecision = status(
    releasePolicyPromotesVersion(releasePolicy, version),
    `Requires ${releasePolicy.path} to promote Electron ${version} to the default public artifact while keeping legacy artifacts available for rollback.`
  )
  const acceptanceReport = simulateAcceptance
    ? {
        path: 'acceptance-report.json',
        exists: true,
        ok: true,
        simulated: true,
        errors: [],
        expectedChecks: [],
        passedChecks: []
      }
    : readAcceptanceReportState({ frontendRoot, version })
  const manualAcceptance = status(
    acceptanceReport.ok,
    'Requires frontend/acceptance-report.json to confirm all copied-real-save manual acceptance checks passed and the current source save metadata still matches the recorded before/after evidence.'
  )
  const publicationReport = simulatePublication
    ? {
        path: 'github-publication-report.json',
        exists: true,
        ok: true,
        simulated: true,
        errors: [],
        expectedLegacyArtifacts: [],
        publishedLegacyArtifacts: []
      }
    : readGithubPublicationReportState({ frontendRoot, repoRoot, version })
  const previewPublication = status(
    publicationReport.ok,
    'Requires frontend/github-publication-report.json generated by npm run release:github-publication:report -- --verify-hashes after the GitHub Release is published, with Electron preview asset hashes, legacy assets, and default-path safety all verified.'
  )
  const signatureFailures = []
  const signatureChecks =
    !simulatePromotion && signing.ready && manualDecision.ok
      ? verifyPromotionSignatures(frontendRoot, artifactBase, signatureFailures)
      : []
  const signaturesOk = simulatePromotion || signatureChecks.length === 0 || signatureChecks.every((item) => item.ok)
  const promotion = status(
    previewRelease.ok && signing.ready && signaturesOk,
    'Requires preview readiness, Windows signing credentials or signing-host certificate identity, and valid Authenticode signatures when real promotion prerequisites are present.'
  )

  const completionReady =
    functionalParity.ok &&
    previewRelease.ok &&
    releaseHardening.ok &&
    previewPublication.ok &&
    promotion.ok &&
    manualDecision.ok &&
    manualAcceptance.ok
  const report = {
    ok: !strict || completionReady,
    strict,
    simulatePromotion,
    simulateAcceptance,
    simulatePublication,
    completionReady,
    version,
    evidence: {
      appRequiredCalls: appCalls.length,
      uiRequiredSteps: uiSteps.length,
      rendererRequiredCalls: rendererCalls.length,
      backendParitySteps: paritySteps.length,
      scripts,
      artifacts: artifactChecks,
      workflowPreviewJob: workflowOk,
      releaseHardening,
      signing,
      signatureChecks,
      signatureFailures,
      releasePolicy,
      acceptanceReport,
      publicationReport
    },
    simulation: simulatePromotion || simulateAcceptance || simulatePublication
      ? {
          warning: [
            simulatePromotion
              ? 'Promotion dry run only. This does not prove real signing credentials exist and does not modify release-policy.json.'
              : null,
            simulateAcceptance
              ? 'Acceptance dry run only. This does not prove human copied-real-save acceptance was completed.'
              : null,
            simulatePublication
              ? 'Publication dry run only. This does not prove the GitHub Release was published or that release assets are visible.'
              : null
          ].filter(Boolean).join(' ')
        }
      : null,
    gates: {
      functionalParity,
      previewRelease,
      releaseHardening,
      previewPublication,
      promotion,
      manualDecision,
      manualAcceptance
    },
    nextRequiredActions: [
      ...(manualAcceptance.ok
        ? []
        : [
            'Run npm run acceptance:handoff -- <real_save_file>, complete every copied-real-save manual acceptance check, then create frontend/acceptance-report.json and pass npm run acceptance:report:check with live source-save metadata still unchanged.'
          ]),
      ...(previewPublication.ok
        ? []
        : [
            `After the draft GitHub Release for V${version} is published and visible, run ${publicationReportCommand({ repo: githubRepo, version })} and keep the generated frontend/github-publication-report.json for the strict migration audit.`
          ]),
      ...(completionReady
        ? []
        : [
            `On the signing-capable Windows host, run ${finalPromotionCommand({ repo: githubRepo, version })} to execute the final signed/default promotion sequence.`
          ]),
      ...(promotion.ok
        ? []
        : [
            'Provision Windows signing credentials or run on a signing-capable Windows host, then run npm run dist:win, npm run release:check-signatures, and npm run release:check-promotion.'
          ]),
      ...(manualDecision.ok
        ? []
        : [
            `Run npm run release:promote-policy to review the intended default policy, then after signed artifacts pass npm run release:check-signatures, run npm run release:promote-policy:write so ${releasePolicy.path} is updated to channel="default", defaultArtifact=true, promotedVersion="${version}", and keepLegacyArtifacts=true.`
          ])
    ]
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
