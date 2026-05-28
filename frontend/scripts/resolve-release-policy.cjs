const { appendFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { readPackageVersion, resolveReleasePolicy } = require('./release-policy.cjs')

function main() {
  const frontendRoot = resolve(__dirname, '..')
  const resolved = resolveReleasePolicy(frontendRoot, readPackageVersion(frontendRoot))

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `channel=${resolved.channel}`,
        `artifact_name=${resolved.artifactName}`,
        `build_script=${resolved.buildScript}`,
        `check_script=${resolved.checkScript}`,
        `requires_signing=${resolved.requiresSigning}`
      ].join('\n') + '\n'
    )
  }

  console.log(JSON.stringify(resolved, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
