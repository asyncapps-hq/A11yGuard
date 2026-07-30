import type { A11yGuardConfig, Finding, ReviewReport, SourceFile } from './types.js'
import { analyzeStaticHtml } from './rules-html.js'
import { analyzeJsx } from './rules-jsx.js'
import { analyzeCssHints } from './rules-css.js'
import { applyGovernance, loadBaseline, shouldFail } from './baseline.js'
import { pathMatches } from './config.js'
import { applyChangedLines, parseUnifiedDiff } from './diff.js'
import { toReviewReport } from './report.js'
import { enrichWithLlm } from './llm.js'
import { analyzeWithAxe } from './axe.js'

export interface ReviewInput {
  files: SourceFile[]
  config: A11yGuardConfig
  cwd?: string
  diffText?: string
  /** When true, analyze entire files (demo mode) */
  allLines?: boolean
}

export interface ReviewResult {
  report: ReviewReport
  failed: boolean
}

export async function reviewSources(input: ReviewInput): Promise<ReviewResult> {
  const { config } = input
  let files = input.files.filter(
    (f) =>
      pathMatches(f.path, config.paths, true) &&
      !pathMatches(f.path, config.ignorePaths, false),
  )

  if (input.diffText && !input.allLines) {
    files = applyChangedLines(files, parseUnifiedDiff(input.diffText))
    // drop files with no changed lines in diff mode
    files = files.filter((f) => !f.changedLines || f.changedLines.size > 0)
  }

  let findings: Finding[] = []
  for (const file of files) {
    findings.push(...analyzeStaticHtml(file), ...analyzeJsx(file), ...analyzeCssHints(file))
  }

  if (config.axe && config.previewUrl) {
    try {
      findings.push(...(await analyzeWithAxe({ url: config.previewUrl, files })))
    } catch {
      // axe optional — keep static findings
    }
  }

  const baseline = await loadBaseline(
    config.baselinePath
      ? (input.cwd ? `${input.cwd}/${config.baselinePath}` : config.baselinePath)
      : undefined,
  )
  findings = applyGovernance(findings, config, baseline)

  const apiKey = process.env.A11YGUARD_LLM_API_KEY || process.env.OPENAI_API_KEY
  if (config.llm?.enabled && apiKey) {
    findings = await enrichWithLlm(findings, {
      apiKey,
      baseUrl: config.llm.baseUrl || process.env.A11YGUARD_LLM_BASE_URL,
      model: config.llm.model || process.env.A11YGUARD_LLM_MODEL,
    })
  }

  const report = toReviewReport(findings)
  return { report, failed: shouldFail(findings, config) }
}
