import type { Finding, Grade, ReviewReport } from './types.js'
import { AUTHOR, PRODUCT, STICKY_MARKER } from './types.js'

export function gradeFindings(findings: Finding[]): Grade {
  const neu = findings.filter((f) => f.isNew !== false)
  const errors = neu.filter((f) => f.severity === 'error').length
  const warnings = neu.filter((f) => f.severity === 'warning').length
  if (errors === 0 && warnings === 0) return 'A'
  if (errors === 0 && warnings <= 2) return 'B'
  if (errors <= 1) return 'C'
  if (errors <= 3) return 'D'
  return 'F'
}

export function buildSuggestionFence(suggestion: string): string {
  return ['```suggestion', suggestion, '```'].join('\n')
}

export function buildStickyMarkdown(report: ReviewReport): string {
  const neu = report.findings.filter((f) => f.isNew)
  const lines = [
    STICKY_MARKER,
    `## ${PRODUCT} accessibility review`,
    '',
    `**Grade:** ${report.grade} · **New:** ${report.newCount} · **Preexisting:** ${report.preexistingCount}`,
    '',
    '| Severity | Rule | File | Line |',
    '|---|---|---|---|',
  ]
  for (const f of neu.slice(0, 40)) {
    lines.push(`| ${f.severity} | \`${f.ruleId}\` | \`${f.path}\` | ${f.line} |`)
  }
  if (neu.length === 0) lines.push('| — | No new issues | — | — |')
  lines.push('', `_By ${AUTHOR} · ${PRODUCT}_`, '')
  return lines.join('\n')
}

export function buildInlineComment(f: Finding): string {
  const parts = [
    `**${f.ruleId}** (${f.severity}, WCAG ${f.wcag.join(', ')})`,
    '',
    f.message,
  ]
  if (f.explanation) parts.push('', f.explanation)
  if (f.suggestion) {
    parts.push('', buildSuggestionFence(f.suggestion))
  }
  return parts.join('\n')
}

export function toReviewReport(findings: Finding[]): ReviewReport {
  const newCount = findings.filter((f) => f.isNew).length
  const preexistingCount = findings.length - newCount
  const grade = gradeFindings(findings)
  const report: ReviewReport = {
    product: PRODUCT,
    author: AUTHOR,
    generatedAt: new Date().toISOString(),
    grade,
    findings,
    newCount,
    preexistingCount,
    summaryMarkdown: '',
  }
  report.summaryMarkdown = buildStickyMarkdown(report)
  return report
}
