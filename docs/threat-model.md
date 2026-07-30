# Threat model

## Assets
- GitHub tokens (`pull-requests: write`, `checks: write`, optional `security-events: write`)
- Optional LLM API keys
- Source snippets sent to LLM (hunk-limited)

## Controls
- Rules engine runs offline without secrets
- Doctor/logs redact token values
- LLM prompts send only finding snippet + limited context (not full repo)
- Session-less: no cookie stores
- Baseline/suppressions are explicit governance, not silent drop without reason

## Residual risk
- Malicious PRs can attempt prompt injection via code comments; suggestions are validated before apply
- Contrast without axe remains low-confidence by design
