import { useCallback, useMemo, useRef, useState } from 'react'
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
        this.decorations = view.state.doc.length === 0
          ? Decoration.set([widget.range(0)])
          : Decoration.set([])
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = update.view.state.doc.length === 0
            ? Decoration.set([widget.range(0)])
            : Decoration.set([])
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}

const leftTip = createTipExtension([
  ['粘贴 JSON 或任意文本，使用上方工具栏进行处理'],
  [],
  ['kbd:Ctrl+Z', ' 撤销　', 'kbd:Ctrl+Y', ' 重做　', 'kbd:Ctrl+F', ' 搜索'],
])

const rightTip = createTipExtension([
  ['处理结果将显示在此，也可直接编辑或粘贴'],
  [],
  ['kbd:Ctrl+Z', ' 撤销　', 'kbd:Ctrl+Y', ' 重做　', 'kbd:Ctrl+F', ' 搜索'],
])

export default function App() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [leftStatus, setLeftStatus] = useState<Status>({ type: 'idle', text: '' })
  const [rightStatus, setRightStatus] = useState<Status>({ type: 'idle', text: '' })
  const [indent, setIndent] = useState(2)
  const [wrap, setWrap] = useState(true)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(true)

  const leftView = useRef<EditorView | null>(null)
  const rightView = useRef<EditorView | null>(null)

  const extensions = useMemo(
    () => [json(), diffField, diffTheme, ...(wrap ? [EditorView.lineWrapping] : [])],
    [wrap],
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

  const leftValidate = useCallback(() => {
    const r = J.validate(input)
    if (r.ok) {
      setLeftStatus({ type: 'ok', text: r.message })
    } else {
      const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
      setLeftStatus({ type: 'error', text: `${r.message} ${pos}` })
    }
  }, [input])

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

  const rightValidate = useCallback(() => {
    const r = J.validate(output)
    if (r.ok) {
      setRightStatus({ type: 'ok', text: r.message })
    } else {
      const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
      setRightStatus({ type: 'error', text: `${r.message} ${pos}` })
    }
  }, [output])

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

  // ── 差异对比：先把两侧各自格式化，只比较实际内容差异 ──

  const doDiff = useCallback(() => {
    if (!leftView.current || !rightView.current) return
    let a = input
    let b = output
    try {
      a = J.format(input, indent)
    } catch {
      /* 保持原文 */
    }
    try {
      b = J.format(output, indent)
    } catch {
      /* 保持原文 */
    }
    const { a: da, b: db } = lineDiff(a, b)
    leftView.current.dispatch({
      changes: { from: 0, to: leftView.current.state.doc.length, insert: a },
      effects: setDiffLines.of(da),
    })
    rightView.current.dispatch({
      changes: { from: 0, to: rightView.current.state.doc.length, insert: b },
      effects: setDiffLines.of(db),
    })
    setLeftCollapsed(false)
    setRightCollapsed(false)
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
  }, [input, output, indent])

  // ── 复制 ──

  const copyOutput = useCallback(async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setRightStatus({ type: 'ok', text: '已复制到剪贴板' })
    } catch {
      setRightStatus({ type: 'error', text: '复制失败，请手动选择' })
    }
  }, [output])

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
            <span>缩进</span>
            <Segmented
              value={indent}
              onChange={setIndent}
              options={[
                { label: '2 空格', value: 2 },
                { label: '4 空格', value: 4 },
              ]}
            />
          </div>
          <Switch checked={wrap} onChange={setWrap} label="自动换行" />
        </div>
      </header>

      {/* 双栏编辑器（均可编辑、均可收起） */}
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
              <ToolBtn primary onClick={() => leftOperate('格式化', (t) => J.format(t, indent))}>
                格式化
              </ToolBtn>
              <ToolBtn onClick={() => leftOperate('压缩', J.minify)}>压缩</ToolBtn>
              <ToolBtn onClick={() => leftOperate('转义', J.escape)}>转义</ToolBtn>
              <ToolBtn onClick={leftUnescape}>去除转义</ToolBtn>
              <ToolBtn onClick={leftValidate}>校验</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
              <span className="flex items-center gap-0.5">
                <ToolBtn primary onClick={leftForceUnescape}>强制去除转义</ToolBtn>
                <Help text="针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。" />
              </span>
              <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
              <ToolBtn onClick={() => leftOperate('URL 编码', J.urlEncode)}>URL Encode</ToolBtn>
              <ToolBtn onClick={() => leftOperate('URL 解码', J.urlDecode)}>URL Decode</ToolBtn>
              <ToolBtn onClick={() => leftOperate('Base64 编码', J.base64Encode)}>B64 Encode</ToolBtn>
              <ToolBtn onClick={() => leftOperate('Base64 解码', J.base64Decode)}>B64 Decode</ToolBtn>
            </>
          }
        >
          <CodeMirror
            value={input}
            extensions={useMemo(() => [...extensions, leftTip], [extensions])}
            onChange={setInput}
            onCreateEditor={(v) => (leftView.current = v)}
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
              <ToolBtn primary onClick={() => rightOperate('格式化', (t) => J.format(t, indent))}>
                格式化
              </ToolBtn>
              <ToolBtn onClick={() => rightOperate('压缩', J.minify)}>压缩</ToolBtn>
              <ToolBtn onClick={() => rightOperate('转义', J.escape)}>转义</ToolBtn>
              <ToolBtn onClick={rightUnescape}>去除转义</ToolBtn>
              <ToolBtn onClick={rightValidate}>校验</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
              <span className="flex items-center gap-0.5">
                <ToolBtn primary onClick={rightForceUnescape}>强制去除转义</ToolBtn>
                <Help text="针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。" />
              </span>
              <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
              <ToolBtn onClick={() => rightOperate('URL 编码', J.urlEncode)}>URL Encode</ToolBtn>
              <ToolBtn onClick={() => rightOperate('URL 解码', J.urlDecode)}>URL Decode</ToolBtn>
              <ToolBtn onClick={() => rightOperate('Base64 编码', J.base64Encode)}>B64 Encode</ToolBtn>
              <ToolBtn onClick={() => rightOperate('Base64 解码', J.base64Decode)}>B64 Decode</ToolBtn>
              <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
              <ToolBtn onClick={copyOutput} disabled={!output}>
                复制
              </ToolBtn>
            </>
          }
        >
          <CodeMirror
            value={output}
            extensions={useMemo(() => [...extensions, rightTip], [extensions])}
            onChange={setOutput}
            onCreateEditor={(v) => (rightView.current = v)}
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
      <section className="flex w-9 shrink-0 flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white py-2">
        <button
          onClick={onToggle}
          title="展开"
          className="text-slate-400 transition hover:text-slate-700"
        >
          {side === 'left' ? '»' : '«'}
        </button>
      </section>
    )
  }
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        {toolbar}
        <button
          onClick={onToggle}
          title="收起"
          className="ml-auto shrink-0 text-slate-400 transition hover:text-slate-700"
        >
          {side === 'left' ? '«' : '»'}
        </button>
      </div>
      {/* 编辑器 */}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {/* 底部信息栏：左侧状态，右侧字符统计 */}
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

/** 统一的工具栏按钮：小尺寸、紧凑风格 */
function ToolBtn({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: React.ReactNode
}) {
  const base =
    'rounded px-2 py-0.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40'
  const style = primary
    ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  )
}

/** 悬浮帮助图标 */
function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 text-xs text-slate-400 transition group-hover:border-blue-400 group-hover:text-blue-500">
        ?
      </span>
      <span className="invisible absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-md bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
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

/** 分段选择组件 */
function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { label: string; value: T }[]
}) {
  return (
    <span className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'rounded px-2.5 py-1 text-sm transition ' +
            (value === o.value
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700')
          }
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}
