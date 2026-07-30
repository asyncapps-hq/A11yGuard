import type { SourceFile } from './types.js'

/** Parse unified diff into path → changed line numbers (new-file side). */
export function parseUnifiedDiff(diff: string): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()
  let current: string | null = null
  let newLine = 0

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim().replace(/^[ab]\//, '')
      current = p === '/dev/null' ? null : p
      if (current && !map.has(current)) map.set(current, new Set())
      continue
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)(?:,(\d+))?/)
      newLine = m ? Number(m[1]) : 0
      continue
    }
    if (!current) continue
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      map.get(current)!.add(newLine)
      newLine++
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      // old line only
    } else {
      newLine++
    }
  }
  return map
}

export function applyChangedLines(files: SourceFile[], diffMap: Map<string, Set<number>>): SourceFile[] {
  if (diffMap.size === 0) return files
  return files.map((f) => {
    const norm = f.path.replace(/\\/g, '/')
    const hit =
      diffMap.get(norm) ||
      [...diffMap.entries()].find(([k]) => norm.endsWith(k) || k.endsWith(norm))?.[1]
    return hit ? { ...f, changedLines: hit } : f
  })
}
