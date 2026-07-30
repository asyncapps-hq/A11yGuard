#!/usr/bin/env node
import path from 'node:path'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { AUTHOR, PRODUCT } from '@a11yguard/core'
import { doctor, repoRootFrom, runReview } from './index.js'

const args = process.argv.slice(2)
const cmd = args[0] ?? 'help'

async function main() {
  const cwd = process.cwd()
  if (cmd === 'doctor') {
    console.log(JSON.stringify(await doctor(cwd), null, 2))
    return
  }
  if (cmd === 'review') {
    const target = flag(args, '--dir') ?? cwd
    const diff = flag(args, '--diff')
    const axe = args.includes('--axe')
    const preview = flag(args, '--preview-url')
    const updateBaseline = args.includes('--update-baseline')
    const result = await runReview({
      cwd,
      targetDir: path.resolve(cwd, target),
      diffPath: diff ? path.resolve(cwd, diff) : undefined,
      allLines: !diff,
      axe,
      previewUrl: preview,
      updateBaseline,
    })
    console.log(result.report.summaryMarkdown)
    console.log(`Reports: ${path.join(cwd, '.a11yguard')}`)
    process.exitCode = result.failed ? 1 : 0
    return
  }
  if (cmd === 'demo') {
    console.log(`${PRODUCT} by ${AUTHOR}`)
    const root = repoRootFrom(import.meta.url)
    const bad = path.join(root, 'fixtures', 'bad-app')
    // serve bad-app briefly for optional axe
    const html = await readFile(path.join(bad, 'index.html'))
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const previewUrl = `http://127.0.0.1:${port}/`
    try {
      const result = await runReview({
        cwd: root,
        targetDir: bad,
        allLines: true,
        axe: true,
        previewUrl,
      })
      console.log(result.report.summaryMarkdown)
      console.log(`Alert/report dir: ${path.join(root, '.a11yguard')}`)
      console.log(`Findings: ${result.report.findings.length} (new=${result.report.newCount}) grade=${result.report.grade}`)
      console.log('Demo OK')
      // demo always succeeds as a smoke path; review exit codes apply to `review`
      process.exitCode = 0
    } finally {
      server.close()
    }
    return
  }
  if (cmd === 'baseline') {
    const sub = args[1]
    if (sub === 'update') {
      const target = flag(args, '--dir') ?? cwd
      await runReview({
        cwd,
        targetDir: path.resolve(cwd, target),
        allLines: true,
        updateBaseline: true,
      })
      console.log('Baseline updated')
      return
    }
  }
  console.log(`${PRODUCT} by ${AUTHOR}
Usage:
  a11yguard doctor
  a11yguard review [--dir <path>] [--diff <file>] [--axe] [--preview-url <url>] [--update-baseline]
  a11yguard demo
  a11yguard baseline update [--dir <path>]
`)
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
