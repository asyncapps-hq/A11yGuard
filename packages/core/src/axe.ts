import type { Finding, SourceFile } from './types.js'
import { lineInScope, makeFinding } from './fingerprint.js'

export interface AxeOptions {
  url: string
  files?: SourceFile[]
}

/** Run axe-core against a rendered URL; map to changed lines when possible. */
export async function analyzeWithAxe(opts: AxeOptions): Promise<Finding[]> {
  const { chromium } = await import('playwright')
  const axeMod = (await import('@axe-core/playwright')) as unknown as {
    AxeBuilder: new (args: { page: import('playwright').Page }) => {
      analyze: () => Promise<{
        violations: Array<{
          id: string
          help: string
          description: string
          impact?: string | null
          tags: string[]
          nodes: Array<{ html: string; target: unknown[]; failureSummary?: string }>
        }>
      }>
    }
  }
  const AxeBuilder = axeMod.AxeBuilder

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const results = await new AxeBuilder({ page }).analyze()
    const findings: Finding[] = []

    for (const v of results.violations) {
      for (const node of v.nodes.slice(0, 10)) {
        const target = node.target?.[0]?.toString() ?? ''
        const mapped = mapToFile(target, node.html, opts.files)
        const line = mapped?.line ?? 1
        const filePath = mapped?.path ?? 'rendered-page'
        if (mapped?.changedLines && !lineInScope(line, mapped.changedLines)) continue

        const impact =
          v.impact === 'critical' || v.impact === 'serious'
            ? 'error'
            : v.impact === 'moderate'
              ? 'warning'
              : 'info'
        const tags = v.tags || []
        findings.push(
          makeFinding({
            ruleId: `axe-${v.id}`,
            severity: impact,
            message: v.help,
            path: filePath,
            line,
            snippet: (node.html || target).slice(0, 200),
            wcag: tags.filter((t: string) => /wcag/i.test(t)),
            wcagLevel: tags.some((t: string) => /aa/i.test(t)) ? 'AA' : 'A',
            confidence: mapped ? 'high' : 'medium',
            explanation: node.failureSummary || v.description,
          }),
        )
      }
    }
    return findings
  } finally {
    await browser.close()
  }
}

function mapToFile(
  selector: string,
  html: string,
  files?: SourceFile[],
): { path: string; line: number; changedLines?: Set<number> } | undefined {
  if (!files?.length) return undefined
  const needle = (html || selector).replace(/\s+/g, ' ').slice(0, 80)
  for (const f of files) {
    const lines = f.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (needle && lines[i] && lines[i]!.includes(needle.slice(0, Math.min(40, needle.length)))) {
        return { path: f.path, line: i + 1, changedLines: f.changedLines }
      }
    }
    const tag = html.match(/<\/?([a-z0-9]+)/i)?.[1]
    if (tag) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes(`<${tag}`)) {
          return { path: f.path, line: i + 1, changedLines: f.changedLines }
        }
      }
    }
  }
  return undefined
}
