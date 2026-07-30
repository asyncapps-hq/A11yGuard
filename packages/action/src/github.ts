import {
  STICKY_MARKER,
  buildInlineComment,
  checkAnnotations,
  toSarif,
  type Finding,
  type ReviewReport,
} from '@a11yguard/core'

export interface GhLike {
  rest: {
    issues: {
      listComments: (opts: Record<string, unknown>) => Promise<{ data: Array<{ id: number; body?: string }> }>
      createComment: (opts: Record<string, unknown>) => Promise<unknown>
      updateComment: (opts: Record<string, unknown>) => Promise<unknown>
    }
    pulls: {
      createReview: (opts: Record<string, unknown>) => Promise<unknown>
      listFiles: (opts: Record<string, unknown>) => Promise<{ data: Array<{ filename: string; patch?: string }> }>
    }
    checks: {
      create: (opts: Record<string, unknown>) => Promise<unknown>
    }
  }
}

export function buildStickyBody(report: ReviewReport): string {
  return report.summaryMarkdown.includes(STICKY_MARKER)
    ? report.summaryMarkdown
    : `${STICKY_MARKER}\n${report.summaryMarkdown}`
}

export async function upsertStickyComment(
  octokit: GhLike,
  opts: { owner: string; repo: string; issue_number: number; body: string },
): Promise<'created' | 'updated'> {
  const { data } = await octokit.rest.issues.listComments({
    owner: opts.owner,
    repo: opts.repo,
    issue_number: opts.issue_number,
    per_page: 100,
  })
  const existing = data.find((c) => c.body?.includes(STICKY_MARKER))
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: opts.owner,
      repo: opts.repo,
      comment_id: existing.id,
      body: opts.body,
    })
    return 'updated'
  }
  await octokit.rest.issues.createComment({
    owner: opts.owner,
    repo: opts.repo,
    issue_number: opts.issue_number,
    body: opts.body,
  })
  return 'created'
}

export async function postSuggestionReview(
  octokit: GhLike,
  opts: {
    owner: string
    repo: string
    pull_number: number
    commit_id: string
    findings: Finding[]
  },
): Promise<number> {
  const comments = opts.findings
    .filter((f) => f.isNew && f.suggestion)
    .slice(0, 20)
    .map((f) => ({
      path: f.path.replace(/\\/g, '/'),
      line: f.line,
      side: 'RIGHT' as const,
      body: buildInlineComment(f),
    }))
  if (!comments.length) return 0
  await octokit.rest.pulls.createReview({
    owner: opts.owner,
    repo: opts.repo,
    pull_number: opts.pull_number,
    commit_id: opts.commit_id,
    event: 'COMMENT',
    body: 'A11yGuard suggested fixes (one-click apply where supported).',
    comments,
  })
  return comments.length
}

export async function createCheckRun(
  octokit: GhLike,
  opts: {
    owner: string
    repo: string
    head_sha: string
    report: ReviewReport
    failed: boolean
  },
) {
  const annotations = checkAnnotations(opts.report.findings.filter((f) => f.isNew))
  await octokit.rest.checks.create({
    owner: opts.owner,
    repo: opts.repo,
    name: 'A11yGuard',
    head_sha: opts.head_sha,
    status: 'completed',
    conclusion: opts.failed ? 'failure' : 'success',
    output: {
      title: `Grade ${opts.report.grade} — ${opts.report.newCount} new issue(s)`,
      summary: opts.report.summaryMarkdown,
      annotations,
    },
  })
}

export function sarifForUpload(report: ReviewReport): string {
  return JSON.stringify(toSarif(report), null, 2)
}

export function filesFromPullPatches(
  files: Array<{ filename: string; patch?: string }>,
  contents: Map<string, string>,
) {
  return files
    .filter((f) => contents.has(f.filename))
    .map((f) => ({
      path: f.filename,
      content: contents.get(f.filename)!,
    }))
}

export function patchesToDiff(files: Array<{ filename: string; patch?: string }>): string {
  return files
    .filter((f) => f.patch)
    .map((f) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}`)
    .join('\n')
}
