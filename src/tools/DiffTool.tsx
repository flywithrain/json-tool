import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { diffField, diffTheme, setDiffLines, computeLineDiff, type DiffBlock } from '../diff'
import { useStore } from '../store'
import { useCursorInfo, CursorInfoView, type Status, type CursorInfo } from '../components/Workspace'
import { Btn, Switch, createTipExtension } from '../components/widgets'

const editorTip = createTipExtension([
  ['左侧粘贴原始内容，右侧粘贴待比较内容，点击「对比」高亮差异'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

export function DiffTool() {
  const { diffLeft, setDiffLeft, diffRight, setDiffRight } = useStore()
  const [leftStatus, setLeftStatus] = useState<Status>({ type: 'idle', text: '' })
  const [rightStatus, setRightStatus] = useState<Status>({ type: 'idle', text: '' })
  const [syncScroll, setSyncScroll] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [blocks, setBlocks] = useState<DiffBlock[]>([])
  const [blockIndex, setBlockIndex] = useState(-1)
  const [leftCursor, onLeftUpdate] = useCursorInfo()
  const [rightCursor, onRightUpdate] = useCursorInfo()

  const leftView = useRef<EditorView | null>(null)
  const rightView = useRef<EditorView | null>(null)
  const isSyncingScroll = useRef(false)
  const unbindScrollSync = useRef<(() => void) | null>(null)
  const didAutoDiff = useRef(false)

  // ── 同步滚动 ──
  const bindScrollSync = useCallback(() => {
    if (unbindScrollSync.current) {
      unbindScrollSync.current()
      unbindScrollSync.current = null
    }
    const a = leftView.current
    const b = rightView.current
    if (!syncScroll || !a || !b) return

    const aDom = a.scrollDOM
    const bDom = b.scrollDOM

    const onA = () => {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      bDom.scrollTop = aDom.scrollTop
      bDom.scrollLeft = aDom.scrollLeft
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }
    const onB = () => {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      aDom.scrollTop = bDom.scrollTop
      aDom.scrollLeft = bDom.scrollLeft
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }

    aDom.addEventListener('scroll', onA, { passive: true })
    bDom.addEventListener('scroll', onB, { passive: true })
    unbindScrollSync.current = () => {
      aDom.removeEventListener('scroll', onA)
      bDom.removeEventListener('scroll', onB)
    }
  }, [syncScroll])

  useEffect(() => {
    bindScrollSync()
    return () => {
      if (unbindScrollSync.current) {
        unbindScrollSync.current()
        unbindScrollSync.current = null
      }
    }
  }, [bindScrollSync])

  const onLeftCreate = useCallback(
    (v: EditorView) => {
      leftView.current = v
      setTimeout(bindScrollSync, 0)
    },
    [bindScrollSync],
  )
  const onRightCreate = useCallback(
    (v: EditorView) => {
      rightView.current = v
      setTimeout(bindScrollSync, 0)
    },
    [bindScrollSync],
  )

  const extensions = useMemo(
    () => [diffField, diffTheme, ...(wrap ? [EditorView.lineWrapping] : [])],
    [wrap],
  )
  const leftExtensions = useMemo(() => [...extensions, editorTip], [extensions])
  const rightExtensions = useMemo(() => [...extensions, editorTip], [extensions])

  // ── 计算差异 ──
  const computeDiff = useCallback(() => {
    const a = leftView.current?.state.doc.toString() ?? diffLeft
    const b = rightView.current?.state.doc.toString() ?? diffRight
    if (!a.trim() && !b.trim()) {
      setLeftStatus({ type: 'error', text: '两侧内容均为空' })
      setRightStatus({ type: 'error', text: '两侧内容均为空' })
      return
    }
    const { leftLines, rightLines, blocks: blks } = computeLineDiff(a, b)
    leftView.current?.dispatch({ effects: setDiffLines.of(leftLines) })
    rightView.current?.dispatch({ effects: setDiffLines.of(rightLines) })
    setBlocks(blks)
    setBlockIndex(blks.length > 0 ? 0 : -1)
    if (blks.length === 0) {
      const msg = '两侧内容一致'
      setLeftStatus({ type: 'ok', text: msg })
      setRightStatus({ type: 'ok', text: msg })
    } else {
      const msg = `共 ${blks.length} 处差异`
      setLeftStatus({ type: 'ok', text: msg })
      setRightStatus({ type: 'ok', text: msg })
    }
  }, [diffLeft, diffRight])

  // ── 跳转到指定差异块 ──
  const gotoBlock = useCallback((idx: number) => {
    if (idx < 0 || idx >= blocks.length) return
    setBlockIndex(idx)
    const block = blocks[idx]
    if (leftView.current && block.leftEnd >= block.leftStart) {
      const line = leftView.current.state.doc.line(block.leftStart)
      leftView.current.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      })
    }
    if (rightView.current && block.rightEnd >= block.rightStart) {
      const line = rightView.current.state.doc.line(block.rightStart)
      rightView.current.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      })
    }
  }, [blocks])

  const prev = useCallback(() => {
    if (blocks.length === 0) return
    gotoBlock(blockIndex <= 0 ? blocks.length - 1 : blockIndex - 1)
  }, [blocks.length, blockIndex, gotoBlock])

  const next = useCallback(() => {
    if (blocks.length === 0) return
    gotoBlock(blockIndex >= blocks.length - 1 ? 0 : blockIndex + 1)
  }, [blocks.length, blockIndex, gotoBlock])

  // ── 进入页签时若两侧都有内容则自动对比一次 ──
  useEffect(() => {
    if (didAutoDiff.current) return
    if (diffLeft.trim() && diffRight.trim() && leftView.current && rightView.current) {
      didAutoDiff.current = true
      const id = setTimeout(computeDiff, 30)
      return () => clearTimeout(id)
    }
  }, [diffLeft, diffRight, computeDiff])

  // ── 编辑即清除旧的差异块（高亮会由 diffField 自动清除） ──
  const clearBlocks = useCallback(() => {
    if (blocks.length > 0) {
      setBlocks([])
      setBlockIndex(-1)
    }
  }, [blocks.length])

  const handleLeftChange = useCallback(
    (value: string) => {
      setDiffLeft(value)
      clearBlocks()
    },
    [setDiffLeft, clearBlocks],
  )
  const handleRightChange = useCallback(
    (value: string) => {
      setDiffRight(value)
      clearBlocks()
    },
    [setDiffRight, clearBlocks],
  )

  const posText = blocks.length > 0 ? `${blockIndex + 1} / ${blocks.length}` : '0 / 0'

  return (
    <>
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <Btn onClick={computeDiff}>对比</Btn>
        <span className="h-5 w-px bg-slate-200" />
        <Btn onClick={prev}>↑ 上一个</Btn>
        <Btn onClick={next}>↓ 下一个</Btn>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold tabular-nums text-slate-600">
          {posText}
        </span>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Switch checked={wrap} onChange={setWrap} label="自动换行" />
          <Switch checked={syncScroll} onChange={setSyncScroll} label="同步滚动" />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-2 p-2">
        <DiffPane label="原始" status={leftStatus} count={diffLeft.length} cursorInfo={leftCursor}>
          <CodeMirror
            value={diffLeft}
            extensions={leftExtensions}
            onChange={handleLeftChange}
            onCreateEditor={onLeftCreate}
            onUpdate={onLeftUpdate}
            theme="light"
            basicSetup={true}
            height="100%"
            className="h-full"
          />
        </DiffPane>
        <DiffPane label="待比较" status={rightStatus} count={diffRight.length} cursorInfo={rightCursor}>
          <CodeMirror
            value={diffRight}
            extensions={rightExtensions}
            onChange={handleRightChange}
            onCreateEditor={onRightCreate}
            onUpdate={onRightUpdate}
            theme="light"
            basicSetup={true}
            height="100%"
            className="h-full"
          />
        </DiffPane>
      </main>
    </>
  )
}

/** 差异对比页签的单侧面板：顶部标签 + 编辑器 + 底部状态 */
function DiffPane({
  label,
  status,
  count,
  cursorInfo,
  children,
}: {
  label: string
  status: Status
  count: number
  cursorInfo: CursorInfo
  children: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
        {label}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-1 text-[11px]">
        <span
          className={
            'flex min-w-0 items-center gap-1 ' +
            (status.type === 'error'
              ? 'text-red-500'
              : status.type === 'ok'
                ? 'text-emerald-500'
                : 'text-slate-400')
          }
        >
          {status.type === 'error' && <span className="font-bold">✗</span>}
          {status.type === 'ok' && <span className="font-bold">✓</span>}
          <span className="truncate">{status.text}</span>
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <CursorInfoView info={cursorInfo} />
          <span className="tabular-nums text-slate-400">{count.toLocaleString()} chars</span>
        </div>
      </div>
    </section>
  )
}
