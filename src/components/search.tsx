import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Prec, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, keymap } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

/** 单个匹配项：文档绝对偏移 + 所在行号（1-based） */
export interface SearchMatch {
  from: number
  to: number
  line: number
}

/** 一次搜索高亮的完整描述 */
interface SearchHighlight {
  matches: SearchMatch[]
  /** 当前项在 matches 中的下标 */
  current: number
  /** 是否高亮全部匹配（关闭时只显示当前项） */
  highlightAll: boolean
}

/** 更新搜索高亮 */
const setSearchHighlight = StateEffect.define<SearchHighlight>()
/** 清除搜索高亮 */
const clearSearchHighlight = StateEffect.define<null>()

const matchMark = Decoration.mark({ class: 'cm-find-match' })
const currentMark = Decoration.mark({ class: 'cm-find-match-current' })

/** 当前项用强调色，其余项仅在「高亮全部」开启时着色 */
function buildDecorations(value: SearchHighlight): DecorationSet {
  const ranges: Range<Decoration>[] = []
  value.matches.forEach((m, i) => {
    if (i === value.current) ranges.push(currentMark.range(m.from, m.to))
    else if (value.highlightAll) ranges.push(matchMark.range(m.from, m.to))
  })
  return Decoration.set(ranges, true)
}

/** 持有搜索高亮装饰的字段；文档改动时先清空，由宿主重新计算后再下发 */
const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setSearchHighlight)) return buildDecorations(e.value)
      if (e.is(clearSearchHighlight)) return Decoration.none
    }
    if (tr.docChanged) return Decoration.none
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const searchTheme = EditorView.baseTheme({
  '.cm-find-match': { backgroundColor: 'rgba(250, 204, 21, 0.42)', borderRadius: '2px' },
  '.cm-find-match-current': { backgroundColor: 'rgba(249, 115, 22, 0.55)', borderRadius: '2px' },
})

/**
 * 关闭 CodeMirror 自带的查找键位与「选中词高亮」，改由自定义查找条接管。
 * 保持为模块级常量：@uiw/react-codemirror 会把该 prop 作为重配置依赖，
 * 若每次渲染新建对象字面量会导致编辑器被反复重配置。
 */
export const BASIC_SETUP_WITHOUT_SEARCH = {
  searchKeymap: false,
  highlightSelectionMatches: false,
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 在文档中查找全部匹配（不区分大小写，按出现顺序，互不重叠） */
function findMatches(state: EditorState, query: string): SearchMatch[] {
  if (!query) return []
  const text = state.doc.toString()
  const re = new RegExp(escapeRegExp(query), 'gi')
  const out: SearchMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    // 兜底：防止空匹配导致死循环（query 非空时不会触发）
    if (m.index === re.lastIndex) re.lastIndex++
    out.push({ from: m.index, to: m.index + m[0].length, line: state.doc.lineAt(m.index).number })
  }
  return out
}

/** 光标之后（含光标处）的第一个匹配；没有则回到第一个 */
function pickStartIndex(view: EditorView, matches: SearchMatch[]): number {
  const from = view.state.selection.main.from
  const i = matches.findIndex((m) => m.from >= from)
  return i === -1 ? 0 : i
}

/** 只刷新高亮装饰，不改变编辑器选区 */
function paintMatches(view: EditorView, matches: SearchMatch[], current: number, highlightAll: boolean) {
  if (matches.length === 0) {
    view.dispatch({ effects: clearSearchHighlight.of(null) })
    return
  }
  view.dispatch({ effects: setSearchHighlight.of({ matches, current, highlightAll }) })
}

/** 选中目标匹配、滚动到视图中央，并同步高亮 */
function focusMatch(view: EditorView, matches: SearchMatch[], current: number, highlightAll: boolean) {
  const m = matches[current]
  view.dispatch({
    selection: { anchor: m.from, head: m.to },
    effects: [
      EditorView.scrollIntoView(m.from, { y: 'center' }),
      setSearchHighlight.of({ matches, current, highlightAll }),
    ],
  })
}

export interface EditorSearch {
  open: boolean
  query: string
  /** 匹配总数 */
  total: number
  /** 当前是第几个（从 1 开始；无匹配时为 0） */
  index: number
  /** 当前匹配所在行号（无匹配时为 0） */
  line: number
  highlightAll: boolean
  /** 每次唤起面板自增，用于让输入框重新聚焦 */
  focusTick: number
  extension: Extension
  onUpdate: (vu: ViewUpdate) => void
  setQuery: (q: string) => void
  setHighlightAll: (v: boolean) => void
  next: () => void
  prev: () => void
  close: () => void
}

/**
 * 编辑器查找能力：Ctrl+F 唤起自定义查找条，支持匹配计数、
 * 当前行号显示、上下跳转与「高亮全部」开关。
 */
export function useEditorSearch(): EditorSearch {
  const [open, setOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [current, setCurrent] = useState(0)
  const [highlightAll, setHighlightAllState] = useState(true)
  const [focusTick, setFocusTick] = useState(0)

  const viewRef = useRef<EditorView | null>(null)
  const matchesRef = useRef<SearchMatch[]>([])
  const currentRef = useRef(0)
  const queryRef = useRef('')
  const highlightRef = useRef(true)
  const openRef = useRef(false)

  const openPanel = useCallback((view?: EditorView) => {
    if (view) viewRef.current = view
    openRef.current = true
    setOpen(true)
    setFocusTick((t) => t + 1)
    // 重新唤起时按已有关键字定位，光标之后优先
    const v = viewRef.current
    if (!v || !queryRef.current) return
    const ms = findMatches(v.state, queryRef.current)
    matchesRef.current = ms
    setMatches(ms)
    const idx = ms.length ? pickStartIndex(v, ms) : 0
    currentRef.current = idx
    setCurrent(idx)
    if (ms.length) focusMatch(v, ms, idx, highlightRef.current)
    else paintMatches(v, ms, idx, highlightRef.current)
  }, [])

  const close = useCallback(() => {
    openRef.current = false
    setOpen(false)
    const v = viewRef.current
    if (v) v.dispatch({ effects: clearSearchHighlight.of(null) })
    matchesRef.current = []
    setMatches([])
    currentRef.current = 0
    setCurrent(0)
  }, [])

  const setQuery = useCallback((q: string) => {
    queryRef.current = q
    setQueryState(q)
    const v = viewRef.current
    if (!v) return
    const ms = findMatches(v.state, q)
    matchesRef.current = ms
    setMatches(ms)
    const idx = ms.length ? pickStartIndex(v, ms) : 0
    currentRef.current = idx
    setCurrent(idx)
    if (ms.length) focusMatch(v, ms, idx, highlightRef.current)
    else paintMatches(v, ms, idx, highlightRef.current)
  }, [])

  const setHighlightAll = useCallback((value: boolean) => {
    highlightRef.current = value
    setHighlightAllState(value)
    const v = viewRef.current
    if (v) paintMatches(v, matchesRef.current, currentRef.current, value)
  }, [])

  /** 跳转到第 idx 个匹配（越界自动环绕） */
  const goto = useCallback((idx: number) => {
    const v = viewRef.current
    const ms = matchesRef.current
    if (!v) return
    if (ms.length === 0) {
      currentRef.current = 0
      setCurrent(0)
      paintMatches(v, ms, 0, highlightRef.current)
      return
    }
    const i = ((idx % ms.length) + ms.length) % ms.length
    currentRef.current = i
    setCurrent(i)
    focusMatch(v, ms, i, highlightRef.current)
  }, [])

  const next = useCallback(() => goto(currentRef.current + 1), [goto])
  const prev = useCallback(() => goto(currentRef.current - 1), [goto])

  const onUpdate = useCallback((vu: ViewUpdate) => {
    viewRef.current = vu.view
    if (!vu.docChanged) return
    if (!openRef.current || !queryRef.current) {
      if (matchesRef.current.length > 0) {
        matchesRef.current = []
        setMatches([])
        currentRef.current = 0
        setCurrent(0)
      }
      return
    }
    // 编辑文档时只刷新高亮与计数，不移动选区，避免打断输入
    const ms = findMatches(vu.state, queryRef.current)
    matchesRef.current = ms
    setMatches(ms)
    let idx = currentRef.current
    if (ms.length === 0) idx = 0
    else if (idx > ms.length - 1) idx = ms.length - 1
    currentRef.current = idx
    setCurrent(idx)
    paintMatches(vu.view, ms, idx, highlightRef.current)
  }, [])

  const extension = useMemo(
    () => [
      searchHighlightField,
      searchTheme,
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-f',
            run: (view) => {
              openPanel(view)
              return true
            },
          },
          {
            key: 'Escape',
            run: () => {
              if (!openRef.current) return false
              close()
              return true
            },
          },
        ]),
      ),
    ],
    [openPanel, close],
  )

  const currentMatch = matches[current]

  return {
    open,
    query,
    total: matches.length,
    index: matches.length > 0 ? current + 1 : 0,
    line: currentMatch ? currentMatch.line : 0,
    highlightAll,
    focusTick,
    extension,
    onUpdate,
    setQuery,
    setHighlightAll,
    next,
    prev,
    close,
  }
}

const iconCls = 'h-4 w-3.5 shrink-0'
const navBtnCls =
  'flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30'

/** 浮在编辑器右上角的查找条 */
export function SearchBar({ search }: { search: EditorSearch }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!search.open) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [search.open, search.focusTick])

  if (!search.open) return null

  const has = search.total > 0

  return (
    <div className="absolute right-3 top-2 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-xs shadow-lg backdrop-blur">
      <svg
        className="h-3.5 w-3.5 shrink-0 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
      <input
        ref={inputRef}
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault()
            e.currentTarget.select()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) search.prev()
            else search.next()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            search.close()
          }
        }}
        placeholder="查找"
        spellCheck={false}
        className="w-28 bg-transparent text-slate-700 outline-none placeholder:text-slate-400 sm:w-40"
      />
      <span
        className={'shrink-0 tabular-nums ' + (has ? 'text-slate-600' : 'text-slate-300')}
        title="当前 / 总数"
      >
        {search.index} / {search.total}
      </span>
      <span className="w-12 shrink-0 truncate tabular-nums text-slate-400" title="当前匹配所在行">
        {has ? `第 ${search.line} 行` : ''}
      </span>
      <span className="h-4 w-px shrink-0 bg-slate-200" />
      <label className="flex shrink-0 cursor-pointer select-none items-center gap-1 text-slate-500" title="高亮全部匹配项">
        <input
          type="checkbox"
          checked={search.highlightAll}
          onChange={(e) => {
            search.setHighlightAll(e.target.checked)
            inputRef.current?.focus()
          }}
          className="h-3.5 w-3.5 accent-indigo-600"
        />
        高亮全部
      </label>
      <span className="h-4 w-px shrink-0 bg-slate-200" />
      <button
        type="button"
        onClick={search.prev}
        disabled={!has}
        onMouseDown={(e) => e.preventDefault()}
        title="上一个 (Shift+Enter)"
        className={navBtnCls}
      >
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 15 12 9 18 15" />
        </svg>
      </button>
      <button
        type="button"
        onClick={search.next}
        disabled={!has}
        onMouseDown={(e) => e.preventDefault()}
        title="下一个 (Enter)"
        className={navBtnCls}
      >
        <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button
        type="button"
        onClick={search.close}
        title="关闭 (Esc)"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
    </div>
  )
}
