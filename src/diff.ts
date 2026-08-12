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

/** 一个连续的差异块（1-based，闭区间；区间为空时 end < start） */
export interface DiffBlock {
  leftStart: number
  leftEnd: number
  rightStart: number
  rightEnd: number
}

export interface DiffResult {
  /** 左侧需要高亮的行号集合 */
  leftLines: Set<number>
  /** 右侧需要高亮的行号集合 */
  rightLines: Set<number>
  /** 差异块列表，按出现顺序排列，用于上一个/下一个跳转 */
  blocks: DiffBlock[]
}

/**
 * 行级差异（基于 LCS）。单次遍历同时产出两侧高亮行号与差异块，
 * 供高亮显示与上一个/下一个跳转使用。
 */
export function computeLineDiff(aText: string, bText: string): DiffResult {
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

  const leftLines = new Set<number>()
  const rightLines = new Set<number>()
  const blocks: DiffBlock[] = []
  let cur: DiffBlock | null = null
  let i = 0
  let j = 0
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      if (cur) {
        blocks.push(cur)
        cur = null
      }
      i++
      j++
    } else {
      if (!cur) {
        cur = { leftStart: i + 1, leftEnd: i, rightStart: j + 1, rightEnd: j }
      }
      if (i < m && (j >= n || dp[i + 1][j] >= dp[i][j + 1])) {
        leftLines.add(i + 1)
        cur.leftEnd = i + 1
        i++
      } else {
        rightLines.add(j + 1)
        cur.rightEnd = j + 1
        j++
      }
    }
  }
  if (cur) blocks.push(cur)

  return { leftLines, rightLines, blocks }
}
