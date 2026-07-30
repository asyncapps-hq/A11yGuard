export const PRODUCT = 'A11yGuard'
export const AUTHOR = 'KhyFee'
export const STICKY_MARKER = '<!-- a11yguard-report -->'

export type Severity = 'error' | 'warning' | 'info'
export type WcagLevel = 'A' | 'AA'
export type Confidence = 'high' | 'medium' | 'low'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface SourceFile {
  path: string
  content: string
  /** 1-based changed line numbers; empty = treat all lines as in-scope */
  changedLines?: Set<number>
}

export interface Finding {
  ruleId: string
  severity: Severity
  message: string
  path: string
  line: number
  column?: number
  endLine?: number
  snippet: string
  wcag: string[]
  wcagLevel: WcagLevel
  confidence: Confidence
  fingerprint: string
  suggestion?: string
  explanation?: string
  isNew?: boolean
}

export interface Suppression {
  rule: string
  path?: string
  reason: string
  expires?: string
}

export interface A11yGuardConfig {
  paths?: string[]
  ignorePaths?: string[]
  wcagLevel?: WcagLevel
  failOn?: Severity | 'never'
  failOnNew?: boolean
  baselinePath?: string
  rules?: Record<string, Severity | 'off'>
  suppressions?: Suppression[]
  axe?: boolean
  previewUrl?: string
  llm?: {
    enabled?: boolean
    model?: string
    baseUrl?: string
  }
}

export interface ReviewReport {
  product: string
  author: string
  generatedAt: string
  grade: Grade
  findings: Finding[]
  newCount: number
  preexistingCount: number
  summaryMarkdown: string
}

export interface BaselineFile {
  version: 1
  fingerprints: string[]
}
