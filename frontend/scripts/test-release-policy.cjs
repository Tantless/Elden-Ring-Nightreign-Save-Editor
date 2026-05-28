const {
  defaultReleasePolicy,
  normalizeReleasePolicy,
  readPackageVersion,
  releasePolicyPromotesVersion,
  resolveReleasePolicyState
} = require('./release-policy.cjs')
const { resolve } = require('node:path')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function main() {
  const frontendRoot = resolve(__dirname, '..')
  const version = readPackageVersion(frontendRoot)
  const cases = [
    {
      name: 'preview policy',
      policy: {
        electronRelease: {
          channel: 'preview',
          defaultArtifact: false,
          promotedVersion: null,
          keepLegacyArtifacts: true
        }
      },
      valid: true,
      promotes: false,
      resolved: {
        channel: 'preview',
        artifactName: 'Nightreign_Save_Editor_Electron_WIN64_Preview',
        buildScript: 'dist:win:unsigned',
        checkScript: 'release:check-preview',
        requiresSigning: false
      }
    },
    {
      name: 'default policy',
      policy: {
        electronRelease: {
          channel: 'default',
          defaultArtifact: true,
          promotedVersion: version,
          keepLegacyArtifacts: true
        }
      },
      valid: true,
      promotes: true,
      resolved: {
        channel: 'default',
        artifactName: 'Nightreign_Save_Editor_Electron_WIN64',
        buildScript: 'dist:win',
        checkScript: 'release:check-promotion',
        requiresSigning: true
      }
    },
    {
      name: 'generated default policy',
      policy: defaultReleasePolicy(version),
      valid: true,
      promotes: true,
      resolved: {
        channel: 'default',
        artifactName: 'Nightreign_Save_Editor_Electron_WIN64',
        buildScript: 'dist:win',
        checkScript: 'release:check-promotion',
        requiresSigning: true
      }
    },
    {
      name: 'default version mismatch',
      policy: {
        electronRelease: {
          channel: 'default',
          defaultArtifact: true,
          promotedVersion: '0.0.0',
          keepLegacyArtifacts: true
        }
      },
      valid: false,
      promotes: false
    },
    {
      name: 'preview cannot be default artifact',
      policy: {
        electronRelease: {
          channel: 'preview',
          defaultArtifact: true,
          promotedVersion: version,
          keepLegacyArtifacts: true
        }
      },
      valid: false,
      promotes: false
    },
    {
      name: 'legacy rollback must stay available',
      policy: {
        electronRelease: {
          channel: 'default',
          defaultArtifact: true,
          promotedVersion: version,
          keepLegacyArtifacts: false
        }
      },
      valid: false,
      promotes: false
    }
  ]

  const results = cases.map((testCase) => {
    const state = normalizeReleasePolicy(testCase.policy, version)
    const promotes = releasePolicyPromotesVersion(state, version)
    assert(state.valid === testCase.valid, `${testCase.name}: expected valid=${testCase.valid}`)
    assert(promotes === testCase.promotes, `${testCase.name}: expected promotes=${testCase.promotes}`)
    if (testCase.resolved) {
      const resolved = resolveReleasePolicyState(state)
      for (const [key, expected] of Object.entries(testCase.resolved)) {
        assert(resolved[key] === expected, `${testCase.name}: expected ${key}=${expected}`)
      }
    } else if (!state.valid) {
      let rejected = false
      try {
        resolveReleasePolicyState(state)
      } catch (_error) {
        rejected = true
      }
      assert(rejected, `${testCase.name}: invalid policy should not resolve`)
    }
    return {
      name: testCase.name,
      valid: state.valid,
      promotes,
      resolved: testCase.resolved ? resolveReleasePolicyState(state) : null,
      errors: state.errors
    }
  })

  console.log(JSON.stringify({ ok: true, version, cases: results }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
