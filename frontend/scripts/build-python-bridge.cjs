const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = resolve(__dirname, '..', '..')
const srcDir = join(projectRoot, 'src')

const candidates = [
  process.env.NIGHTREIGN_PYTHON,
  join(projectRoot, '.venv', 'Scripts', 'python.exe'),
  join(projectRoot, '.venv', 'bin', 'python'),
  'python3',
  'python'
].filter(Boolean)

function canAttempt(candidate) {
  if (candidate.includes('\\') || candidate.includes('/')) {
    return existsSync(candidate)
  }

  return true
}

for (const python of candidates) {
  if (!canAttempt(python)) {
    continue
  }

  console.log(`Building Electron Python bridge with ${python}`)
  const result = spawnSync(
    python,
    ['-m', 'PyInstaller', 'build_electron_bridge.spec'],
    {
      cwd: srcDir,
      stdio: 'inherit',
      shell: false
    }
  )

  if (result.error && result.error.code === 'ENOENT') {
    continue
  }

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

console.error(
  'No Python executable found. Set NIGHTREIGN_PYTHON or create .venv before building the Electron bridge.'
)
process.exit(1)
