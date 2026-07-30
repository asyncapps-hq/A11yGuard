import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Finding = {
  ruleId: string
  severity: string
  message: string
  path: string
  line: number
  wcag: string[]
  suggestion?: string
  isNew?: boolean
}

type Report = {
  grade?: string
  newCount?: number
  preexistingCount?: number
  findings?: Finding[]
  summaryMarkdown?: string
}

async function loadReport(): Promise<Report | null> {
  const candidates = [
    path.resolve(process.cwd(), '../../.a11yguard/report.json'),
    path.resolve(process.cwd(), '.a11yguard/report.json'),
    path.resolve(process.cwd(), '../../fixtures/sample-report.json'),
  ]
  for (const p of candidates) {
    try {
      return JSON.parse(await readFile(p, 'utf8')) as Report
    } catch {
      /* next */
    }
  }
  return null
}

export default async function HomePage() {
  const report = await loadReport()
  const findings = report?.findings?.filter((f) => f.isNew !== false).slice(0, 20) ?? []
  const sample = findings.find((f) => f.suggestion)

  return (
    <main>
      <h1 className="brand">A11yGuard</h1>
      <p className="lead">
        Catch WCAG regressions in the PR — static rules, JSX AST, axe-core, and one-click suggested fixes.
      </p>
      <div className="grade">{report?.grade ?? '—'}</div>
      <p className="lead">
        New issues: {report?.newCount ?? 0} · Preexisting: {report?.preexistingCount ?? 0}
      </p>

      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Rule</th>
            <th>WCAG</th>
            <th>Location</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {findings.length === 0 ? (
            <tr>
              <td colSpan={5}>Run <code>npm run demo</code> to generate a local report.</td>
            </tr>
          ) : (
            findings.map((f) => (
              <tr key={f.ruleId + f.path + f.line}>
                <td className={`sev-${f.severity}`}>{f.severity}</td>
                <td><code>{f.ruleId}</code></td>
                <td>{f.wcag?.join(', ')}</td>
                <td><code>{f.path}:{f.line}</code></td>
                <td>{f.message}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {sample?.suggestion ? (
        <>
          <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '2.5rem' }}>Sample suggestion</h2>
          <pre className="suggest">{sample.suggestion}</pre>
        </>
      ) : null}
    </main>
  )
}
