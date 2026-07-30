import * as core from '@actions/core'
import * as github from '@actions/github'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { mergeConfig, loadConfigFile, reviewSources, type SourceFile } from '@a11yguard/core'
import {
  buildStickyBody,
  createCheckRun,
  patchesToDiff,
  postSuggestionReview,
  sarifForUpload,
  upsertStickyComment,
} from './github.js'

async function main() {
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || ''
  const failOn = (core.getInput('fail-on') || 'error') as 'error' | 'warning' | 'never'
  const failOnNew = core.getInput('fail-on-new') !== 'false'
  const configPath = core.getInput('config-path') || undefined
  const baselinePath = core.getInput('baseline-path') || undefined
  const axe = core.getInput('axe') === 'true'
  const previewUrl = core.getInput('preview-url') || undefined
  const postReview = core.getInput('post-review') !== 'false'
  const sticky = core.getInput('sticky-comment') !== 'false'
  const uploadSarif = core.getInput('upload-sarif') === 'true'
  const llmKey = core.getInput('llm-api-key') || process.env.A11YGUARD_LLM_API_KEY || ''

  if (llmKey) process.env.A11YGUARD_LLM_API_KEY = llmKey

  const cwd = process.cwd()
  const fileCfg = await loadConfigFile(cwd, configPath)
  const config = mergeConfig(fileCfg, {
    failOn,
    failOnNew,
    baselinePath: baselinePath || fileCfg.baselinePath,
    axe,
    previewUrl: previewUrl || fileCfg.previewUrl,
    llm: {
      ...fileCfg.llm,
      enabled: Boolean(llmKey),
      model: core.getInput('llm-model') || fileCfg.llm?.model,
      baseUrl: core.getInput('llm-base-url') || fileCfg.llm?.baseUrl,
    },
  })

  const ctx = github.context
  const octokit = github.getOctokit(token)
  const { owner, repo } = ctx.repo

  let files: SourceFile[] = []
  let diffText: string | undefined

  if (ctx.payload.pull_request) {
    const pr = ctx.payload.pull_request
    const listed = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    })
    diffText = patchesToDiff(listed.data)
    for (const f of listed.data) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: f.filename,
          ref: pr.head.sha,
        })
        if ('content' in data && typeof data.content === 'string') {
          files.push({
            path: f.filename,
            content: Buffer.from(data.content, 'base64').toString('utf8'),
          })
        }
      } catch {
        /* binary or missing */
      }
    }

    const result = await reviewSources({ files, config, cwd, diffText, allLines: false })
    const outDir = path.join(cwd, '.a11yguard')
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'report.json'), JSON.stringify(result.report, null, 2))
    await writeFile(path.join(outDir, 'report.sarif'), sarifForUpload(result.report))

    if (sticky) {
      await upsertStickyComment(octokit as unknown as import('./github.js').GhLike, {
        owner,
        repo,
        issue_number: pr.number,
        body: buildStickyBody(result.report),
      })
    }
    if (postReview) {
      await postSuggestionReview(octokit as unknown as import('./github.js').GhLike, {
        owner,
        repo,
        pull_number: pr.number,
        commit_id: pr.head.sha,
        findings: result.report.findings,
      })
    }
    await createCheckRun(octokit as unknown as import('./github.js').GhLike, {
      owner,
      repo,
      head_sha: pr.head.sha,
      report: result.report,
      failed: result.failed,
    })

    core.setOutput('grade', result.report.grade)
    core.setOutput('new-count', String(result.report.newCount))
    core.setOutput('sarif-path', path.join(outDir, 'report.sarif'))
    if (uploadSarif) {
      core.info('SARIF written; upload with github/codeql-action/upload-sarif in a follow-up step.')
    }
    if (result.failed) core.setFailed(`A11yGuard failed with grade ${result.report.grade}`)
  } else {
    // non-PR: review working tree via local paths from input
    const dir = core.getInput('dir') || cwd
    const { runReview } = await import('@khyfee/a11yguard')
    const result = await runReview({ cwd, targetDir: dir, allLines: true, axe, previewUrl })
    core.setOutput('grade', result.report.grade)
    if (result.failed) core.setFailed(`A11yGuard failed with grade ${result.report.grade}`)
  }
}

main().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err))
})
