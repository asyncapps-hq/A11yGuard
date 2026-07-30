import type { Finding, ReviewReport } from './types.js'

interface SarifLog {
  version: '2.1.0'
  $schema: string
  runs: Array<{
    tool: { driver: { name: string; informationUri: string; rules: Array<{ id: string; shortDescription: { text: string } }> } }
    results: Array<{
      ruleId: string
      level: 'error' | 'warning' | 'note'
      message: { text: string }
      fingerprints: { primary: string }
      locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }>
    }>
  }>
}

export function toSarif(report: ReviewReport): SarifLog {
  const rules = [...new Map(report.findings.map((f) => [f.ruleId, f])).values()]
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'A11yGuard',
            informationUri: 'https://github.com/KhyFee/A11yGuard',
            rules: rules.map((f) => ({
              id: f.ruleId,
              shortDescription: { text: f.message },
            })),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          level: f.severity === 'info' ? 'note' : f.severity,
          message: { text: f.message },
          fingerprints: { primary: f.fingerprint },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.path.replace(/\\/g, '/') },
                region: { startLine: f.line },
              },
            },
          ],
        })),
      },
    ],
  }
}

export function checkAnnotations(findings: Finding[]): Array<{
  path: string
  start_line: number
  end_line: number
  annotation_level: 'failure' | 'warning' | 'notice'
  message: string
  title: string
}> {
  return findings.slice(0, 50).map((f) => ({
    path: f.path.replace(/\\/g, '/'),
    start_line: f.line,
    end_line: f.endLine ?? f.line,
    annotation_level: f.severity === 'error' ? 'failure' : f.severity === 'warning' ? 'warning' : 'notice',
    message: f.message,
    title: f.ruleId,
  }))
}
