const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createReadinessReport } = require('./check-release-readiness.cjs')

const VERSION = '4.6.6'
const ARTIFACT_BASE = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64`

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeFile(path, value = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, value, 'utf8')
}

function previewPolicy() {
  return {
    electronRelease: {
      channel: 'preview',
      defaultArtifact: false,
      promotedVersion: null,
      keepLegacyArtifacts: true
    }
  }
}

function defaultPolicy() {
  return {
    electronRelease: {
      channel: 'default',
      defaultArtifact: true,
      promotedVersion: VERSION,
      keepLegacyArtifacts: true
    }
  }
}

function createFixture(policy) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-readiness-'))
  const frontendRoot = join(repoRoot, 'frontend')
  mkdirSync(join(frontendRoot, 'scripts'), { recursive: true })
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeJson(join(frontendRoot, 'release-policy.json'), policy)
  writeFile(
    join(repoRoot, '.github', 'workflows', 'main.yml'),
    [
      'electron-preview:',
      '  steps:',
      '    - name: Resolve policy',
      '      run: node scripts/resolve-release-policy.cjs',
      '    - name: Test policy',
      '      run: npm run release:policy:test',
      '    - name: Test promotion policy',
      '      run: npm run release:promote-policy:test',
      '    - name: Test promotion handoff',
      '      run: npm run release:promotion-handoff:test',
      '    - name: Test promotion verifier',
      '      run: npm run verify:promotion:test',
      '    - name: Test manual acceptance handoff',
      '      run: npm run acceptance:handoff:test',
      '    - name: Test manual acceptance report',
      '      run: npm run acceptance:report:test',
      '    - name: Test readiness',
      '      run: npm run release:readiness:test',
      '    - name: Test preview manifest',
      '      run: npm run release:preview-manifest:test',
      '    - name: Test release artifact bundle',
      '      run: npm run release:publication-bundle:test',
      '    - name: Test GitHub release publication',
      '      run: npm run release:github-publication:test',
      '    - name: Test signing dry run',
      '      run: npm run release:signing:test',
      '    - name: Verify Electron binary',
      '      run: npm run electron:ensure',
      '    - name: Renderer smoke',
      '      run: npm run smoke:renderer',
      '    - name: Build',
      '      run: npm run ${{ steps.electron_policy.outputs.build_script }}',
      '    - name: Generate preview manifest',
      '      run: npm run release:preview-manifest',
      '    - name: Check',
      '      run: npm run ${{ steps.electron_policy.outputs.check_script }}',
      '    - name: Audit',
      '      run: npm run migration:audit',
      '    - name: Promotion dry run',
      '      run: npm run migration:audit:promotion-dry-run',
      '      name: ${{ steps.electron_policy.outputs.artifact_name }}',
      '      path: |',
      '        frontend/release/*.blockmap',
      '        frontend/release/electron-preview-manifest.json',
      'check:',
      '  needs:',
      '    - build',
      '    - electron-preview',
      '  outputs:',
      '    release_exists: ${{ steps.check_release.outputs.exists }}',
      '    publication_ok: ${{ steps.check_publication.outputs.ok }}',
      '  steps:',
      '    - name: Check if GitHub Release exists',
      '      id: check_release',
      '      run: curl "${API_ROOT}/repos/${GITHUB_REPOSITORY}/releases/tags/${TAG_NAME}"',
      '    - name: Check existing GitHub Release publication',
      '      id: check_publication',
      '      run: node frontend/scripts/check-github-release-publication.cjs --repo "${GITHUB_REPOSITORY}" --tag "${TAG_NAME}" --verify-hashes --retries 0 --retry-delay-ms 0',
      'release:',
      "  if: needs.check.outputs.publication_ok != 'true'",
      '  steps:',
      '    - name: Download all artifacts',
      '      uses: actions/download-artifact@v8',
      '      with:',
      '        merge-multiple: true',
      '    - name: Check release artifact bundle',
      '      run: node frontend/scripts/check-release-artifact-bundle.cjs ./artifacts',
      '    - name: Create GitHub Release',
      '      uses: softprops/action-gh-release@v2',
      '      with:',
      '        overwrite_files: true',
      '        files: ./artifacts/*',
      '    - name: Verify GitHub Release Publication',
      '      run: node frontend/scripts/check-github-release-publication.cjs --repo ${{ github.repository }} --tag ${{ needs.check.outputs.newtag }} --verify-hashes --retries 6 --retry-delay-ms 10000'
    ].join('\n')
  )
  writeFile(
    join(frontendRoot, 'scripts', 'resolve-release-policy.cjs'),
    "console.log('dist:win:unsigned release:check-preview Nightreign_Save_Editor_Electron_WIN64_Preview')"
  )
  writeFile(
    join(frontendRoot, 'scripts', 'release-policy.cjs'),
    "console.log('dist:win:unsigned release:check-preview Nightreign_Save_Editor_Electron_WIN64_Preview')"
  )
  for (const relativePath of [
    `release/${ARTIFACT_BASE}.exe`,
    `release/${ARTIFACT_BASE}.exe.blockmap`,
    `release/${ARTIFACT_BASE}.zip`,
    'release/win-unpacked/Nightreign Save Editor.exe',
    'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
    'build/icon.ico',
    'build/icon.png',
    'release/electron-preview-manifest.json'
  ]) {
    writeFile(join(frontendRoot, relativePath))
  }

  return { repoRoot, frontendRoot }
}

function failingSignatureVerifier(_frontendRoot, artifactBase, failures) {
  assert(artifactBase === ARTIFACT_BASE, 'unexpected artifact base')
  failures.push('test signature failure')
  return [
    {
      label: 'Windows installer',
      relativePath: `release/${ARTIFACT_BASE}.exe`,
      ok: false,
      status: 'NotSigned'
    }
  ]
}

function validSignatureVerifier(_frontendRoot, artifactBase) {
  assert(artifactBase === ARTIFACT_BASE, 'unexpected artifact base')
  return [
    {
      label: 'Windows installer',
      relativePath: `release/${ARTIFACT_BASE}.exe`,
      ok: true,
      status: 'Valid'
    },
    {
      label: 'Unpacked app executable',
      relativePath: 'release/win-unpacked/Nightreign Save Editor.exe',
      ok: true,
      status: 'Valid'
    },
    {
      label: 'Packaged Python sidecar',
      relativePath: 'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
      ok: true,
      status: 'Valid'
    }
  ]
}

function main() {
  const cases = []

  const preview = createFixture(previewPolicy())
  try {
    const report = createReadinessReport({
      mode: 'preview',
      frontendRoot: preview.frontendRoot,
      repoRoot: preview.repoRoot,
      verifySignatures: failingSignatureVerifier,
      requirePreviewManifest: true
    })
    assert(report.ok === true, 'preview readiness should pass without signing')
    assert(report.signing.ready === false, 'preview readiness should not require signing')
    assert(report.signatureChecks.length === 0, 'preview readiness must not verify signatures')
    cases.push({ name: 'preview readiness does not require signing', ok: true })
  } finally {
    rmSync(preview.repoRoot, { recursive: true, force: true })
  }

  const missingPublicationGuard = createFixture(previewPolicy())
  try {
    const workflowPath = join(missingPublicationGuard.repoRoot, '.github', 'workflows', 'main.yml')
    writeFileSync(
      workflowPath,
      readFileSync(workflowPath, 'utf8').replace(
        [
          '  outputs:',
          '    release_exists: ${{ steps.check_release.outputs.exists }}',
          '    publication_ok: ${{ steps.check_publication.outputs.ok }}',
          '  steps:',
          '    - name: Check if GitHub Release exists',
          '      id: check_release',
          '      run: curl "${API_ROOT}/repos/${GITHUB_REPOSITORY}/releases/tags/${TAG_NAME}"',
          '    - name: Check existing GitHub Release publication',
          '      id: check_publication',
          '      run: node frontend/scripts/check-github-release-publication.cjs --repo "${GITHUB_REPOSITORY}" --tag "${TAG_NAME}" --verify-hashes --retries 0 --retry-delay-ms 0',
          'release:',
          "  if: needs.check.outputs.publication_ok != 'true'"
        ].join('\n'),
        [
          'release:',
          "  if: needs.check.outputs.exists == 'false'"
        ].join('\n')
      ),
      'utf8'
    )
    const report = createReadinessReport({
      mode: 'preview',
      frontendRoot: missingPublicationGuard.frontendRoot,
      repoRoot: missingPublicationGuard.repoRoot,
      verifySignatures: failingSignatureVerifier,
      requirePreviewManifest: true
    })
    assert(report.ok === false, 'preview readiness should fail without publication recovery guard')
    assert(
      report.failures.some((failure) => failure.includes('Draft release runs when publication is incomplete')),
      'preview readiness should report missing publication recovery guard'
    )
    cases.push({ name: 'preview readiness requires publication recovery guard', ok: true })
  } finally {
    rmSync(missingPublicationGuard.repoRoot, { recursive: true, force: true })
  }

  const missingPromotion = createFixture(previewPolicy())
  try {
    const report = createReadinessReport({
      mode: 'promotion',
      frontendRoot: missingPromotion.frontendRoot,
      repoRoot: missingPromotion.repoRoot,
      env: {},
      verifySignatures: validSignatureVerifier
    })
    assert(report.ok === false, 'promotion should fail without signing and default policy')
    assert(report.signatureChecks.length === 0, 'promotion must not verify signatures before prerequisites are present')
    assert(report.failures.some((failure) => failure.includes('requires Windows signing credentials')), 'promotion should report missing signing')
    assert(report.failures.some((failure) => failure.includes('promote Electron')), 'promotion should report missing default policy')
    cases.push({ name: 'promotion requires signing and default policy', ok: true })
  } finally {
    rmSync(missingPromotion.repoRoot, { recursive: true, force: true })
  }

  const invalidSignatures = createFixture(defaultPolicy())
  try {
    const report = createReadinessReport({
      mode: 'promotion',
      frontendRoot: invalidSignatures.frontendRoot,
      repoRoot: invalidSignatures.repoRoot,
      env: { WIN_CSC_NAME: 'Nightreign Test Certificate' },
      verifySignatures: failingSignatureVerifier
    })
    assert(report.ok === false, 'promotion should fail with invalid signatures')
    assert(report.signing.ready === true, 'promotion should see signing env')
    assert(report.defaultReleaseDecision.ok === true, 'promotion should see default policy')
    assert(report.signatureChecks.length === 1, 'promotion should verify signatures after prerequisites')
    assert(report.failures.some((failure) => failure.includes('test signature failure')), 'promotion should report signature failure')
    cases.push({ name: 'promotion verifies and rejects invalid signatures', ok: true })
  } finally {
    rmSync(invalidSignatures.repoRoot, { recursive: true, force: true })
  }

  const validPromotion = createFixture(defaultPolicy())
  try {
    const report = createReadinessReport({
      mode: 'promotion',
      frontendRoot: validPromotion.frontendRoot,
      repoRoot: validPromotion.repoRoot,
      env: { WIN_CSC_NAME: 'Nightreign Test Certificate' },
      verifySignatures: validSignatureVerifier
    })
    assert(report.ok === true, 'promotion should pass with signing env, default policy, and valid signatures')
    assert(report.signatureChecks.length === 3, 'promotion should report all signature checks')
    assert(report.signatureChecks.every((item) => item.status === 'Valid'), 'all promotion signatures should be valid')
    cases.push({ name: 'promotion passes with valid signatures', ok: true })
  } finally {
    rmSync(validPromotion.repoRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
