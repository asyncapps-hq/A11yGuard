import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STICKY_MARKER, toReviewReport, analyzeStaticHtml } from '@a11yguard/core'
import { buildStickyBody, patchesToDiff, upsertStickyComment, type GhLike } from './github.js'

test('sticky body contains marker', () => {
  const findings = analyzeStaticHtml({ path: 'a.html', content: '<img src="x">\n' }).map((f) => ({
    ...f,
    isNew: true,
  }))
  const report = toReviewReport(findings)
  assert.match(buildStickyBody(report), new RegExp(STICKY_MARKER))
  assert.match(buildStickyBody(report), /Grade|img-alt/)
})

test('upsert sticky creates then updates', async () => {
  const comments: Array<{ id: number; body?: string }> = []
  const octokit: GhLike = {
    rest: {
      issues: {
        listComments: async () => ({ data: comments }),
        createComment: async (opts: object) => {
          comments.push({ id: 1, body: (opts as { body: string }).body })
        },
        updateComment: async (opts: object) => {
          comments[0] = { id: 1, body: (opts as { body: string }).body }
        },
      },
      pulls: {
        createReview: async () => ({}),
        listFiles: async () => ({ data: [] }),
      },
      checks: { create: async () => ({}) },
    },
  }
  const a = await upsertStickyComment(octokit, {
    owner: 'o',
    repo: 'r',
    issue_number: 1,
    body: `${STICKY_MARKER}\nfirst`,
  })
  assert.equal(a, 'created')
  const b = await upsertStickyComment(octokit, {
    owner: 'o',
    repo: 'r',
    issue_number: 1,
    body: `${STICKY_MARKER}\nsecond`,
  })
  assert.equal(b, 'updated')
  assert.match(comments[0]!.body!, /second/)
})

test('patchesToDiff', () => {
  const d = patchesToDiff([{ filename: 'a.html', patch: '@@ -1 +1 @@\n+x\n' }])
  assert.match(d, /\+\+\+ b\/a\.html/)
})
