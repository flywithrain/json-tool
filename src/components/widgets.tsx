import { StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

/** 富文本占位提示：空编辑器时显示快捷键提示 */
export class TipWidget extends WidgetType {
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

/** 创建空编辑器提示扩展，传入自定义提示行 */
export function createTipExtension(lines: string[][]) {
  // block: true 让提示作为独立块渲染，不撑高光标所在行（避免空编辑器时光标变得很高）。
  // 注意：块级装饰必须由 StateField 提供，不能用 ViewPlugin（否则抛
  // "Block decorations may not be specified via plugins"）。
  const widget = Decoration.widget({ widget: new TipWidget(lines), side: 1, block: true })
  return StateField.define<DecorationSet>({
    create(state) {
      return state.doc.length === 0 ? Decoration.set([widget.range(0)]) : Decoration.none
    },
    update(deco, tr) {
      if (!tr.docChanged) return deco
      return tr.state.doc.length === 0 ? Decoration.set([widget.range(0)]) : Decoration.none
    },
    provide: (f) => EditorView.decorations.from(f),
  })
}

export function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
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
export function ToolBtn({
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
export function Switch({
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
