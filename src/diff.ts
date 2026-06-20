import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

/** 设置需要高亮的差异行号集合（1-based） */
export const setDiffLines = StateEffect.define<Set<number>>()

const diffLineMark = Decoration.line({ class: 'cm-diff-line' })

/** 持有差异高亮装饰的字段；任意文档改动会自动清除高亮 */
export const diffField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setDiffLines)) {
        const lines = e.value
        if (lines.size === 0) return Decoration.none
        const ranges = []
        for (const ln of [...lines].sort((a, b) => a - b)) {
          if (ln >= 1 && ln <= tr.state.doc.lines) {
            ranges.push(diffLineMark.range(tr.state.doc.line(ln).from))
          }
        }
        return Decoration.set(ranges, true)
      }
    }
    // 文档变化即视为用户重新编辑，清除旧的对比高亮
    if (tr.docChanged) return Decoration.none
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

export const diffTheme = EditorView.baseTheme({
  '.cm-diff-line': { backgroundColor: 'rgba(251, 146, 60, 0.22)' },
})

/**
 * 行级差异（基于 LCS）。返回两侧各自“与对方不同”的行号集合（1-based）。
 */
export function lineDiff(
  aText: string,
  bText: string,
): { a: Set<number>; b: Set<number> } {
  const a = aText.split('\n')
  const b = bText.split('\n')
  const m = a.length
  const n = b.length

  // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const aDiff = new Set<number>()
  const bDiff = new Set<number>()
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      aDiff.add(i + 1)
      i++
    } else {
      bDiff.add(j + 1)
      j++
    }
  }
  while (i < m) aDiff.add(++i)
  while (j < n) bDiff.add(++j)

  return { a: aDiff, b: bDiff }
}
