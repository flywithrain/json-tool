import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import * as T from '../timestampUtils'
import { useStore } from '../store'
import { Workspace, SidebarBtn, SidebarGroup, SidebarToggle, useCursorInfo, type Status } from '../components/Workspace'
import { createTipExtension } from '../components/widgets'

const editorTip = createTipExtension([
  ['输入时间戳或标准时间，使用左侧工具进行双向转换'],
  [],
  ['时间戳：10 位秒 / 13 位毫秒 / 16 位微秒 / 19 位纳秒'],
  ['标准时间：YYYY-MM-DD HH:mm:ss[.SSS]'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

function getCurrentValues() {
  const date = new Date()
  const ms = date.getTime()
  return {
    s: String(Math.floor(ms / 1000)),
    ms: String(ms),
    us: String(BigInt(ms) * 1000n),
    ns: String(BigInt(ms) * 1_000_000n),
    date: T.formatDate(date),
  }
}

export function TimestampTool() {
  const { tsContent, setTsContent } = useStore()
  const [status, setStatus] = useState<Status>({ type: 'idle', text: '' })
  const [wrap, setWrap] = useState(true)
  const [now, setNow] = useState(getCurrentValues)
  const [cursorInfo, onCursorUpdate] = useCursorInfo()

  const extensions = useMemo(() => [...(wrap ? [EditorView.lineWrapping] : [])], [wrap])
  const allExtensions = useMemo(() => [...extensions, editorTip], [extensions])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getCurrentValues()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const operate = useCallback(
    (label: string, fn: (t: string) => string) => {
      if (!tsContent.trim()) {
        setStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(tsContent)
        setTsContent(result)
        setStatus({ type: 'ok', text: `${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus({ type: 'error', text: `${label}失败：${msg}` })
      }
    },
    [tsContent, setTsContent],
  )

  // ── 自动识别单位并转换（状态栏提示识别出的单位） ──
  const autoConvert = useCallback(() => {
    if (!tsContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const { date, unit, frac } = T.parseTimestamp(tsContent)
      setTsContent(T.formatFromDate(date, unit, frac))
      setStatus({ type: 'ok', text: `转换成功 · 已按${T.UNIT_LABEL[unit]}识别` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus({ type: 'error', text: `转换失败：${msg}` })
    }
  }, [tsContent, setTsContent])

  // ── 批量：文本中所有时间戳 → 标准时间 ──
  const batchConvert = useCallback(() => {
    if (!tsContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    const { text, count } = T.batchTsToDate(tsContent)
    setTsContent(text)
    if (count === 0) {
      setStatus({ type: 'idle', text: '未找到时间戳（需为独立的 10/13/16/19 位数字）' })
      return
    }
    setStatus({ type: 'ok', text: `批量转换成功 · 共 ${count} 处` })
  }, [tsContent, setTsContent])

  const sidebar = (
    <>
      <SidebarGroup label="时间戳 → 时间">
        <SidebarBtn onClick={autoConvert} helpText="按位数自动识别单位（10位秒 / 13位毫秒 / 16位微秒 / 19位纳秒）">
          自动识别
        </SidebarBtn>
        <SidebarBtn onClick={() => operate('按秒转换', (t) => T.tsToDate(t, 's'))}>按秒(10位)</SidebarBtn>
        <SidebarBtn onClick={() => operate('按毫秒转换', (t) => T.tsToDate(t, 'ms'))}>按毫秒(13位)</SidebarBtn>
        <SidebarBtn onClick={() => operate('按微秒转换', (t) => T.tsToDate(t, 'us'))}>按微秒(16位)</SidebarBtn>
        <SidebarBtn onClick={() => operate('按纳秒转换', (t) => T.tsToDate(t, 'ns'))}>按纳秒(19位)</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="时间 → 时间戳">
        <SidebarBtn onClick={() => operate('转秒', (t) => T.dateToTs(t, 's'))}>秒(10位)</SidebarBtn>
        <SidebarBtn onClick={() => operate('转毫秒', (t) => T.dateToTs(t, 'ms'))}>毫秒(13位)</SidebarBtn>
        <SidebarBtn onClick={() => operate('转微秒', (t) => T.dateToTs(t, 'us'))}>微秒(16位)</SidebarBtn>
        <SidebarBtn onClick={() => operate('转纳秒', (t) => T.dateToTs(t, 'ns'))}>纳秒(19位)</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="批量 / 其他">
        <SidebarBtn onClick={batchConvert} helpText="将文本中所有时间戳数字串（10/13/16/19位）替换为标准时间">
          批量时间戳→时间
        </SidebarBtn>
        <SidebarBtn
          onClick={() => {
            const current = getCurrentValues()
            setTsContent(tsContent ? `${tsContent}\n${current.date}` : current.date)
            setStatus({ type: 'ok', text: '已插入当前时间' })
          }}
        >
          插入当前时间
        </SidebarBtn>
        <SidebarBtn
          onClick={() => {
            const current = getCurrentValues()
            const values = `${current.s}\n${current.ms}\n${current.us}\n${current.ns}`
            setTsContent(tsContent ? `${tsContent}\n${values}` : values)
            setStatus({ type: 'ok', text: '已插入当前时间戳' })
          }}
        >
          插入当前时间戳
        </SidebarBtn>
      </SidebarGroup>

      <div className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] leading-5 text-slate-500">
        <div>识别：10位=秒 · 13位=毫秒</div>
        <div>16位=微秒 · 19位=纳秒</div>
        <div>时区：{T.tzOffsetLabel()}（本地）</div>
        <div className="tabular-nums">现在：{now.date}</div>
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-2">
        <SidebarToggle checked={wrap} onChange={setWrap} label="自动换行" />
      </div>
    </>
  )

  return (
    <Workspace sidebar={sidebar} status={status} count={tsContent.length} cursorInfo={cursorInfo}>
      <CodeMirror
        value={tsContent}
        extensions={allExtensions}
        onChange={setTsContent}
        onUpdate={onCursorUpdate}
        theme="light"
        basicSetup={true}
        height="100%"
        className="h-full"
      />
    </Workspace>
  )
}
