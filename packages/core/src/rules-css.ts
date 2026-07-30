import type { Finding, SourceFile } from './types.js'
import { lineInScope, makeFinding } from './fingerprint.js'

const HEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g
const RGB = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1)
  if (h.length === 3) {
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)]
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const L1 = relLuminance(a)
  const L2 = relLuminance(b)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

function colorsIn(text: string): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const m of text.matchAll(HEX)) out.push(hexToRgb(m[0]!))
  for (const m of text.matchAll(RGB)) out.push([Number(m[1]), Number(m[2]), Number(m[3])])
  return out
}

/** When fg+bg literals appear in the same hunk, compute contrast; else low-confidence suspect. */
export function analyzeCssHints(file: SourceFile): Finding[] {
  if (!/\.(css|scss|sass|less|tsx|jsx|html?)$/i.test(file.path)) return []
  const out: Finding[] = []
  const lines = file.content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    if (!lineInScope(lineNo, file.changedLines)) continue
    const line = lines[i]!
    if (/a11yguard-ignore(-next-line)?/i.test(lines[i - 1] ?? '')) continue

    const hasColorProp = /(color|background(-color)?)\s*:/i.test(line)
    if (!hasColorProp) continue

    // look at a small window for paired colors
    const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n')
    const cols = colorsIn(window)
    if (cols.length >= 2) {
      const ratio = contrastRatio(cols[0]!, cols[1]!)
      if (ratio < 4.5) {
        out.push(
          makeFinding({
            ruleId: 'contrast-pair',
            severity: 'error',
            message: `Contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA 4.5:1`,
            path: file.path,
            line: lineNo,
            snippet: line.trim(),
            wcag: ['1.4.3'],
            wcagLevel: 'AA',
            confidence: 'medium',
            explanation: 'Computed from color literals in nearby changed lines.',
          }),
        )
      }
    } else if (cols.length === 1) {
      out.push(
        makeFinding({
          ruleId: 'contrast-suspect',
          severity: 'info',
          message: 'Color change detected; contrast cannot be verified without a rendered pair',
          path: file.path,
          line: lineNo,
          snippet: line.trim(),
          wcag: ['1.4.3'],
          wcagLevel: 'AA',
          confidence: 'low',
          explanation: 'Enable axe/preview-url for reliable contrast checks.',
        }),
      )
    }
  }
  return out
}
