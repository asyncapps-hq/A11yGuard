export { PRODUCT, AUTHOR, STICKY_MARKER } from './types.js'
export type {
  Severity,
  WcagLevel,
  Confidence,
  Grade,
  SourceFile,
  Finding,
  Suppression,
  A11yGuardConfig,
  ReviewReport,
  BaselineFile,
} from './types.js'
export { fingerprint, normalizeSnippet, contrastRatioSafe } from './reexports.js'
export { contrastRatio } from './rules-css.js'
export { analyzeStaticHtml } from './rules-html.js'
export { analyzeJsx } from './rules-jsx.js'
export { analyzeCssHints } from './rules-css.js'
export { defaultConfig, mergeConfig, loadConfigFile, pathMatches } from './config.js'
export {
  loadBaseline,
  writeBaseline,
  applyGovernance,
  shouldFail,
  isSuppressed,
} from './baseline.js'
export {
  gradeFindings,
  buildSuggestionFence,
  buildStickyMarkdown,
  buildInlineComment,
  toReviewReport,
} from './report.js'
export { toSarif, checkAnnotations } from './sarif.js'
export { enrichWithLlm } from './llm.js'
export { analyzeWithAxe } from './axe.js'
export { parseUnifiedDiff, applyChangedLines } from './diff.js'
export { reviewSources } from './pipeline.js'
export type { ReviewInput, ReviewResult } from './pipeline.js'
