const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const projectRoot = resolve(__dirname, '..', '..')
const pyprojectPath = resolve(projectRoot, 'pyproject.toml')
const packagePath = resolve(__dirname, '..', 'package.json')
const packageLockPath = resolve(__dirname, '..', 'package-lock.json')

function readProjectVersion() {
  const content = readFileSync(pyprojectPath, 'utf8')
  const match = content.match(/^\s*version\s*=\s*["']([^"']+)["']/m)
  if (!match) {
    throw new Error(`Could not find project version in ${pyprojectPath}`)
  }
  return match[1]
}

function assertVersion(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} version is ${actual}, expected ${expected}`)
  }
}

try {
  const expected = readProjectVersion()
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'))

  assertVersion('frontend/package.json', packageJson.version, expected)
  assertVersion('frontend/package-lock.json', packageLock.version, expected)
  assertVersion('frontend/package-lock.json packages[""]', packageLock.packages?.['']?.version, expected)

  console.log(`Electron package version matches pyproject.toml: ${expected}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('Run from frontend/: npm version --no-git-tag-version <pyproject version>')
  process.exit(1)
}
