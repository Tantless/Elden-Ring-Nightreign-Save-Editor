const { existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

function verifyAuthenticodeSignature(root, relativePath, label, failures) {
  const absolutePath = join(root, relativePath)
  if (!existsSync(absolutePath)) {
    return {
      label,
      relativePath,
      ok: false,
      status: 'Missing',
      subject: null,
      skipped: false
    }
  }

  if (process.platform !== 'win32') {
    failures.push(`${label} signature cannot be verified on ${process.platform}; run promotion checks on Windows.`)
    return {
      label,
      relativePath,
      ok: false,
      status: 'UnsupportedPlatform',
      subject: null,
      skipped: false
    }
  }

  const quotedPath = absolutePath.replace(/'/g, "''")
  const command = [
    `$Path = '${quotedPath}'`,
    'Import-Module Microsoft.PowerShell.Security -ErrorAction Stop',
    '$signature = Get-AuthenticodeSignature -LiteralPath $Path',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$subject = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { $null }',
    '$payload = [PSCustomObject]@{ Status = [string]$signature.Status; Subject = $subject; StatusMessage = [string]$signature.StatusMessage }',
    '$payload | ConvertTo-Json -Compress'
  ].join('; ')
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64')
  const runners = [
    {
      command: process.env.NIGHTREIGN_POWERSHELL || 'pwsh.exe',
      args: ['-NoProfile', '-EncodedCommand', encodedCommand]
    },
    {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand]
    }
  ].filter((runner, index, items) => items.findIndex((item) => item.command === runner.command) === index)

  let result = null
  let runnerCommand = null
  for (const runner of runners) {
    const attempt = spawnSync(runner.command, runner.args, {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000
    })
    if (attempt.error?.code === 'ENOENT') {
      continue
    }
    result = attempt
    runnerCommand = runner.command
    break
  }

  if (!result) {
    failures.push(`${label} signature verification failed: no PowerShell executable found.`)
    return {
      label,
      relativePath,
      ok: false,
      status: 'VerificationFailed',
      subject: null,
      skipped: false
    }
  }

  if (result.error || result.status !== 0) {
    const message = result.error?.message || result.stderr?.trim() || `PowerShell exited with ${result.status}`
    failures.push(`${label} signature verification failed with ${runnerCommand}: ${message}`)
    return {
      label,
      relativePath,
      ok: false,
      status: 'VerificationFailed',
      subject: null,
      skipped: false
    }
  }

  let parsed = null
  try {
    parsed = JSON.parse(result.stdout)
  } catch (_error) {
    failures.push(`${label} signature verification returned invalid JSON.`)
  }

  const status = parsed?.Status ?? 'Unknown'
  const ok = status === 'Valid'
  if (!ok) {
    failures.push(`${label} must have a valid Authenticode signature; status=${status}.`)
  }

  return {
    label,
    relativePath,
    ok,
    status,
    subject: parsed?.Subject ?? null,
    statusMessage: parsed?.StatusMessage ?? null,
    verifier: runnerCommand,
    skipped: false
  }
}

function verifyPromotionSignatures(frontendRoot, artifactBase, failures) {
  return [
    verifyAuthenticodeSignature(frontendRoot, `release/${artifactBase}.exe`, 'Windows installer', failures),
    verifyAuthenticodeSignature(
      frontendRoot,
      'release/win-unpacked/Nightreign Save Editor.exe',
      'Unpacked app executable',
      failures
    ),
    verifyAuthenticodeSignature(
      frontendRoot,
      'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
      'Packaged Python sidecar',
      failures
    )
  ]
}

module.exports = {
  verifyAuthenticodeSignature,
  verifyPromotionSignatures
}
