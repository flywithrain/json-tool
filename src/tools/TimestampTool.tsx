import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import * as T from '../timestampUtils'
import { useStore } from '../store'
import { Workspace, SidebarBtn, SidebarGroup, SidebarToggle, useCursorInfo, type Status } from '../components/Workspace'
import { createTipExtension } from '../components/widgets'

const inputTip = createTipExtension([
  ['每行输入一个时间戳或标准时间，右侧实时输出转换结果'],
  [],
  ['时间戳：10 位秒 / 13 位毫秒 / 16 位微秒 / 19 位纳秒'],
  ['标准时间：YYYY-MM-DD HH:mm:ss[.SSS]'],
  [],
  ['转换规则在左侧工具栏切换，此处内容始终保持原样'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

const outputTip = createTipExtension([
  ['转换结果按行展示，与左侧输入行号一一对应'],
  [],
  ['转换失败的行以 ✗ 开头显示原因'],
])

function getCurrentValues(tz: T.TzOption = 'local') {
  const date = new Date()
  const ms = date.getTime()
  return {
    s: String(Math.floor(ms / 1000)),
    ms: String(ms),
    us: String(BigInt(ms) * 1000n),
    ns: String(BigInt(ms) * 1_000_000n),
    date: T.formatDate(date, tz),
  }
}

/** 左右分栏面板：固定标题栏 + 自适应编辑器区 */
function Panel({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
        <span className="shrink-0">{title}</span>
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">{extra}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function modeLabel(dir: T.Direction, unit: T.UnitChoice, batch: boolean, tz: T.TzOption): string {
  const u = unit === 'auto' ? '自动单位' : T.UNIT_LABEL[unit]
  if (batch) return `批量替换 · ${u} · ${T.tzOffsetLabel(tz)}`
  const d = dir === 'auto' ? '自动识别方向' : dir === 'ts2date' ? '时间戳 → 时间' : '时间 → 时间戳'
  return `${d} · ${u} · ${T.tzOffsetLabel(tz)}`
}

export function TimestampTool() {
  const { tsContent, setTsContent } = useStore()
  const [status, setStatus] = useState<Status>({ type: 'idle', text: '' })
  const [wrap, setWrap] = useState(true)
  const [now, setNow] = useState(getCurrentValues)
  const [cursorInfo, onCursorUpdate] = useCursorInfo()

  // 转换规则：方向 + 单位 + 时区 + 是否整段批量替换；结果随输入与规则实时重算
  const [dir, setDir] = useState<T.Direction>('auto')
  const [unit, setUnit] = useState<T.UnitChoice>('auto')
  const [tz, setTz] = useState<T.TzOption>('local')
  const [batch, setBatch] = useState(false)

  const extensions = useMemo(() => [...(wrap ? [EditorView.lineWrapping] : [])], [wrap])
  const inputExtensions = useMemo(() => [...extensions, inputTip], [extensions])
  const outputExtensions = useMemo(() => [...extensions, outputTip], [extensions])

  useEffect(() => {
    const tick = () => setNow(getCurrentValues(tz))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [tz])

  const result = useMemo(() => {
    const empty = { text: '', ok: 0, fail: 0 }
    if (!tsContent.trim()) return empty
    const r = batch
      ? T.convertBatch(tsContent, unit === 'auto' ? undefined : unit, tz)
      : T.convertLines(tsContent, dir, unit, tz)
    return { text: r.lines.join('\n'), ok: r.ok, fail: r.fail }
  }, [tsContent, dir, unit, tz, batch])

  // 状态栏随结果自动更新（手动提示如「已复制」不会被覆盖，仅当输入/规则变化时才重算）
  useEffect(() => {
    if (!tsContent.trim()) {
      setStatus({ type: 'idle', text: '' })
      return
    }
    if (result.fail > 0) {
      setStatus({ type: 'error', text: `${result.fail} 行转换失败 · ${result.ok} 行成功` })
      return
    }
    if (batch && result.ok === 0) {
      setStatus({ type: 'idle', text: '未找到时间戳（需为独立的 10/13/16/19 位数字）' })
      return
    }
    setStatus({ type: 'ok', text: `转换完成 · ${result.ok} 行` })
  }, [tsContent, result, batch])

  const appendLines = useCallback(
    (lines: string[], label: string) => {
      const add = lines.join('\n')
      setTsContent(tsContent && !tsContent.endsWith('\n') ? `${tsContent}\n${add}` : tsContent + add)
      setStatus({ type: 'ok', text: label })
    },
    [tsContent, setTsContent],
  )

  const insertCurrent = useCallback(
    (pick: (v: ReturnType<typeof getCurrentValues>) => string[], label: string) => {
      appendLines(pick(getCurrentValues(tz)), label)
    },
    [appendLines, tz],
  )

  const copyResult = useCallback(async () => {
    if (!result.text) {
      setStatus({ type: 'error', text: '暂无可复制的结果' })
      return
    }
    try {
      await navigator.clipboard.writeText(result.text)
      setStatus({ type: 'ok', text: `已复制结果 · ${result.text.length} 字符` })
    } catch {
      setStatus({ type: 'error', text: '复制失败，请手动选择复制' })
    }
  }, [result.text])

  const lineCount = useMemo(() => tsContent.split(/\r?\n/).length, [tsContent])

  const sidebar = (
    <>
      <SidebarGroup label="转换方向">
        <SidebarBtn active={!batch && dir === 'auto'} onClick={() => { setDir('auto'); setBatch(false) }} helpText="纯数字按时间戳→时间，其余按时间→时间戳">
          自动识别
        </SidebarBtn>
        <SidebarBtn active={!batch && dir === 'ts2date'} onClick={() => { setDir('ts2date'); setBatch(false) }}>
          时间戳 → 时间
        </SidebarBtn>
        <SidebarBtn active={!batch && dir === 'date2ts'} onClick={() => { setDir('date2ts'); setBatch(false) }}>
          时间 → 时间戳
        </SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="单位">
        <SidebarBtn active={unit === 'auto'} onClick={() => setUnit('auto')} helpText="时间戳按位数识别单位；时间转时间戳时默认毫秒">
          自动识别
        </SidebarBtn>
        <SidebarBtn active={unit === 's'} onClick={() => setUnit('s')}>秒(10位)</SidebarBtn>
        <SidebarBtn active={unit === 'ms'} onClick={() => setUnit('ms')}>毫秒(13位)</SidebarBtn>
        <SidebarBtn active={unit === 'us'} onClick={() => setUnit('us')}>微秒(16位)</SidebarBtn>
        <SidebarBtn active={unit === 'ns'} onClick={() => setUnit('ns')}>纳秒(19位)</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="时区">
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 outline-none transition hover:border-indigo-300 focus:border-indigo-400"
          title="格式化与解析均按所选时区进行，默认本地时区；城市时区（如 Asia/Shanghai）自动处理夏令时"
        >
          {T.TZ_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {T.tzZoneLabel(zone)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="px-2 text-[11px] leading-5 text-slate-400">
          {T.tzZoneLabel(T.findTzZone(tz))}
          {tz.startsWith('offset:') ? ' · no DST' : ''}
        </div>
      </SidebarGroup>

      <SidebarGroup label="批量 / 其他">
        <SidebarBtn
          active={batch}
          onClick={() => setBatch((b) => !b)}
          helpText="不按行拆分，直接替换整段文本中所有 10/13/16/19 位独立数字"
        >
          批量替换文本内时间戳
        </SidebarBtn>
        <SidebarBtn onClick={() => insertCurrent((v) => [v.date], '已插入当前时间')}>
          插入当前时间
        </SidebarBtn>
        <SidebarBtn onClick={() => insertCurrent((v) => [v.s, v.ms, v.us, v.ns], '已插入当前时间戳')}>
          插入当前时间戳
        </SidebarBtn>
        <SidebarBtn
          onClick={() => {
            setTsContent('')
            setStatus({ type: 'idle', text: '已清空输入' })
          }}
        >
          清空输入
        </SidebarBtn>
      </SidebarGroup>

      <div className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] leading-5 text-slate-500">
        <div>识别：10位=秒 · 13位=毫秒</div>
        <div>16位=微秒 · 19位=纳秒</div>
        <div>时区：{T.tzZoneLabel(T.findTzZone(tz))}</div>
        <div className="tabular-nums">现在：{now.date}</div>
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-2">
        <SidebarToggle checked={wrap} onChange={setWrap} label="自动换行" />
      </div>
    </>
  )

  return (
    <Workspace sidebar={sidebar} status={status} count={tsContent.length} cursorInfo={cursorInfo}>
      <div className="flex h-full min-h-0 gap-2">
        <Panel title="输入（原始内容保留）" extra={<span className="tabular-nums">{lineCount} 行</span>}>
          <CodeMirror
            value={tsContent}
            extensions={inputExtensions}
            onChange={setTsContent}
            onUpdate={onCursorUpdate}
            theme="light"
            basicSetup={true}
            height="100%"
            className="h-full"
          />
        </Panel>

        <Panel
          title="输出（按行展示）"
          extra={
            <>
              <span className="truncate text-slate-400">{modeLabel(dir, unit, batch, tz)}</span>
              <span className={result.fail > 0 ? 'text-red-500' : 'text-emerald-600'}>
                {result.fail > 0 ? `${result.fail} 行失败` : `${result.ok} 行`}
              </span>
              <button
                type="button"
                onClick={copyResult}
                disabled={!result.text}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-normal text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40"
              >
                复制结果
              </button>
            </>
          }
        >
          <CodeMirror
            value={result.text}
            extensions={outputExtensions}
            editable={false}
            theme="light"
            basicSetup={true}
            height="100%"
            className="h-full"
          />
        </Panel>
      </div>
    </Workspace>
  )
}
