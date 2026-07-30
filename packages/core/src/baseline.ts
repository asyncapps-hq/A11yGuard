import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { A11yGuardConfig, BaselineFile, Finding, Suppression } from './types.js'
import { passesWcagGate, severityRank } from './fingerprint.js'

export async function loadBaseline(filePath?: string): Promise<Set<string>> {
  if (!filePath) return new Set()
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as BaselineFile
    return new Set(raw.fingerprints ?? [])
  } catch {
    return new Set()
  }
}

export async function writeBaseline(filePath: string, findings: Finding[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const body: BaselineFile = {
    version: 1,
    fingerprints: [...new Set(findings.map((f) => f.fingerprint))].sort(),
  }
  await writeFile(filePath, JSON.stringify(body, null, 2) + '\n', 'utf8')
}

export function isSuppressed(f: Finding, suppressions: Suppression[] | undefined, now = new Date()): boolean {
  if (!suppressions?.length) return false
  return suppressions.some((s) => {
    if (s.rule !== '*' && s.rule !== f.ruleId) return false
    if (s.path && !f.path.replace(/\\/g, '/').includes(s.path.replace(/\\/g, '/'))) return false
    if (s.expires && new Date(s.expires) < now) return false
    return Boolean(s.reason)
  })
}

export function applyGovernance(
  findings: Finding[],
  config: A11yGuardConfig,
  baseline: Set<string>,
): Finding[] {
  const gate = config.wcagLevel ?? 'AA'
  const rules = config.rules ?? {}
  const out: Finding[] = []

  for (const f of findings) {
    if (!passesWcagGate(f, gate) && gate === 'A' && f.wcagLevel === 'AA') continue
    const override = rules[f.ruleId]
    if (override === 'off') continue
    if (isSuppressed(f, config.suppressions)) continue
    const severity = override ?? f.severity
    const isNew = !baseline.has(f.fingerprint)
    out.push({ ...f, severity, isNew })
  }

  // dedupe by fingerprint
  const seen = new Set<string>()
  return out.filter((f) => {
    if (seen.has(f.fingerprint)) return false
    seen.add(f.fingerprint)
    return true
  })
}

export function shouldFail(findings: Finding[], config: A11yGuardConfig): boolean {
  if (config.failOn === 'never') return false
  const threshold = config.failOn ?? 'error'
  const relevant = config.failOnNew ? findings.filter((f) => f.isNew) : findings
  const min = threshold === 'warning' ? 2 : 3
  return relevant.some((f) => severityRank(f.severity) >= min)
}
