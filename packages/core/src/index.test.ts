import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeStaticHtml,
  analyzeJsx,
  analyzeCssHints,
  contrastRatio,
  fingerprint,
  parseUnifiedDiff,
  applyGovernance,
  gradeFindings,
  buildSuggestionFence,
  toSarif,
  defaultConfig,
  reviewSources,
  shouldFail,
} from './index.js'

test('img-alt and input-label', () => {
  const findings = analyzeStaticHtml({
    path: 'x.html',
    content: '<img src="a.png">\n<input type="text">\n',
  })
  assert.ok(findings.some((f) => f.ruleId === 'img-alt'))
  assert.ok(findings.some((f) => f.ruleId === 'input-label'))
})

test('jsx button name', () => {
  const findings = analyzeJsx({
    path: 'Btn.tsx',
    content: 'export const B = () => <button></button>\n',
  })
  assert.ok(findings.some((f) => f.ruleId === 'jsx-button-name'))
})

test('contrast ratio and css pair', () => {
  assert.ok(contrastRatio([0, 0, 0], [255, 255, 255]) > 20)
  const findings = analyzeCssHints({
    path: 'a.css',
    content: 'color: #777777;\nbackground: #888888;\n',
  })
  assert.ok(findings.some((f) => f.ruleId === 'contrast-pair'))
})

test('fingerprint stable', () => {
  const a = fingerprint('img-alt', 'a.html', '<img src="x">')
  const b = fingerprint('img-alt', 'a.html', '  <img   src="x">  ')
  assert.equal(a, b)
})

test('diff parse changed lines', () => {
  const diff = `--- a/x.html\n+++ b/x.html\n@@ -1,2 +1,3 @@\n keep\n-old\n+new\n+also\n`
  const map = parseUnifiedDiff(diff)
  assert.ok(map.get('x.html')?.has(2))
  assert.ok(map.get('x.html')?.has(3))
})

test('baseline governance and grade', () => {
  const findings = analyzeStaticHtml({
    path: 'x.html',
    content: '<img src="a.png">\n',
  })
  const fp = findings[0]!.fingerprint
  const gated = applyGovernance(findings, defaultConfig(), new Set([fp]))
  assert.equal(gated[0]!.isNew, false)
  assert.equal(gradeFindings(gated), 'A')
  assert.equal(shouldFail(gated, { ...defaultConfig(), failOnNew: true }), false)
})

test('suggestion fence + sarif', () => {
  assert.match(buildSuggestionFence('<img alt="">'), /```suggestion/)
  const report = {
    product: 'A11yGuard',
    author: 'KhyFee',
    generatedAt: new Date().toISOString(),
    grade: 'F' as const,
    findings: analyzeStaticHtml({ path: 'x.html', content: '<img src="a.png">\n' }).map((f) => ({
      ...f,
      isNew: true,
    })),
    newCount: 1,
    preexistingCount: 0,
    summaryMarkdown: '',
  }
  const sarif = toSarif(report)
  assert.equal(sarif.version, '2.1.0')
  assert.equal(sarif.runs[0]!.results.length, 1)
})

test('reviewSources demo allLines', async () => {
  const { report, failed } = await reviewSources({
    files: [{ path: 'bad.html', content: '<img src="x"><button></button>\n' }],
    config: defaultConfig(),
    allLines: true,
  })
  assert.ok(report.findings.length >= 1)
  assert.equal(failed, true)
  assert.match(report.summaryMarkdown, /a11yguard-report/)
})
