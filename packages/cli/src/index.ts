import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTHOR,
  PRODUCT,
  defaultConfig,
  loadConfigFile,
  mergeConfig,
  reviewSources,
  toSarif,
  writeBaseline,
  type SourceFile,
} from '@a11yguard/core'

export function repoRootFrom(metaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '../../..')
}

export async function collectFiles(dir: string, base = dir): Promise<SourceFile[]> {
  const out: SourceFile[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue
      out.push(...(await collectFiles(full, base)))
    } else if (/\.(html?|jsx|tsx|css|scss|vue|svelte|mdx)$/i.test(e.name)) {
      out.push({
        path: path.relative(base, full).replace(/\\/g, '/'),
        content: await readFile(full, 'utf8'),
      })
    }
  }
  return out
}

export async function writeReports(outDir: string, report: Awaited<ReturnType<typeof reviewSources>>['report']) {
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(path.join(outDir, 'report.md'), report.summaryMarkdown + '\n')
  await writeFile(path.join(outDir, 'report.sarif'), JSON.stringify(toSarif(report), null, 2) + '\n')
}

export async function runReview(opts: {
  cwd: string
  targetDir?: string
  diffPath?: string
  allLines?: boolean
  updateBaseline?: boolean
  axe?: boolean
  previewUrl?: string
}) {
  const fileCfg = await loadConfigFile(opts.cwd)
  const config = mergeConfig(fileCfg, {
    axe: opts.axe ?? fileCfg.axe,
    previewUrl: opts.previewUrl ?? fileCfg.previewUrl ?? process.env.A11YGUARD_PREVIEW_URL,
    llm: {
      ...fileCfg.llm,
      enabled: Boolean(process.env.A11YGUARD_LLM_API_KEY || process.env.OPENAI_API_KEY),
    },
  })
  const target = opts.targetDir ?? opts.cwd
  const files = await collectFiles(target)
  const diffText = opts.diffPath ? await readFile(opts.diffPath, 'utf8') : undefined
  const result = await reviewSources({
    files,
    config,
    cwd: opts.cwd,
    diffText,
    allLines: opts.allLines ?? !diffText,
  })
  const outDir = path.join(opts.cwd, '.a11yguard')
  await writeReports(outDir, result.report)
  if (opts.updateBaseline && config.baselinePath) {
    await writeBaseline(path.resolve(opts.cwd, config.baselinePath), result.report.findings)
  }
  return result
}

export async function doctor(cwd: string) {
  const cfg = await loadConfigFile(cwd)
  return {
    banner: `${PRODUCT} by ${AUTHOR}`,
    node: process.version,
    cwd,
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN),
    hasLlmKey: Boolean(process.env.A11YGUARD_LLM_API_KEY || process.env.OPENAI_API_KEY),
    config: {
      wcagLevel: cfg.wcagLevel,
      failOn: cfg.failOn,
      axe: cfg.axe,
      paths: cfg.paths,
    },
  }
}

export { defaultConfig }
