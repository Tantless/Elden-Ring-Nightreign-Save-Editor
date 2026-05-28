const { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { manualAcceptanceChecks } = require('./manual-acceptance-handoff.cjs')
const { createPromotionHandoffReport } = require('./promotion-handoff.cjs')

const VERSION = '4.6.6'
const ARTIFACT_BASE = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64`
const LEGACY_ARTIFACTS = [
  'Nightreign_Relic_Editor_WIN64',
  'Nightreign_Relic_Editor_WIN64_Onedir',
  'Nightreign_Relic_Editor_WIN32',
  'Nightreign_Relic_Editor_LINUX_x86_64',
  'Nightreign_Relic_Editor_MAC-Silicon',
  'Nightreign_Relic_Editor_MAC-Intel'
]

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

function sourceMetadata(path) {
  const state = statSync(path)
  return {
    path,
    size: state.size,
    lastWriteTime: state.mtime.toISOString()
  }
}

function createAcceptanceEvidence(root) {
  const sourcePath = join(root, 'source.sl2')
  const copiedPath = join(root, 'acceptance-copy.sl2')
  writeFile(sourcePath, 'source-save-data')
  writeFile(copiedPath, 'source-save-data')
  const timestamp = new Date('2026-05-27T14:56:14.000Z')
  utimesSync(sourcePath, timestamp, timestamp)
  utimesSync(copiedPath, timestamp, timestamp)
  return {
    source: sourceMetadata(sourcePath),
    copiedSavePath: copiedPath
  }
}

function validAcceptanceReport(source, copiedSavePath) {
  return {
    version: VERSION,
    accepted: true,
    reviewer: 'tantless',
    completedAt: '2026-05-28T12:00:00.000Z',
    copiedSavePath,
    sourceSave: {
      before: source,
      after: { ...source }
    },
    automation: {
      acceptanceHandoff: true,
      verifyRelease: true,
      releaseCheckPreview: true,
      migrationAudit: true,
      promotionDryRun: true
    },
    checks: manualAcceptanceChecks().map((item) => ({
      id: item.id,
      status: 'pass',
      notes: 'passed'
    }))
  }
}

function validGithubPublicationReport() {
  return {
    ok: true,
    schemaVersion: 1,
    kind: 'nightreign-github-release-publication',
    generatedAt: '2026-05-28T12:00:00.000Z',
    version: VERSION,
    repo: 'Tantless/Elden-Ring-Nightreign-Save-Editor',
    tag: `V${VERSION}`,
    verifyHashes: true,
    release: {
      id: 123,
      name: `V${VERSION}`,
      tagName: `V${VERSION}`,
      draft: true,
      prerelease: false,
      htmlUrl: `https://github.example.test/releases/V${VERSION}`,
      assetCount: LEGACY_ARTIFACTS.length + 4
    },
    electronPreview: {
      manifestAsset: {
        name: 'electron-preview-manifest.json',
        size: 10,
        browserDownloadUrl: 'https://github.example.test/electron-preview-manifest.json'
      },
      artifactUploadName: 'Nightreign_Save_Editor_Electron_WIN64_Preview',
      defaultPublicPathChanged: false,
      publishArtifacts: [
        {
          label: 'Windows installer',
          name: `${ARTIFACT_BASE}.exe`,
          ok: true,
          hashVerified: true,
          expectedSize: 10,
          actualSize: 10,
          expectedSha256: 'abc',
          actualSha256: 'abc',
          browserDownloadUrl: `https://github.example.test/${ARTIFACT_BASE}.exe`
        }
      ]
    },
    legacyArtifacts: LEGACY_ARTIFACTS.map((artifactName) => ({
      artifactName,
      assets: [
        {
          name: `${artifactName}.zip`,
          size: 10,
          browserDownloadUrl: `https://github.example.test/${artifactName}.zip`
        }
      ]
    })),
    failures: []
  }
}

function createFixture(policy, options = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-promotion-handoff-'))
  const frontendRoot = join(repoRoot, 'frontend')
  mkdirSync(join(frontendRoot, 'scripts'), { recursive: true })
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeJson(join(frontendRoot, 'release-policy.json'), policy)
  if (options.accepted) {
    const acceptance = createAcceptanceEvidence(repoRoot)
    writeJson(
      join(frontendRoot, 'acceptance-report.json'),
      validAcceptanceReport(acceptance.source, acceptance.copiedSavePath)
    )
  }
  if (options.published) {
    writeJson(join(frontendRoot, 'github-publication-report.json'), validGithubPublicationReport())
  }
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
      '      run: node frontend/scripts/check-github-release-publication.cjs --repo ${{ github.repository }} --tag ${{ needs.check.outputs.newtag }} --verify-hashes --retries 6 --retry-delay-ms 10000',
      ...LEGACY_ARTIFACTS.map((artifactName) => `artifact: ${artifactName}`)
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

function invalidSignatureVerifier(_frontendRoot, artifactBase, failures) {
  assert(artifactBase === ARTIFACT_BASE, 'unexpected artifact base')
  failures.push('test signature failure')
  return [
    {
      label: 'Windows installer',
      relativePath: `release/${ARTIFACT_BASE}.exe`,
      ok: false,
      status: 'NotSigned'
    },
    {
      label: 'Unpacked app executable',
      relativePath: 'release/win-unpacked/Nightreign Save Editor.exe',
      ok: false,
      status: 'NotSigned'
    },
    {
      label: 'Packaged Python sidecar',
      relativePath: 'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
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

  const unsignedPreview = createFixture(previewPolicy())
  try {
    const report = createPromotionHandoffReport({
      frontendRoot: unsignedPreview.frontendRoot,
      repoRoot: unsignedPreview.repoRoot,
      env: {},
      verifySignatures: invalidSignatureVerifier
    })
    assert(report.ok === true, 'handoff should pass when preview readiness is valid')
    assert(report.completionReady === false, 'unsigned preview should not be complete')
    assert(report.readyForPolicyWrite === false, 'unsigned preview should not be ready for policy write')
    assert(report.signatureChecks.length === 3, 'handoff should report standalone signature checks')
    assert(
      report.finalPromotionCommand ===
        'npm run verify:promotion -- --build --write-policy --repo <owner/name> --tag V4.6.6 --verify-publication-hashes --publication-retries 6 --publication-retry-delay-ms 10000',
      'handoff should expose one-command final promotion'
    )
    assert(report.remaining.some((item) => item.includes('Provision Windows signing credentials')), 'handoff should report missing signing')
    assert(report.remaining.some((item) => item.includes('release:github-publication:report')), 'handoff should report missing publication')
    assert(report.remaining.some((item) => item.includes('manual acceptance')), 'handoff should report missing acceptance')
    cases.push({ name: 'unsigned preview handoff', ok: true })
  } finally {
    rmSync(unsignedPreview.repoRoot, { recursive: true, force: true })
  }

  const signedPreview = createFixture(previewPolicy())
  try {
    const report = createPromotionHandoffReport({
      frontendRoot: signedPreview.frontendRoot,
      repoRoot: signedPreview.repoRoot,
      env: { WIN_CSC_NAME: 'Nightreign Test Certificate' },
      verifySignatures: validSignatureVerifier
    })
    assert(report.ok === true, 'signed preview handoff should pass')
    assert(report.completionReady === false, 'preview policy should keep completion incomplete')
    assert(report.readyForPolicyWrite === true, 'valid signatures should allow policy-write handoff')
    assert(
      report.finalPromotionCommand ===
        'npm run verify:promotion -- --build --write-policy --repo <owner/name> --tag V4.6.6 --verify-publication-hashes --publication-retries 6 --publication-retry-delay-ms 10000',
      'signed preview handoff should expose one-command final promotion'
    )
    assert(report.remaining.some((item) => item.includes('release:promote-policy:write')), 'handoff should request policy write')
    assert(report.remaining.some((item) => item.includes('release:github-publication:report')), 'signed preview handoff should report missing publication')
    assert(report.remaining.some((item) => item.includes('manual acceptance')), 'signed preview handoff should report missing acceptance')
    cases.push({ name: 'signed preview ready for policy write', ok: true })
  } finally {
    rmSync(signedPreview.repoRoot, { recursive: true, force: true })
  }

  const signedDefaultUnpublished = createFixture(defaultPolicy(), { accepted: true })
  try {
    const report = createPromotionHandoffReport({
      frontendRoot: signedDefaultUnpublished.frontendRoot,
      repoRoot: signedDefaultUnpublished.repoRoot,
      env: { WIN_CSC_NAME: 'Nightreign Test Certificate' },
      verifySignatures: validSignatureVerifier
    })
    assert(report.ok === true, 'signed default unpublished handoff should pass preview readiness')
    assert(report.completionReady === false, 'signed default handoff should wait for publication evidence')
    assert(report.acceptanceReport.ok === true, 'signed default unpublished handoff should include accepted manual report')
    assert(report.publicationReport.ok === false, 'signed default unpublished handoff should include failed publication report')
    assert(report.remaining.some((item) => item.includes('release:github-publication:report')), 'handoff should request publication report')
    cases.push({ name: 'signed default waits for publication report', ok: true })
  } finally {
    rmSync(signedDefaultUnpublished.repoRoot, { recursive: true, force: true })
  }

  const signedDefault = createFixture(defaultPolicy(), { accepted: true, published: true })
  try {
    const report = createPromotionHandoffReport({
      frontendRoot: signedDefault.frontendRoot,
      repoRoot: signedDefault.repoRoot,
      env: { WIN_CSC_NAME: 'Nightreign Test Certificate' },
      verifySignatures: validSignatureVerifier
    })
    assert(report.ok === true, 'signed default handoff should pass')
    assert(report.completionReady === true, 'signed default policy should complete promotion readiness')
    assert(report.acceptanceReport.ok === true, 'signed default handoff should include accepted manual report')
    assert(report.publicationReport.ok === true, 'signed default handoff should include valid publication report')
    assert(report.readyForPolicyWrite === true, 'signed default handoff should keep policy-write readiness true')
    assert(report.remaining.length === 0, 'signed default handoff should have no remaining actions')
    cases.push({ name: 'signed default completion handoff', ok: true })
  } finally {
    rmSync(signedDefault.repoRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
