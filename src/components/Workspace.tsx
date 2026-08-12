import { useState, useRef, useCallback, type ReactNode } from 'react'
import type { ViewUpdate } from '@codemirror/view'

export type Status = { type: 'idle' | 'ok' | 'error'; text: string }

/** 光标位置与选区信息（仿 Notepad++ 状态栏） */
export interface CursorInfo {
  line: number
  col: number
  pos: number
  selLen: number
  selLines: number
}

const EMPTY_CURSOR: CursorInfo = { line: 1, col: 1, pos: 1, selLen: 0, selLines: 0 }

/**
 * 跟踪 CodeMirror 光标位置与选区，返回当前信息与一个稳定的 onUpdate 回调，
 * 供 <CodeMirror onUpdate={...} /> 使用。仅在位置/选区变化时触发重渲染。
 */
export function useCursorInfo(): [CursorInfo, (vu: ViewUpdate) => void] {
  const [info, setInfo] = useState<CursorInfo>(EMPTY_CURSOR)
  const last = useRef<CursorInfo>(EMPTY_CURSOR)
  const onUpdate = useCallback((vu: ViewUpdate) => {
    const s = vu.state.selection.main
    const lineObj = vu.state.doc.lineAt(s.head)
    const selLen = Math.abs(s.to - s.from)
    const next: CursorInfo = {
      line: lineObj.number,
      col: s.head - lineObj.from + 1,
      pos: s.head + 1,
      selLen,
      selLines: 0,
    }
    if (selLen > 0) {
      const a = vu.state.doc.lineAt(Math.min(s.from, s.to))
      const b = vu.state.doc.lineAt(Math.max(s.from, s.to))
      next.selLines = b.number - a.number + 1
    }
    const l = last.current
    if (l.line !== next.line || l.col !== next.col || l.pos !== next.pos || l.selLen !== next.selLen || l.selLines !== next.selLines) {
      last.current = next
      setInfo(next)
    }
  }, [])
  return [info, onUpdate]
}

/**
 * 状态栏光标信息展示（仿 Notepad++）：
 * - 未选中：Ln: 行  Col: 列  Pos: 文档绝对位置
 * - 已选中：Ln: 行  Col: 列  Sel: 选长|选行
 */
export function CursorInfoView({ info }: { info: CursorInfo }) {
  return (
    <span className="tabular-nums text-slate-400">
      Ln: {info.line} Col: {info.col} {info.selLen > 0 ? `Sel: ${info.selLen}|${info.selLines}` : `Pos: ${info.pos}`}
    </span>
  )
}

/**
 * 左右结构工作区：左侧垂直工具栏 + 右侧主体（编辑器 + 底部状态栏）。
 * JSON / XML / 编解码 页签共用此布局。
 */
export function Workspace({
  sidebar,
  status,
  count,
  cursorInfo,
  children,
}: {
  sidebar: ReactNode
  status: Status
  count: number
  cursorInfo: CursorInfo
  children: ReactNode
}) {
  return (
    <main className="flex min-h-0 flex-1 gap-2 p-2">
      <aside className="flex w-48 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5">
        {sidebar}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
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
    </main>
  )
}

/** 侧边栏按钮：全宽、可选右上角帮助徽标；flex 布局以便尾部箭头可居右 */
export function SidebarBtn({
  onClick,
  disabled,
  helpText,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  helpText?: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'group relative flex w-full items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ' +
        'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 active:bg-indigo-100/50'
      }
    >
      {children}
      {helpText && (
        <span
          className="ml-auto flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] leading-none text-slate-600 transition group-hover:bg-indigo-100 group-hover:text-indigo-600"
          title={helpText}
        >
          ?
        </span>
      )}
    </button>
  )
}

/**
 * 侧边栏分组：标题与按钮字体一致（text-xs）但加粗，点击标题可折叠/展开该分类。
 */
export function SidebarGroup({
  label,
  children,
  defaultOpen = true,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-md px-2 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
      >
        <span>{label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={'text-slate-400 transition-transform ' + (open ? '' : '-rotate-90')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="flex flex-col gap-1">{children}</div>}
    </div>
  )
}

/** 跨页签按钮的尾部箭头（与帮助徽标同尺寸的 14px 居中盒子，保证两者中心上下对齐） */
export function Arrow() {
  return (
    <span className="ml-auto flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition group-hover:text-indigo-500">
      →
    </span>
  )
}

/** 侧边栏开关项（紧凑版） */
export function SidebarToggle({
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
      className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
    >
      <span>{label}</span>
      <span
        className={'relative h-4 w-7 rounded-full transition ' + (checked ? 'bg-blue-600' : 'bg-slate-300')}
      >
        <span
          className={
            'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ' +
            (checked ? 'left-[14px]' : 'left-0.5')
          }
        />
      </span>
    </button>
  )
}
