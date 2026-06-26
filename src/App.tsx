import { useCallback, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import * as J from './jsonUtils'
import { diffField, diffTheme, lineDiff, setDiffLines } from './diff'

type Status = { type: 'idle' | 'ok' | 'error'; text: string }

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
        setLeftStatus({ type: 'ok', text: `✓ ${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setLeftStatus({ type: 'error', text: `✗ ${label}失败：${msg}` })
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
      setLeftStatus({ type: 'error', text: `✗ ${r.message} ${pos}` })
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
    setLeftStatus({ type: 'ok', text: `✓ 去除转义成功 · ${text.length} 字符` })
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
      setLeftStatus({ type: 'ok', text: `✓ 强制去除转义成功 · ${text.length} 字符` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLeftStatus({ type: 'error', text: `✗ 强制去除转义失败：${msg}` })
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
        setRightStatus({ type: 'ok', text: `✓ ${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setRightStatus({ type: 'error', text: `✗ ${label}失败：${msg}` })
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
      setRightStatus({ type: 'error', text: `✗ ${r.message} ${pos}` })
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
    setRightStatus({ type: 'ok', text: `✓ 去除转义成功 · ${text.length} 字符` })
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
      setRightStatus({ type: 'ok', text: `✓ 强制去除转义成功 · ${text.length} 字符` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRightStatus({ type: 'error', text: `✗ 强制去除转义失败：${msg}` })
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
      const msg = '✓ 两侧内容一致（已忽略格式差异）'
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
      setRightStatus({ type: 'ok', text: '✓ 已复制到剪贴板' })
    } catch {
      setRightStatus({ type: 'error', text: '✗ 复制失败，请手动选择' })
    }
  }, [output])

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-800">
      {/* 顶部栏：差异对比 + 缩进 + 自动换行 */}
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
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
              <PrimaryBtn onClick={() => leftOperate('格式化', (t) => J.format(t, indent))}>
                格式化
              </PrimaryBtn>
              <Btn onClick={() => leftOperate('压缩', J.minify)}>压缩</Btn>
              <Btn onClick={() => leftOperate('转义', J.escape)}>转义</Btn>
              <Btn onClick={leftUnescape}>去除转义</Btn>
              <Btn onClick={leftValidate}>校验</Btn>
              <span className="flex items-center gap-1">
                <PrimaryBtn onClick={leftForceUnescape}>强制去除转义</PrimaryBtn>
                <Help text="针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。" />
              </span>
            </>
          }
        >
          <CodeMirror
            value={input}
            extensions={extensions}
            onChange={setInput}
            onCreateEditor={(v) => (leftView.current = v)}
            theme="light"
            placeholder="在此粘贴 JSON…"
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
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
              <PrimaryBtn onClick={() => rightOperate('格式化', (t) => J.format(t, indent))}>
                格式化
              </PrimaryBtn>
              <Btn onClick={() => rightOperate('压缩', J.minify)}>压缩</Btn>
              <Btn onClick={() => rightOperate('转义', J.escape)}>转义</Btn>
              <Btn onClick={rightUnescape}>去除转义</Btn>
              <Btn onClick={rightValidate}>校验</Btn>
              <span className="flex items-center gap-1">
                <PrimaryBtn onClick={rightForceUnescape}>强制去除转义</PrimaryBtn>
                <Help text="针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。" />
              </span>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <MiniBtn onClick={copyOutput} disabled={!output}>
                复制
              </MiniBtn>
            </>
          }
        >
          <CodeMirror
            value={output}
            extensions={extensions}
            onChange={setOutput}
            onCreateEditor={(v) => (rightView.current = v)}
            theme="light"
            placeholder="处理结果显示在这里，也可直接编辑/粘贴…"
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
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
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-1 text-xs">
        <span
          className={
            'truncate ' +
            (status.type === 'error'
              ? 'text-red-600'
              : status.type === 'ok'
                ? 'text-emerald-600'
                : 'text-slate-500')
          }
        >
          {status.text}
        </span>
        <span className="shrink-0 text-slate-500">{count} 字符</span>
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

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 active:bg-blue-800"
    >
      {children}
    </button>
  )
}

function MiniBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
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
