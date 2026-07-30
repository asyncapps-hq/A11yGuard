import { createHash } from 'node:crypto'
import type { Finding, Severity, WcagLevel } from './types.js'

export function normalizeSnippet(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function fingerprint(ruleId: string, path: string, snippet: string): string {
  const norm = `${ruleId}|${path.replace(/\\/g, '/')}|${normalizeSnippet(snippet)}`
  return createHash('sha256').update(norm).digest('hex').slice(0, 16)
}

export function lineInScope(line: number, changed?: Set<number>): boolean {
  if (!changed || changed.size === 0) return true
  return changed.has(line)
}

export function severityRank(s: Severity): number {
  return s === 'error' ? 3 : s === 'warning' ? 2 : 1
}

export function makeFinding(
  partial: Omit<Finding, 'fingerprint'> & { fingerprint?: string },
): Finding {
  return {
    ...partial,
    fingerprint:
      partial.fingerprint ?? fingerprint(partial.ruleId, partial.path, partial.snippet),
  }
}

export function passesWcagGate(finding: Finding, gate: WcagLevel): boolean {
  if (gate === 'A') return finding.wcagLevel === 'A'
  return true
}
