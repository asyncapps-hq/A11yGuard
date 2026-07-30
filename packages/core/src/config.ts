import { readFile } from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import type { A11yGuardConfig } from './types.js'

const DEFAULTS: A11yGuardConfig = {
  paths: ['**/*.{html,htm,jsx,tsx,vue,svelte,css,scss,mdx}'],
  ignorePaths: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  wcagLevel: 'AA',
  failOn: 'error',
  failOnNew: true,
  axe: false,
  rules: {},
  suppressions: [],
  llm: { enabled: false },
}

export function defaultConfig(): A11yGuardConfig {
  return structuredClone(DEFAULTS)
}

export function mergeConfig(...parts: Array<Partial<A11yGuardConfig> | undefined>): A11yGuardConfig {
  const base = defaultConfig()
  for (const p of parts) {
    if (!p) continue
    Object.assign(base, p)
    if (p.rules) base.rules = { ...base.rules, ...p.rules }
    if (p.suppressions) base.suppressions = [...(base.suppressions ?? []), ...p.suppressions]
    if (p.llm) base.llm = { ...base.llm, ...p.llm }
  }
  return base
}

export async function loadConfigFile(cwd: string, configPath?: string): Promise<A11yGuardConfig> {
  const candidates = configPath
    ? [path.resolve(cwd, configPath)]
    : [path.join(cwd, '.a11yguard.yml'), path.join(cwd, '.a11yguard.yaml')]
  for (const file of candidates) {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = yaml.load(raw) as Record<string, unknown> | null
      if (!parsed || typeof parsed !== 'object') return defaultConfig()
      return mergeConfig(normalizeYaml(parsed))
    } catch {
      /* try next */
    }
  }
  return defaultConfig()
}

function normalizeYaml(o: Record<string, unknown>): Partial<A11yGuardConfig> {
  return {
    paths: (o.paths as string[]) ?? undefined,
    ignorePaths: (o['ignore-paths'] as string[]) ?? (o.ignorePaths as string[]) ?? undefined,
    wcagLevel: (o['wcag-level'] as A11yGuardConfig['wcagLevel']) ?? (o.wcagLevel as A11yGuardConfig['wcagLevel']),
    failOn: (o['fail-on'] as A11yGuardConfig['failOn']) ?? (o.failOn as A11yGuardConfig['failOn']),
    failOnNew: (o['fail-on-new'] as boolean) ?? (o.failOnNew as boolean),
    baselinePath: (o.baseline as string) ?? (o.baselinePath as string),
    rules: o.rules as A11yGuardConfig['rules'],
    suppressions: o.suppressions as A11yGuardConfig['suppressions'],
    axe: o.axe as boolean,
    previewUrl: (o['preview-url'] as string) ?? (o.previewUrl as string),
    llm: o.llm as A11yGuardConfig['llm'],
  }
}

/** Minimal glob: **, *, and {a,b} braces. */
export function pathMatches(filePath: string, patterns: string[] | undefined, fallback = true): boolean {
  if (!patterns || patterns.length === 0) return fallback
  const norm = filePath.replace(/\\/g, '/')
  return patterns.some((p) => expandBraces(p.replace(/\\/g, '/')).some((g) => matchGlob(norm, g)))
}

function expandBraces(pattern: string): string[] {
  const m = pattern.match(/\{([^}]+)\}/)
  if (!m) return [pattern]
  const parts = m[1]!.split(',')
  return parts.flatMap((part) => expandBraces(pattern.replace(m[0], part)))
}

function matchGlob(file: string, pattern: string): boolean {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DS::/g, '.*')
  const re = new RegExp(`^${esc}$`, 'i')
  if (re.test(file)) return true
  // allow patterns like **/*.html to match index.html at root of scan
  if (pattern.includes('/')) {
    const basePat = pattern.replace(/^(\*\*\/)+/, '')
    if (basePat !== pattern) return matchGlob(file, basePat) || matchGlob(file.split('/').pop()!, basePat)
  }
  return false
}
