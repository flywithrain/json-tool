import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import * as J from './jsonUtils'
import { diffField, diffTheme, lineDiff, setDiffLines } from './diff'

type Status = { type: 'idle' | 'ok' | 'error'; text: string }

/** 富文本占位提示：空编辑器时显示快捷键提示 */
class TipWidget extends WidgetType {
  private lines: string[][]
  constructor(lines: string[][]) {
    super()
    this.lines = lines
  }
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'editor-tip'
    for (const parts of this.lines) {
      const row = document.createElement('div')
      row.className = 'tip-row'
      for (const part of parts) {
        if (part.startsWith('kbd:')) {
          const kbd = document.createElement('kbd')
          kbd.className = 'tip-kbd'
          kbd.textContent = part.slice(4)
          row.appendChild(kbd)
        } else {
          const span = document.createElement('span')
          span.textContent = part
          row.appendChild(span)
        }
      }
      wrap.appendChild(row)
    }
    return wrap
  }
  eq(other: TipWidget) {
    return JSON.stringify(this.lines) === JSON.stringify(other.lines)
  }
}

function createTipExtension(lines: string[][]) {
  const widget = Decoration.widget({ widget: new TipWidget(lines), side: 1 })
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations =
          view.state.doc.length === 0
            ? Decoration.set([widget.range(0)])
            : Decoration.set([])
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations =
            update.view.state.doc.length === 0
              ? Decoration.set([widget.range(0)])
              : Decoration.set([])
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}

const editorTip = createTipExtension([
  ['粘贴 JSON 或任意文本，使用上方工具栏进行处理'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

export default function App() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [leftStatus, setLeftStatus] = useState<Status>({ type: 'idle', text: '' })
  const [rightStatus, setRightStatus] = useState<Status>({ type: 'idle', text: '' })
  const [indent, setIndent] = useState(2)
  const [wrap, setWrap] = useState(true)
  const [syncScroll, setSyncScroll] = useState(true)
  const [autoFormat, setAutoFormat] = useState(true)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(true)

  const leftView = useRef<EditorView | null>(null)
  const rightView = useRef<EditorView | null>(null)
  const isSyncingScroll = useRef(false)
  const unbindScrollSync = useRef<(() => void) | null>(null)
  const justPastedLeft = useRef(false)
  const justPastedRight = useRef(false)

  const bindScrollSync = useCallback(() => {
    if (unbindScrollSync.current) {
      unbindScrollSync.current()
      unbindScrollSync.current = null
    }
    const leftEditor = leftView.current
    const rightEditor = rightView.current
    if (!syncScroll || !leftEditor || !rightEditor) return

    const leftScrollDOM = leftEditor.scrollDOM
    const rightScrollDOM = rightEditor.scrollDOM

    const handleLeftScroll = () => {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      rightScrollDOM.scrollTop = leftScrollDOM.scrollTop
      rightScrollDOM.scrollLeft = leftScrollDOM.scrollLeft
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }

    const handleRightScroll = () => {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      leftScrollDOM.scrollTop = rightScrollDOM.scrollTop
      leftScrollDOM.scrollLeft = rightScrollDOM.scrollLeft
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }

    leftScrollDOM.addEventListener('scroll', handleLeftScroll, { passive: true })
    rightScrollDOM.addEventListener('scroll', handleRightScroll, { passive: true })

    unbindScrollSync.current = () => {
      leftScrollDOM.removeEventListener('scroll', handleLeftScroll)
      rightScrollDOM.removeEventListener('scroll', handleRightScroll)
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

  const onLeftEditorCreate = useCallback((v: EditorView) => {
    leftView.current = v
    setTimeout(bindScrollSync, 0)
  }, [bindScrollSync])

  const onRightEditorCreate = useCallback((v: EditorView) => {
    rightView.current = v
    setTimeout(bindScrollSync, 0)
  }, [bindScrollSync])

  const extensions = useMemo(
    () => [json(), diffField, diffTheme, ...(wrap ? [EditorView.lineWrapping] : [])],
    [wrap],
  )

  // ── 粘贴时自动格式化/校验 ──

  const formatOrValidate = useCallback(
    (value: string): { value: string; status: Status } => {
      try {
        const result = J.format(value, indent)
        return { value: result, status: { type: 'ok', text: `格式化成功 · ${result.length} 字符` } }
      } catch {
        const r = J.validate(value)
        const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
        return { value, status: { type: 'error', text: `${r.message} ${pos}` } }
      }
    },
    [indent],
  )

  const handleLeftChange = useCallback(
    (value: string) => {
      setInput(value)
      if (autoFormat && justPastedLeft.current) {
        justPastedLeft.current = false
        if (value.trim()) {
          const result = formatOrValidate(value)
          setInput(result.value)
          setLeftStatus(result.status)
        }
      }
    },
    [autoFormat, formatOrValidate],
  )

  const handleRightChange = useCallback(
    (value: string) => {
      setOutput(value)
      if (autoFormat && justPastedRight.current) {
        justPastedRight.current = false
        if (value.trim()) {
          const result = formatOrValidate(value)
          setOutput(result.value)
          setRightStatus(result.status)
        }
      }
    },
    [autoFormat, formatOrValidate],
  )

  // ── 左侧操作：基于左侧内容，结果写回左侧 ──

  const leftOperate = useCallback(
    (label: string, fn: (t: string) => string) => {
      if (!input.trim()) {
        setLeftStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(input)
        setInput(result)
        setLeftStatus({ type: 'ok', text: `${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setLeftStatus({ type: 'error', text: `${label}失败：${msg}` })
      }
    },
    [input],
  )

  const leftFormatValidate = useCallback(() => {
    if (!input.trim()) {
      setLeftStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const result = J.format(input, indent)
      setInput(result)
      setLeftStatus({ type: 'ok', text: `格式化成功 · ${result.length} 字符` })
    } catch {
      const r = J.validate(input)
      const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
      setLeftStatus({ type: 'error', text: `${r.message} ${pos}` })
    }
  }, [input, indent])

  const leftUnescape = useCallback(() => {
    if (!input.trim()) {
      setLeftStatus({ type: 'error', text: '内容为空' })
      return
    }
    const { text, changed } = J.unescape(input)
    if (!changed) {
      setLeftStatus({ type: 'idle', text: '已经无需去除转义' })
      return
    }
    setInput(text)
    setLeftStatus({ type: 'ok', text: `去除转义成功 · ${text.length} 字符` })
  }, [input])

  const leftForceUnescape = useCallback(() => {
    if (!input.trim()) {
      setLeftStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const { text, changed } = J.forceUnescape(input, indent)
      if (!changed) {
        setLeftStatus({ type: 'idle', text: '已经无需去除转义' })
        return
      }
      setInput(text)
      setLeftStatus({ type: 'ok', text: `强制去除转义成功 · ${text.length} 字符` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLeftStatus({ type: 'error', text: `强制去除转义失败：${msg}` })
    }
  }, [input, indent])

  // ── 右侧操作：基于右侧内容，结果写回右侧 ──

  const rightOperate = useCallback(
    (label: string, fn: (t: string) => string) => {
      if (!output.trim()) {
        setRightStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(output)
        setOutput(result)
        setRightStatus({ type: 'ok', text: `${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setRightStatus({ type: 'error', text: `${label}失败：${msg}` })
      }
    },
    [output],
  )

  const rightFormatValidate = useCallback(() => {
    if (!output.trim()) {
      setRightStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const result = J.format(output, indent)
      setOutput(result)
      setRightStatus({ type: 'ok', text: `格式化成功 · ${result.length} 字符` })
    } catch {
      const r = J.validate(output)
      const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
      setRightStatus({ type: 'error', text: `${r.message} ${pos}` })
    }
  }, [output, indent])

  const rightUnescape = useCallback(() => {
    if (!output.trim()) {
      setRightStatus({ type: 'error', text: '内容为空' })
      return
    }
    const { text, changed } = J.unescape(output)
    if (!changed) {
      setRightStatus({ type: 'idle', text: '已经无需去除转义' })
      return
    }
    setOutput(text)
    setRightStatus({ type: 'ok', text: `去除转义成功 · ${text.length} 字符` })
  }, [output])

  const rightForceUnescape = useCallback(() => {
    if (!output.trim()) {
      setRightStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const { text, changed } = J.forceUnescape(output, indent)
      if (!changed) {
        setRightStatus({ type: 'idle', text: '已经无需去除转义' })
        return
      }
      setOutput(text)
      setRightStatus({ type: 'ok', text: `强制去除转义成功 · ${text.length} 字符` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRightStatus({ type: 'error', text: `强制去除转义失败：${msg}` })
    }
  }, [output, indent])

  // ── 差异对比 ──

  const doDiff = useCallback(() => {
    // 先展开两侧面板，确保 CodeMirror 实例被创建
    setLeftCollapsed(false)
    setRightCollapsed(false)
    // 等待 React 渲染完成、编辑器视图创建后再执行差异对比
    setTimeout(() => {
      if (!leftView.current || !rightView.current) return
      let a = input
      let b = output
      try { a = J.format(input, indent) } catch { /* 保持原文 */ }
      try { b = J.format(output, indent) } catch { /* 保持原文 */ }
      const { a: da, b: db } = lineDiff(a, b)
      leftView.current.dispatch({
        changes: { from: 0, to: leftView.current.state.doc.length, insert: a },
        effects: setDiffLines.of(da),
      })
      rightView.current.dispatch({
        changes: { from: 0, to: rightView.current.state.doc.length, insert: b },
        effects: setDiffLines.of(db),
      })
      const total = da.size + db.size
      if (total === 0) {
        const msg = '两侧内容一致（已忽略格式差异）'
        setLeftStatus({ type: 'ok', text: msg })
        setRightStatus({ type: 'ok', text: msg })
      } else {
        const msg = `已格式化并高亮差异：左 ${da.size} 行 / 右 ${db.size} 行（编辑任意一侧自动清除）`
        setLeftStatus({ type: 'ok', text: msg })
        setRightStatus({ type: 'ok', text: msg })
      }
    }, 0)
  }, [input, output, indent])

  const helpText = '针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。'

  const leftPasteHandler = useMemo(
    () =>
      EditorView.domEventHandlers({
        paste: () => {
          justPastedLeft.current = true
        },
      }),
    [],
  )
  const rightPasteHandler = useMemo(
    () =>
      EditorView.domEventHandlers({
        paste: () => {
          justPastedRight.current = true
        },
      }),
    [],
  )

  const leftExtensions = useMemo(() => [...extensions, editorTip, leftPasteHandler], [extensions, leftPasteHandler])
  const rightExtensions = useMemo(() => [...extensions, editorTip, rightPasteHandler], [extensions, rightPasteHandler])

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-800">
      {/* 顶部栏：标题 + 差异对比 + 缩进 + 自动换行 */}
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <h1 className="mr-2 flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="text-blue-600">{'{ }'}</span> JSON 工具
        </h1>
        <Btn onClick={doDiff}>差异对比</Btn>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="text-xs">缩进</span>
            <select
              value={indent}
              onChange={(e) => setIndent(Number(e.target.value))}
              className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600 outline-none transition hover:border-slate-300 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </div>
          <Switch checked={autoFormat} onChange={setAutoFormat} label="粘贴格式化" />
          <Switch checked={syncScroll} onChange={setSyncScroll} label="同步滚动" />
          <Switch checked={wrap} onChange={setWrap} label="自动换行" />
        </div>
      </header>

      {/* 双栏编辑器 */}
      <main className="flex min-h-0 flex-1 gap-2 p-2">
        {/* 左侧输入框 */}
        <Pane
          side="left"
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((c) => !c)}
          status={leftStatus}
          count={input.length}
          toolbar={
            <>
              <ToolBtn onClick={leftFormatValidate}>格式化/校验</ToolBtn>
              <ToolBtn onClick={() => leftOperate('压缩', J.minify)}>压缩</ToolBtn>
              <ToolBtn onClick={() => leftOperate('转义', J.escape)}>转义</ToolBtn>
              <ToolBtn onClick={leftUnescape}>去除转义</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-indigo-100" />
              <ToolBtn onClick={leftForceUnescape} helpText={helpText}>强制去除转义</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-indigo-100" />
              <ToolBtn onClick={() => leftOperate('URL 解码', J.urlDecode)}>URL Decode</ToolBtn>
              <ToolBtn onClick={() => leftOperate('URL 编码', J.urlEncode)}>URL Encode</ToolBtn>
              <ToolBtn onClick={() => leftOperate('Base64 解码', J.base64Decode)}>B64 Decode</ToolBtn>
              <ToolBtn onClick={() => leftOperate('Base64 编码', J.base64Encode)}>B64 Encode</ToolBtn>
            </>
          }
        >
          <CodeMirror
            value={input}
            extensions={leftExtensions}
            onChange={handleLeftChange}
            onCreateEditor={onLeftEditorCreate}
            theme="light"
            basicSetup={true}
            height="100%"
            className="h-full"
          />
        </Pane>

        {/* 右侧输入框 */}
        <Pane
          side="right"
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed((c) => !c)}
          status={rightStatus}
          count={output.length}
          toolbar={
            <>
              <ToolBtn onClick={rightFormatValidate}>格式化/校验</ToolBtn>
              <ToolBtn onClick={() => rightOperate('压缩', J.minify)}>压缩</ToolBtn>
              <ToolBtn onClick={() => rightOperate('转义', J.escape)}>转义</ToolBtn>
              <ToolBtn onClick={rightUnescape}>去除转义</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-indigo-100" />
              <ToolBtn onClick={rightForceUnescape} helpText={helpText}>强制去除转义</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-indigo-100" />
              <ToolBtn onClick={() => rightOperate('URL 解码', J.urlDecode)}>URL Decode</ToolBtn>
              <ToolBtn onClick={() => rightOperate('URL 编码', J.urlEncode)}>URL Encode</ToolBtn>
              <ToolBtn onClick={() => rightOperate('Base64 解码', J.base64Decode)}>B64 Decode</ToolBtn>
              <ToolBtn onClick={() => rightOperate('Base64 编码', J.base64Encode)}>B64 Encode</ToolBtn>
            </>
          }
        >
          <CodeMirror
            value={output}
            extensions={rightExtensions}
            onChange={handleRightChange}
            onCreateEditor={onRightEditorCreate}
            theme="light"
            basicSetup={true}
            height="100%"
            className="h-full"
          />
        </Pane>
      </main>
    </div>
  )
}

/* ---------- 小组件 ---------- */

/** 可水平滚动的工具栏，两端带渐变指示 */
function ScrollableToolbar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const check = useCallback(() => {
    const el = ref.current
    if (!el) return
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [check])

  return (
    <div className="relative min-w-0 flex-1">
      {!atStart && (
        <button
          onClick={() => ref.current?.scrollBy({ left: -150, behavior: 'smooth' })}
          className="absolute left-0 top-0 bottom-0 z-10 flex w-6 cursor-pointer items-center justify-center bg-gradient-to-r from-slate-50 via-slate-50/80 to-transparent text-slate-400 transition hover:text-slate-600"
        >
          ‹
        </button>
      )}
      <div
        ref={ref}
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-hide"
        style={{ paddingLeft: atStart ? 12 : 28, paddingRight: atEnd ? 12 : 28 }}
      >
        {children}
      </div>
      {!atEnd && (
        <button
          onClick={() => ref.current?.scrollBy({ left: 150, behavior: 'smooth' })}
          className="absolute right-0 top-0 bottom-0 z-10 flex w-6 cursor-pointer items-center justify-center bg-gradient-to-l from-slate-50 via-slate-50/80 to-transparent text-slate-400 transition hover:text-slate-600"
        >
          ›
        </button>
      )}
    </div>
  )
}

/** 折叠/展开按钮 SVG 图标 */
function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 6 9 12 15 18" />
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function Pane({
  side,
  collapsed,
  onToggle,
  status,
  count,
  toolbar,
  children,
}: {
  side: 'left' | 'right'
  collapsed: boolean
  onToggle: () => void
  status: Status
  count: number
  toolbar: React.ReactNode
  children: React.ReactNode
}) {
  if (collapsed) {
    return (
      <div className="flex w-6 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button
          onClick={onToggle}
          title="展开面板"
          className="group flex w-full cursor-pointer flex-col items-center justify-center text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-500"
        >
          <span className="flex h-16 items-center">{side === 'left' ? <ChevronRight /> : <ChevronLeft />}</span>
        </button>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* 右侧面板：折叠条在最左侧 */}
      {side === 'right' && (
        <button
          onClick={onToggle}
          title="收起面板"
          className="group flex w-5 shrink-0 cursor-pointer flex-col items-center justify-center border-r border-slate-100 bg-slate-50/50 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-500"
        >
          <ChevronRight />
        </button>
      )}

      {/* 主内容区 */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center border-b border-slate-100 bg-slate-50">
          <ScrollableToolbar>{toolbar}</ScrollableToolbar>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-1 text-[11px]">
          <span
            className={
              'flex items-center gap-1 truncate ' +
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
          <span className="shrink-0 tabular-nums text-slate-400">{count.toLocaleString()} chars</span>
        </div>
      </section>

      {/* 左侧面板：折叠条在最右侧 */}
      {side === 'left' && (
        <button
          onClick={onToggle}
          title="收起面板"
          className="group flex w-5 shrink-0 cursor-pointer flex-col items-center justify-center border-l border-slate-100 bg-slate-50/50 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-500"
        >
          <ChevronLeft />
        </button>
      )}
    </div>
  )
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100"
    >
      {children}
    </button>
  )
}

/** 统一的工具栏按钮：小尺寸、紧凑风格，可选右上角帮助徽标 */
function ToolBtn({
  onClick,
  disabled,
  helpText,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  helpText?: string
  children: React.ReactNode
}) {
  const cls =
    'relative rounded px-2 py-0.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 shrink-0 ' +
    'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 active:bg-indigo-100/50'
  return (
    <button onClick={onClick} disabled={disabled} className={`${cls} group`}>
      {children}
      {helpText && (
        <span
          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] leading-none text-slate-500 opacity-60 transition group-hover:opacity-100 group-hover:bg-indigo-100 group-hover:text-indigo-600"
          title={helpText}
        >
          ?
        </span>
      )}
    </button>
  )
}

/** 开关组件 */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-slate-600"
    >
      <span>{label}</span>
      <span
        className={
          'relative h-5 w-9 rounded-full transition ' + (checked ? 'bg-blue-600' : 'bg-slate-300')
        }
      >
        <span
          className={
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ' +
            (checked ? 'left-[18px]' : 'left-0.5')
          }
        />
      </span>
    </button>
  )
}

