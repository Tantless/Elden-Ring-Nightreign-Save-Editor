const { existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const electronCommand = process.platform === 'win32' ? 'electron.cmd' : 'electron'

function parseArgs(argv) {
  const args = [...argv]
  let full = false
  let savePath = null

  while (args.length > 0) {
    const current = args.shift()
    if (current === '--full') {
      full = true
      continue
    }
    if (!savePath) {
      savePath = current
      continue
    }
    throw new Error(`Unexpected argument: ${current}`)
  }

  return {
    full,
    savePath: savePath || process.env.NIGHTREIGN_ELECTRON_SMOKE_SAVE || null
  }
}

function run(label, command, args) {
  console.log(`\n==> ${label}`)
  console.log(`${command} ${args.join(' ')}`)
  const invocation = commandInvocation(command, args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    shell: false,
    stdio: 'inherit'
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

function commandInvocation(command, args) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args]
    }
  }

  return { command, args }
}

function main() {
  const { full, savePath } = parseArgs(process.argv.slice(2))
  if (!savePath) {
    throw new Error(
      'Pass a save path or set NIGHTREIGN_ELECTRON_SMOKE_SAVE, e.g. npm run verify:release -- C:\\path\\to\\NR0000.sl2'
    )
  }

  const resolvedSave = resolve(savePath)
  if (!existsSync(resolvedSave)) {
    throw new Error(`Save file not found: ${resolvedSave}`)
  }

  run('Version alignment', npmCommand, ['run', 'version:check'])
  run('Electron release policy', npmCommand, ['run', 'release:policy'])
  run('Electron release policy tests', npmCommand, ['run', 'release:policy:test'])
  run('Electron promotion policy tests', npmCommand, ['run', 'release:promote-policy:test'])
  run('Electron promotion handoff tests', npmCommand, ['run', 'release:promotion-handoff:test'])
  run('Electron promotion verifier tests', npmCommand, ['run', 'verify:promotion:test'])
  run('Electron manual acceptance handoff tests', npmCommand, ['run', 'acceptance:handoff:test'])
  run('Electron manual acceptance report tests', npmCommand, ['run', 'acceptance:report:test'])
  run('Electron readiness tests', npmCommand, ['run', 'release:readiness:test'])
  run('Electron preview manifest tests', npmCommand, ['run', 'release:preview-manifest:test'])
  run('Release artifact bundle tests', npmCommand, ['run', 'release:publication-bundle:test'])
  run('GitHub publication verifier tests', npmCommand, ['run', 'release:github-publication:test'])
  run('Electron signing dry-run tests', npmCommand, ['run', 'release:signing:test'])
  run('Electron promotion handoff report', npmCommand, ['run', 'release:promotion-handoff'])
  run('Frontend build', npmCommand, ['run', 'build'])
  run('Renderer click smoke', electronCommand, ['scripts/smoke-renderer.cjs'])
  run('Static screenshot capture', npxCommand, ['electron', 'scripts/capture-ui.cjs'])
  run('Source app smoke', 'node', ['scripts/smoke-app.cjs', resolvedSave])
  run('Source full UI smoke', 'node', ['scripts/smoke-app.cjs', '--ui', resolvedSave])
  run('Unpacked package build', npmCommand, ['run', 'dist:dir'])
  run('Packaged app smoke', 'node', ['scripts/smoke-app.cjs', '--packaged', resolvedSave])
  run('Packaged full UI smoke', 'node', ['scripts/smoke-app.cjs', '--ui', '--packaged', resolvedSave])
  run('Migration parity audit', npmCommand, ['run', 'migration:audit'])

  if (full) {
    run('Unsigned Windows installer and zip build', npmCommand, ['run', 'dist:win:unsigned'])
    run('Electron preview manifest', npmCommand, ['run', 'release:preview-manifest'])
    run('Electron preview artifact audit', npmCommand, ['run', 'release:check-preview'])
  }

  console.log('\nRelease verification passed.')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
