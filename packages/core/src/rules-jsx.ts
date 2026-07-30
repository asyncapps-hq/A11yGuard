import ts from 'typescript'
import type { Finding, SourceFile } from './types.js'
import { lineInScope, makeFinding } from './fingerprint.js'

function hasIgnoreNear(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const start = node.getFullStart()
  const text = sourceFile.getFullText().slice(Math.max(0, start - 120), start)
  return /a11yguard-ignore(-next-line)?/i.test(text)
}

function getAttr(attrs: ts.JsxAttributes, name: string): ts.JsxAttribute | undefined {
  for (const prop of attrs.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name) return prop
  }
  return undefined
}

function textContent(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  if (ts.isJsxSelfClosingElement(node)) return ''
  return node.children.map((c) => c.getText()).join('').replace(/\s+/g, ' ').trim()
}

/** JSX/TSX AST rules via TypeScript compiler API. */
export function analyzeJsx(file: SourceFile): Finding[] {
  if (!/\.(jsx|tsx)$/i.test(file.path)) return []
  const out: Finding[] = []
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, /\.tsx$/i.test(file.path) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX)

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText()
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      const lineNo = line + 1
      if (!lineInScope(lineNo, file.changedLines)) {
        ts.forEachChild(node, visit)
        return
      }
      if (hasIgnoreNear(sf, node)) {
        ts.forEachChild(node, visit)
        return
      }
      const snippet = node.getText(sf).split(/\r?\n/)[0]!.trim().slice(0, 200)
      const attrs = node.attributes

      if ((tag === 'img' || tag === 'Image') && !getAttr(attrs, 'alt')) {
        out.push(
          makeFinding({
            ruleId: 'jsx-img-alt',
            severity: 'error',
            message: `<${tag}> is missing alt`,
            path: file.path,
            line: lineNo,
            snippet,
            wcag: ['1.1.1'],
            wcagLevel: 'A',
            confidence: 'high',
            suggestion: snippet.replace(`<${tag}`, `<${tag} alt=""`),
            explanation: 'Add alt text for informative images, or alt="" if decorative.',
          }),
        )
      }

      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        const typeAttr = getAttr(attrs, 'type')
        const typeText = typeAttr?.initializer?.getText() ?? ''
        if (!/hidden/i.test(typeText)) {
          if (!getAttr(attrs, 'aria-label') && !getAttr(attrs, 'aria-labelledby') && !getAttr(attrs, 'id') && !getAttr(attrs, 'title')) {
            out.push(
              makeFinding({
                ruleId: 'jsx-input-label',
                severity: 'error',
                message: `<${tag}> lacks an accessible label`,
                path: file.path,
                line: lineNo,
                snippet,
                wcag: ['1.3.1', '4.1.2'],
                wcagLevel: 'A',
                confidence: 'medium',
                suggestion: snippet.replace(`<${tag}`, `<${tag} aria-label="Describe field"`),
                explanation: 'Wire a label with htmlFor/id or set aria-label.',
              }),
            )
          }
        }
      }

      if (getAttr(attrs, 'onClick') && !['button', 'a', 'input', 'select', 'textarea'].includes(tag)) {
        if (!getAttr(attrs, 'onKeyDown') && !getAttr(attrs, 'onKeyUp') && !getAttr(attrs, 'role')) {
          out.push(
            makeFinding({
              ruleId: 'jsx-click-keyboard',
              severity: 'error',
              message: `<${tag}> has onClick without keyboard support`,
              path: file.path,
              line: lineNo,
              snippet,
              wcag: ['2.1.1'],
              wcagLevel: 'A',
              confidence: 'high',
              suggestion: snippet.replace(`<${tag}`, `<${tag} role="button" tabIndex={0}`),
              explanation: 'Prefer <button>, or add role, tabIndex={0}, and onKeyDown.',
            }),
          )
        }
      }
    }

    if (ts.isJsxElement(node)) {
      const open = node.openingElement
      const tag = open.tagName.getText()
      const { line } = sf.getLineAndCharacterOfPosition(open.getStart(sf))
      const lineNo = line + 1
      if (lineInScope(lineNo, file.changedLines) && !hasIgnoreNear(sf, open)) {
        const name = textContent(node)
        const attrs = open.attributes
        const snippet = open.getText(sf).split(/\r?\n/)[0]!.trim().slice(0, 200)
        if ((tag === 'button' || tag === 'a') && !name && !getAttr(attrs, 'aria-label') && !getAttr(attrs, 'aria-labelledby') && !getAttr(attrs, 'title')) {
          out.push(
            makeFinding({
              ruleId: tag === 'button' ? 'jsx-button-name' : 'jsx-link-name',
              severity: 'error',
              message: `<${tag}> has no accessible name`,
              path: file.path,
              line: lineNo,
              snippet,
              wcag: tag === 'a' ? ['2.4.4', '4.1.2'] : ['4.1.2'],
              wcagLevel: 'A',
              confidence: 'high',
              suggestion: snippet.replace(`<${tag}`, `<${tag} aria-label="Describe ${tag === 'a' ? 'destination' : 'action'}"`),
              explanation: 'Add visible text or aria-label.',
            }),
          )
        }

        // htmlFor / id pairing: label without htmlFor when wrapping not used
        if (tag === 'label' && !getAttr(attrs, 'htmlFor') && textContent(node).length > 0) {
          const onlyText = node.children.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && !c.expression))
          if (onlyText) {
            out.push(
              makeFinding({
                ruleId: 'jsx-label-for',
                severity: 'warning',
                message: '<label> should use htmlFor (or wrap a control)',
                path: file.path,
                line: lineNo,
                snippet,
                wcag: ['1.3.1'],
                wcagLevel: 'A',
                confidence: 'low',
                suggestion: snippet.replace('<label', '<label htmlFor="field-id"'),
                explanation: 'Associate label with control via htmlFor/id.',
              }),
            )
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
  return out
}
