const { resolve } = require('node:path')
const { verifyPromotionSignatures } = require('./authenticode.cjs')
const { createReadinessReport } = require('./check-release-readiness.cjs')
const { inferGitHubRepository, readGithubPublicationReportState } = require('./check-github-release-publication.cjs')
const { createAcceptanceReportStatus, readAcceptanceReportState } = require('./manual-acceptance-report.cjs')
const { createPromotionReport, finalPromotionCommand, publicationReportCommand } = require('./promote-release-policy.cjs')
const { readPackageVersion } = require('./release-policy.cjs')

function createPromotionHandoffReport({
  frontendRoot,
  repoRoot = resolve(frontendRoot, '..'),
  env = process.env,
  verifySignatures = verifyPromotionSignatures
}) {
  const version = readPackageVersion(frontendRoot)
  const githubRepo = inferGitHubRepository(repoRoot, env) || '<owner/name>'
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`
  const preview = createReadinessReport({
    mode: 'preview',
    frontendRoot,
    repoRoot,
    env,
    verifySignatures
  })
  const promotion = createReadinessReport({
    mode: 'promotion',
    frontendRoot,
    repoRoot,
    env,
    verifySignatures
  })
  const signatureFailures = []
  const signatureChecks = verifySignatures(frontendRoot, artifactBase, signatureFailures)
  const signaturesOk = signatureChecks.length > 0 && signatureChecks.every((item) => item.ok)
  const acceptanceReport = readAcceptanceReportState({ frontendRoot, version })
  const acceptanceStatus = createAcceptanceReportStatus({ frontendRoot, version })
  const publicationReport = readGithubPublicationReportState({ frontendRoot, repoRoot, version })
  const promotionPlan = createPromotionReport({
    frontendRoot,
    repoRoot,
    env,
    write: false,
    verifySignatures
  })
  const remaining = []

  if (!preview.ok) {
    remaining.push('Fix preview artifact or CI wiring failures before signing promotion artifacts.')
  }
  if (!promotion.signing.ready) {
    remaining.push(
      'Provision Windows signing credentials with WIN_CSC_LINK/CSC_LINK plus password, or WIN_CSC_NAME/CSC_NAME on the signing host.'
    )
  }
  if (!signaturesOk) {
    remaining.push('Run npm run dist:win on the signing-capable Windows host, then run npm run release:check-signatures.')
  }
  if (!promotion.defaultReleaseDecision.ok) {
    remaining.push(
      `After signatures pass, run npm run release:promote-policy:write to promote Electron ${version} as the default artifact.`
    )
  }
  if (!promotion.ok) {
    remaining.push('Run npm run release:check-promotion after policy promotion.')
  }
  if (!publicationReport.ok) {
    remaining.push(
      `After the GitHub Release for V${version} is published and visible, run ${publicationReportCommand({ repo: githubRepo, version })}.`
    )
  }
  if (!acceptanceReport.ok) {
    if (acceptanceStatus.readyForHumanAcceptance) {
      remaining.push(
        `Run ${acceptanceStatus.commands.launch} for the next copied-real-save manual check, record the result with ${acceptanceStatus.commands.markNextPass} or ${acceptanceStatus.commands.markNextFail}, then finish with ${acceptanceStatus.commands.finalCheck}.`
      )
    } else {
      remaining.push(
        'Prepare copied-real-save manual acceptance with npm run acceptance:handoff -- <real_save_file>, npm run acceptance:report:init -- --source-save <real_save_file>, npm run acceptance:report:status, then npm run acceptance:launch.'
      )
    }
  }

  return {
    ok: preview.ok,
    completionReady: promotion.ok && publicationReport.ok && acceptanceReport.ok,
    readyForPolicyWrite: preview.ok && signaturesOk,
    version,
    preview: {
      ok: preview.ok,
      failures: preview.failures
    },
    promotion: {
      ok: promotion.ok,
      signing: promotion.signing,
      defaultReleaseDecision: promotion.defaultReleaseDecision,
      signatureChecks: promotion.signatureChecks,
      failures: promotion.failures
    },
    currentPolicy: promotionPlan.current,
    targetPolicy: promotionPlan.target,
    signatureChecks,
    signatureFailures,
    publicationReport,
    acceptanceReport,
    acceptanceStatus,
    finalPromotionCommand: finalPromotionCommand({ repo: githubRepo, version }),
    remaining,
    nextRequiredCommands: promotionPlan.nextRequiredCommands
  }
}

function main() {
  const frontendRoot = resolve(__dirname, '..')
  const report = createPromotionHandoffReport({ frontendRoot })
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
  createPromotionHandoffReport
}
