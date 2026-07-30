import type { Finding, SourceFile } from './types.js'
import { lineInScope, makeFinding } from './fingerprint.js'

function linesOf(content: string): string[] {
  return content.split(/\r?\n/)
}

function hasIgnore(prev: string | undefined): boolean {
  return Boolean(prev && /a11yguard-ignore(-next-line)?/i.test(prev))
}

/** Static HTML / template heuristics (also works on JSX text). */
export function analyzeStaticHtml(file: SourceFile): Finding[] {
  const out: Finding[] = []
  const lines = linesOf(file.content)
  const isHtmlLike = /\.(html?|jsx|tsx|vue|svelte|mdx)$/i.test(file.path) || file.content.includes('<')

  if (!isHtmlLike) return out

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    if (!lineInScope(lineNo, file.changedLines)) continue
    if (hasIgnore(lines[i - 1])) continue
    const line = lines[i]!
    const trimmed = line.trim()

    // img missing alt
    if (/<img\b/i.test(line) && !/\balt\s*=/i.test(line)) {
      out.push(
        makeFinding({
          ruleId: 'img-alt',
          severity: 'error',
          message: 'Image is missing an alt attribute',
          path: file.path,
          line: lineNo,
          snippet: trimmed,
          wcag: ['1.1.1'],
          wcagLevel: 'A',
          confidence: 'high',
          suggestion: trimmed.replace(/<img\b/i, '<img alt=""'),
          explanation: 'Provide meaningful alt text, or alt="" for decorative images.',
        }),
      )
    }

    // empty button
    if (/<button\b[^>]*>\s*<\/button>/i.test(line) || (/<button\b[^/]*\/?\s*>/i.test(line) && !/>[^<]+</.test(line) && !/\baria-label\s*=/i.test(line) && !/\btitle\s*=/i.test(line))) {
      if (/<button\b/i.test(line) && !/\baria-label\s*=/i.test(line) && !/>\s*[^<\s].*</i.test(line) && !/<\/button>/i.test(line) === false) {
        // handled below more carefully
      }
    }
    if (/<button\b/i.test(line)) {
      const selfClosingEmpty = /<button\b[^>]*\/>/i.test(line) && !/\baria-label\s*=/i.test(line)
      const emptyPair = /<button\b[^>]*>\s*<\/button>/i.test(line) && !/\baria-label\s*=/i.test(line)
      if (selfClosingEmpty || emptyPair) {
        out.push(
          makeFinding({
            ruleId: 'button-name',
            severity: 'error',
            message: 'Button has no accessible name',
            path: file.path,
            line: lineNo,
            snippet: trimmed,
            wcag: ['4.1.2'],
            wcagLevel: 'A',
            confidence: 'high',
            suggestion: trimmed.replace(/<button\b/i, '<button aria-label="Describe action"'),
            explanation: 'Add visible text or aria-label.',
          }),
        )
      }
    }

    // empty anchor
    if (/<a\b/i.test(line) && /<a\b[^>]*>\s*<\/a>/i.test(line) && !/\baria-label\s*=/i.test(line)) {
      out.push(
        makeFinding({
          ruleId: 'link-name',
          severity: 'error',
          message: 'Link has no accessible name',
          path: file.path,
          line: lineNo,
          snippet: trimmed,
          wcag: ['2.4.4', '4.1.2'],
          wcagLevel: 'A',
          confidence: 'high',
          suggestion: trimmed.replace(/<a\b/i, '<a aria-label="Describe destination"'),
          explanation: 'Add link text or aria-label.',
        }),
      )
    }

    // input without label/aria
    if (/<input\b/i.test(line) && !/type\s*=\s*["']hidden["']/i.test(line)) {
      if (!/\baria-label\s*=/i.test(line) && !/\baria-labelledby\s*=/i.test(line) && !/\bid\s*=/i.test(line) && !/\btitle\s*=/i.test(line)) {
        out.push(
          makeFinding({
            ruleId: 'input-label',
            severity: 'error',
            message: 'Input lacks an accessible label',
            path: file.path,
            line: lineNo,
            snippet: trimmed,
            wcag: ['1.3.1', '4.1.2'],
            wcagLevel: 'A',
            confidence: 'medium',
            suggestion: trimmed.replace(/<input\b/i, '<input aria-label="Describe field"'),
            explanation: 'Associate a <label> via id/htmlFor or add aria-label.',
          }),
        )
      }
    }

    // positive tabindex
    if (/\btabIndex\s*=\s*{?\s*["']?[1-9]/i.test(line) || /\btabindex\s*=\s*["']?[1-9]/i.test(line)) {
      out.push(
        makeFinding({
          ruleId: 'tabindex-positive',
          severity: 'warning',
          message: 'Positive tabIndex disrupts natural focus order',
          path: file.path,
          line: lineNo,
          snippet: trimmed,
          wcag: ['2.4.3'],
          wcagLevel: 'A',
          confidence: 'high',
          suggestion: trimmed.replace(/tabIndex\s*=\s*{?\s*["']?[1-9][0-9]*["']?\s*}?/i, 'tabIndex={0}').replace(/tabindex\s*=\s*["']?[1-9][0-9]*["']?/i, 'tabindex="0"'),
          explanation: 'Use tabindex="0" or "-1", never positive values.',
        }),
      )
    }

    // autofocus
    if (/\bautoFocus\b/.test(line) || /\bautofocus\b/i.test(line)) {
      out.push(
        makeFinding({
          ruleId: 'autofocus',
          severity: 'warning',
          message: 'autofocus can disorient keyboard and screen-reader users',
          path: file.path,
          line: lineNo,
          snippet: trimmed,
          wcag: ['2.4.3'],
          wcagLevel: 'A',
          confidence: 'medium',
          suggestion: trimmed.replace(/\s*autoFocus(=\{?true\}?)?/, '').replace(/\s*autofocus(="true")?/i, ''),
          explanation: 'Prefer moving focus deliberately after user action.',
        }),
      )
    }

    // html/jsx onclick on div/span
    if (/<(div|span)\b[^>]*\bonClick\s*=/i.test(line) && !/\bonKeyDown\s*=/i.test(line) && !/\brole\s*=/i.test(line)) {
      out.push(
        makeFinding({
          ruleId: 'click-keyboard',
          severity: 'error',
          message: 'Non-interactive element has onClick without keyboard support',
          path: file.path,
          line: lineNo,
          snippet: trimmed,
          wcag: ['2.1.1'],
          wcagLevel: 'A',
          confidence: 'high',
          suggestion: trimmed.replace(/<(div|span)\b/i, '<$1 role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}'),
          explanation: 'Use a <button>, or add role, tabIndex, and keyboard handler.',
        }),
      )
    }
  }

  return out
}
