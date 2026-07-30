import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { repoRootFrom, runReview } from './index.js'

test('bad-app has findings, good-app fewer errors', async () => {
  const root = repoRootFrom(import.meta.url)
  const bad = await runReview({
    cwd: root,
    targetDir: path.join(root, 'fixtures', 'bad-app'),
    allLines: true,
  })
  assert.ok(bad.report.findings.some((f) => /img-alt|jsx-img-alt/.test(f.ruleId)))
  assert.equal(bad.failed, true)

  const good = await runReview({
    cwd: root,
    targetDir: path.join(root, 'fixtures', 'good-app'),
    allLines: true,
  })
  const goodErrors = good.report.findings.filter((f) => f.severity === 'error' && f.isNew)
  assert.equal(goodErrors.length, 0)
})
