import { useCallback, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import * as J from './jsonUtils'
import { diffField, diffTheme, lineDiff, setDiffLines } from './diff'

type Status = { type: 'idle' | 'ok' | 'error'; text: string }

export default function App() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<Status>({
    type: 'idle',
    text: '就绪 · 在左侧粘贴 JSON，点击按钮处理（结果写入右侧，可继续叠加操作）',
  })
  const [indent, setIndent] = useState(2)
  const [wrap, setWrap] = useState(true)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const leftView = useRef<EditorView | null>(null)
  const rightView = useRef<EditorView | null>(null)

  const extensions = useMemo(
    () => [json(), diffField, diffTheme, ...(wrap ? [EditorView.lineWrapping] : [])],
    [wrap],
  )

  // 操作源：输出框有内容则基于输出框继续，否则取输入框（仅初始）；结果始终写回输出框
  const operate = useCallback(
    (label: string, fn: (t: string) => string) => {
      const src = output.trim() ? output : input
      if (!src.trim()) {
        setStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(src)
        setOutput(result)
        setRightCollapsed(false)
        setStatus({ type: 'ok', text: `✓ ${label}成功 · 输出 ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus({ type: 'error', text: `✗ ${label}失败：${msg}` })
      }
    },
    [input, output],
  )

  const doValidate = useCallback(() => {
    const src = output.trim() ? output : input
    const r = J.validate(src)
    if (r.ok) {
      setStatus({ type: 'ok', text: r.message })
    } else {
      const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
      setStatus({ type: 'error', text: `✗ ${r.message} ${pos}` })
    }
  }, [input, output])

  // 强制去除转义：一次去一层；无可去除时友好提示而非报错
  const doForceUnescape = useCallback(() => {
    const src = output.trim() ? output : input
    if (!src.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const { text, changed } = J.forceUnescape(src, indent)
      if (!changed) {
        setStatus({ type: 'idle', text: '已经无需去除转义' })
        return
      }
      setOutput(text)
      setRightCollapsed(false)
      setStatus({ type: 'ok', text: `✓ 强制去除转义成功 · 输出 ${text.length} 字符` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus({ type: 'error', text: `✗ 强制去除转义失败：${msg}` })
    }
  }, [input, output, indent])

  // 去除转义：无可去除时友好提示而非报错
  const doUnescape = useCallback(() => {
    const src = output.trim() ? output : input
    if (!src.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    const { text, changed } = J.unescape(src)
    if (!changed) {
      setStatus({ type: 'idle', text: '已经无需去除转义' })
      return
    }
    setOutput(text)
    setRightCollapsed(false)
    setStatus({ type: 'ok', text: `✓ 去除转义成功 · 输出 ${text.length} 字符` })
  }, [input, output])

  // 差异对比：先把两侧各自格式化（对齐格式），只比较实际内容差异
  const doDiff = useCallback(() => {
    if (!leftView.current || !rightView.current) return
    // 能解析就格式化；不能解析（如转义文本）则保持原文
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
    // 同一事务里替换全文 + 设置高亮：装饰基于新文档计算，不会被本次 docChange 清掉
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
      setStatus({ type: 'ok', text: '✓ 两侧内容一致（已忽略格式差异）' })
    } else {
      setStatus({
        type: 'ok',
        text: `已格式化并高亮差异：左 ${da.size} 行 / 右 ${db.size} 行（编辑任意一侧自动清除）`,
      })
    }
  }, [input, output, indent])

  const copyOutput = useCallback(async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setStatus({ type: 'ok', text: '✓ 已复制输出到剪贴板' })
    } catch {
      setStatus({ type: 'error', text: '✗ 复制失败，请手动选择' })
    }
  }, [output])

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-800">
      {/* 顶栏 + 工具栏 */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <h1 className="mr-2 flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="text-blue-600">{'{ }'}</span> JSON 工具
        </h1>

        <div className="flex flex-wrap items-center gap-1.5">
          <PrimaryBtn onClick={() => operate('格式化', (t) => J.format(t, indent))}>格式化</PrimaryBtn>
          <Btn onClick={() => operate('压缩', J.minify)}>压缩</Btn>
          <Btn onClick={() => operate('转义', J.escape)}>转义</Btn>
          <Btn onClick={doUnescape}>去除转义</Btn>
          <Btn onClick={doValidate}>校验</Btn>
          <Btn onClick={doDiff}>差异对比</Btn>
          <span className="flex items-center gap-1">
            <PrimaryBtn onClick={doForceUnescape}>强制去除转义</PrimaryBtn>
            <Help text="针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。" />
          </span>
        </div>

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
          <Btn
            onClick={() => {
              setInput('')
              setOutput('')
              setStatus({ type: 'idle', text: '已清空' })
            }}
          >
            清空
          </Btn>
        </div>
      </header>

      {/* 双栏编辑器（均可编辑、均可收起） */}
      <main className="flex min-h-0 flex-1 gap-2 p-2">
        <Pane
          side="left"
          title="输入（原始）"
          count={input.length}
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((c) => !c)}
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

        <Pane
          side="right"
          title="输出（工作区）"
          count={output.length}
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed((c) => !c)}
          actions={
            <MiniBtn onClick={copyOutput} disabled={!output}>
              复制
            </MiniBtn>
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

      {/* 状态栏 */}
      <footer
        className={
          'border-t px-4 py-1.5 text-sm ' +
          (status.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-700'
            : status.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-500')
        }
      >
        {status.text}
      </footer>
    </div>
  )
}

/* ---------- 小组件 ---------- */

function Pane({
  side,
  title,
  count,
  collapsed,
  onToggle,
  actions,
  children,
}: {
  side: 'left' | 'right'
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
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
        <span className="text-xs text-slate-500" style={{ writingMode: 'vertical-rl' }}>
          {title}（{count}）
        </span>
      </section>
    )
  }
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
        <span className="font-medium text-slate-600">{title}</span>
        <div className="flex items-center gap-2">
          <span>{count} 字符</span>
          {actions}
          <button
            onClick={onToggle}
            title="收起"
            className="text-slate-400 transition hover:text-slate-700"
          >
            {side === 'left' ? '«' : '»'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
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
