import type { Finding } from './types.js'

export interface LlmConfig {
  apiKey: string
  baseUrl?: string
  model?: string
}

interface LlmSuggestion {
  explanation?: string
  suggestion?: string
}

/** Enrich findings with LLM suggestions; invalid/hallucinated responses are dropped. */
export async function enrichWithLlm(findings: Finding[], cfg: LlmConfig): Promise<Finding[]> {
  if (!cfg.apiKey) return findings
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = cfg.model || 'gpt-4o-mini'
  const out: Finding[] = []

  for (const f of findings) {
    if (!f.isNew || f.severity === 'info') {
      out.push(f)
      continue
    }
    try {
      const enriched = await suggestOne(f, { base, model, apiKey: cfg.apiKey })
      out.push({
        ...f,
        explanation: enriched.explanation || f.explanation,
        suggestion: sanitizeSuggestion(enriched.suggestion, f) || f.suggestion,
      })
    } catch {
      out.push(f)
    }
  }
  return out
}

async function suggestOne(
  f: Finding,
  opts: { base: string; model: string; apiKey: string },
): Promise<LlmSuggestion> {
  const body = {
    model: opts.model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You fix WCAG accessibility issues. Reply JSON only: {"explanation":string,"suggestion":string}. suggestion must be a single replacement line for the snippet, same language, no markdown fences.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          ruleId: f.ruleId,
          message: f.message,
          path: f.path,
          snippet: f.snippet.slice(0, 500),
          wcag: f.wcag,
        }),
      },
    ],
  }
  const res = await fetch(`${opts.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`llm_http_${res.status}`)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('llm_empty')
  const parsed = JSON.parse(content) as LlmSuggestion
  if (typeof parsed !== 'object' || parsed === null) throw new Error('llm_shape')
  return parsed
}

function sanitizeSuggestion(suggestion: string | undefined, f: Finding): string | undefined {
  if (!suggestion) return undefined
  const s = suggestion.trim()
  if (!s || s.length > 400) return undefined
  if (/```/.test(s)) return undefined
  // must look like code touching the same tag family
  if (f.snippet.includes('<') && !s.includes('<')) return undefined
  return s
}
