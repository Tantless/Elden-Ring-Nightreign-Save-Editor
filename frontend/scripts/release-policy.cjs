const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const RELEASE_POLICY_PATH = 'release-policy.json'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readPackageVersion(frontendRoot) {
  return readJson(join(frontendRoot, 'package.json')).version
}

function defaultReleasePolicy(version) {
  return {
    electronRelease: {
      channel: 'default',
      defaultArtifact: true,
      promotedVersion: version,
      keepLegacyArtifacts: true
    }
  }
}

function buildState(overrides) {
  return {
    path: RELEASE_POLICY_PATH,
    exists: false,
    valid: false,
    channel: null,
    defaultArtifact: false,
    promotedVersion: null,
    keepLegacyArtifacts: false,
    parseError: null,
    errors: [],
    ...overrides
  }
}

function normalizeReleasePolicy(policy, version) {
  const errors = []
  const electronRelease = policy?.electronRelease
  if (!electronRelease || typeof electronRelease !== 'object' || Array.isArray(electronRelease)) {
    errors.push('release-policy.json must contain an electronRelease object.')
  }

  const release = electronRelease && typeof electronRelease === 'object' ? electronRelease : {}
  const channel = typeof release.channel === 'string' ? release.channel : null
  const defaultArtifactValue = release.defaultArtifact
  const defaultArtifact = typeof defaultArtifactValue === 'boolean' ? defaultArtifactValue : false
  const promotedVersionValue = release.promotedVersion
  const promotedVersion = typeof promotedVersionValue === 'string' ? promotedVersionValue : null
  const keepLegacyArtifactsValue = release.keepLegacyArtifacts
  const keepLegacyArtifacts = typeof keepLegacyArtifactsValue === 'boolean' ? keepLegacyArtifactsValue : false

  if (channel !== 'preview' && channel !== 'default') {
    errors.push('electronRelease.channel must be "preview" or "default".')
  }
  if (typeof defaultArtifactValue !== 'boolean') {
    errors.push('electronRelease.defaultArtifact must be a boolean.')
  }
  if (promotedVersionValue !== null && typeof promotedVersionValue !== 'string') {
    errors.push('electronRelease.promotedVersion must be null or a string.')
  }
  if (keepLegacyArtifactsValue !== true) {
    errors.push('electronRelease.keepLegacyArtifacts must stay true for the migration release.')
  }
  if (channel === 'preview' && (defaultArtifact !== false || promotedVersionValue !== null)) {
    errors.push('Preview Electron policy requires defaultArtifact=false and promotedVersion=null.')
  }
  if (channel === 'default' && (defaultArtifact !== true || promotedVersion !== version)) {
    errors.push(`Default Electron policy requires defaultArtifact=true and promotedVersion="${version}".`)
  }

  return buildState({
    exists: true,
    valid: errors.length === 0,
    channel,
    defaultArtifact,
    promotedVersion,
    keepLegacyArtifacts,
    errors
  })
}

function readReleasePolicyState(frontendRoot, version) {
  const absolutePath = join(frontendRoot, RELEASE_POLICY_PATH)
  if (!existsSync(absolutePath)) {
    return buildState({
      errors: [`Missing release policy: ${RELEASE_POLICY_PATH}`]
    })
  }

  try {
    return normalizeReleasePolicy(readJson(absolutePath), version)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildState({
      exists: true,
      parseError: message,
      errors: [message]
    })
  }
}

function releasePolicyPromotesVersion(releasePolicy, version) {
  return (
    releasePolicy.exists &&
    releasePolicy.valid &&
    releasePolicy.channel === 'default' &&
    releasePolicy.defaultArtifact === true &&
    releasePolicy.promotedVersion === version &&
    releasePolicy.keepLegacyArtifacts === true
  )
}

function resolveReleasePolicyState(state) {
  if (!state.valid) {
    throw new Error(state.errors[0] || state.parseError || 'Invalid Electron release policy.')
  }

  const isDefault = state.channel === 'default'
  return {
    channel: state.channel,
    artifactName: isDefault
      ? 'Nightreign_Save_Editor_Electron_WIN64'
      : 'Nightreign_Save_Editor_Electron_WIN64_Preview',
    buildScript: isDefault ? 'dist:win' : 'dist:win:unsigned',
    checkScript: isDefault ? 'release:check-promotion' : 'release:check-preview',
    requiresSigning: isDefault
  }
}

function resolveReleasePolicy(frontendRoot, version) {
  return resolveReleasePolicyState(readReleasePolicyState(frontendRoot, version))
}

module.exports = {
  RELEASE_POLICY_PATH,
  defaultReleasePolicy,
  normalizeReleasePolicy,
  readPackageVersion,
  readReleasePolicyState,
  releasePolicyPromotesVersion,
  resolveReleasePolicy,
  resolveReleasePolicyState
}
