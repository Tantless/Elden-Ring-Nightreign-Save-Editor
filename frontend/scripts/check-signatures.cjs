const { resolve } = require('node:path')
const { readPackageVersion } = require('./release-policy.cjs')
const { verifyPromotionSignatures } = require('./authenticode.cjs')

function main() {
  const frontendRoot = resolve(__dirname, '..')
  const version = readPackageVersion(frontendRoot)
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`
  const failures = []
  const signatureChecks = verifyPromotionSignatures(frontendRoot, artifactBase, failures)
  const report = {
    ok: failures.length === 0,
    version,
    signatureChecks,
    failures
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
