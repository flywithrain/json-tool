import { useCallback, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import * as J from '../jsonUtils'
import * as X from '../xmlUtils'
import { useStore } from '../store'
import { Workspace, SidebarBtn, SidebarGroup, Arrow, SidebarToggle, useCursorInfo, type Status } from '../components/Workspace'
import { createTipExtension } from '../components/widgets'

const editorTip = createTipExtension([
  ['粘贴 JSON 或任意文本，使用左侧工具栏进行处理'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

export function JsonTool() {
  const { jsonContent, setJsonContent, setDiffLeft, setCodecContent, setXmlContent, setActiveTool } = useStore()
  const [status, setStatus] = useState<Status>({ type: 'idle', text: '' })
  const [indent, setIndent] = useState(2)
  const [wrap, setWrap] = useState(true)
  const [autoFormat, setAutoFormat] = useState(true)
  const justPasted = useRef(false)
  const [cursorInfo, onCursorUpdate] = useCursorInfo()

  const extensions = useMemo(
    () => [json(), ...(wrap ? [EditorView.lineWrapping] : [])],
    [wrap],
  )

  const pasteHandler = useMemo(
    () => EditorView.domEventHandlers({ paste: () => { justPasted.current = true } }),
    [],
  )

  const allExtensions = useMemo(() => [...extensions, editorTip, pasteHandler], [extensions, pasteHandler])

  // ── 通用操作：对当前内容应用 fn ──
  const operate = useCallback(
    (label: string, fn: (t: string) => string) => {
      if (!jsonContent.trim()) {
        setStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(jsonContent)
        setJsonContent(result)
        setStatus({ type: 'ok', text: `${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus({ type: 'error', text: `${label}失败：${msg}` })
      }
    },
    [jsonContent, setJsonContent],
  )

  const formatValidate = useCallback(() => {
    if (!jsonContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const result = J.format(jsonContent, indent)
      setJsonContent(result)
      setStatus({ type: 'ok', text: `格式化成功 · ${result.length} 字符` })
    } catch {
      const r = J.validate(jsonContent)
      const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
      setStatus({ type: 'error', text: `${r.message} ${pos}` })
    }
  }, [jsonContent, indent, setJsonContent])

  const unescape = useCallback(() => {
    if (!jsonContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    const { text, changed } = J.unescape(jsonContent)
    if (!changed) {
      setStatus({ type: 'idle', text: '已经无需去除转义' })
      return
    }
    setJsonContent(text)
    setStatus({ type: 'ok', text: `去除转义成功 · ${text.length} 字符` })
  }, [jsonContent, setJsonContent])

  const forceUnescape = useCallback(() => {
    if (!jsonContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const { text, changed } = J.forceUnescape(jsonContent, indent)
      if (!changed) {
        setStatus({ type: 'idle', text: '已经无需去除转义' })
        return
      }
      setJsonContent(text)
      setStatus({ type: 'ok', text: `强制去除转义成功 · ${text.length} 字符` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus({ type: 'error', text: `强制去除转义失败：${msg}` })
    }
  }, [jsonContent, indent, setJsonContent])

  // ── 跨页签：差异对比 ──
  const sendToDiff = useCallback(() => {
    if (!jsonContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    setDiffLeft(jsonContent)
    setActiveTool('diff')
  }, [jsonContent, setDiffLeft, setActiveTool])

  // ── 跨页签：编解码 ──
  const sendToCodec = useCallback(() => {
    setCodecContent(jsonContent)
    setActiveTool('codec')
  }, [jsonContent, setCodecContent, setActiveTool])

  // ── 跨页签：转 XML ──
  const convertToXml = useCallback(() => {
    if (!jsonContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const result = X.fromJson(jsonContent, indent)
      setXmlContent(result)
      setActiveTool('xml')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus({ type: 'error', text: `转 XML 失败：${msg}` })
    }
  }, [jsonContent, indent, setXmlContent, setActiveTool])

  // ── 粘贴时自动格式化/校验 ──
  const handleChange = useCallback(
    (value: string) => {
      setJsonContent(value)
      if (autoFormat && justPasted.current) {
        justPasted.current = false
        if (value.trim()) {
          try {
            const result = J.format(value, indent)
            setJsonContent(result)
            setStatus({ type: 'ok', text: `格式化成功 · ${result.length} 字符` })
          } catch {
            const r = J.validate(value)
            const pos = r.line ? `（第 ${r.line} 行 第 ${r.column} 列）` : ''
            setStatus({ type: 'error', text: `${r.message} ${pos}` })
          }
        }
      }
    },
    [autoFormat, indent, setJsonContent],
  )

  const helpText =
    '针对字符串值：若引号内的内容本身是 JSON（对象/数组），则去掉这层引号并解析为真正的结构。多层嵌套时，每点击一次去除一层；没有可去除的内容时会提示「已经无需去除转义」。'

  const sidebar = (
    <>
      <SidebarGroup label="格式化">
        <SidebarBtn onClick={formatValidate}>格式化 / 校验</SidebarBtn>
        <SidebarBtn onClick={() => operate('压缩', J.minify)}>压缩</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="转义">
        <SidebarBtn onClick={() => operate('转义', J.escape)}>转义</SidebarBtn>
        <SidebarBtn onClick={unescape}>去除转义</SidebarBtn>
        <SidebarBtn onClick={forceUnescape} helpText={helpText}>强制去除转义</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="跨页签">
        <SidebarBtn onClick={sendToDiff}><span>差异对比</span><Arrow /></SidebarBtn>
        <SidebarBtn onClick={sendToCodec}><span>编解码</span><Arrow /></SidebarBtn>
        <SidebarBtn onClick={convertToXml}><span>转 XML</span><Arrow /></SidebarBtn>
      </SidebarGroup>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-2">
        <label className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-600">
          <span>缩进</span>
          <select
            value={indent}
            onChange={(e) => setIndent(Number(e.target.value))}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600 outline-none transition hover:border-slate-300 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <SidebarToggle checked={autoFormat} onChange={setAutoFormat} label="粘贴格式化" />
        <SidebarToggle checked={wrap} onChange={setWrap} label="自动换行" />
      </div>
    </>
  )

  return (
    <Workspace sidebar={sidebar} status={status} count={jsonContent.length} cursorInfo={cursorInfo}>
      <CodeMirror
        value={jsonContent}
        extensions={allExtensions}
        onChange={handleChange}
        onUpdate={onCursorUpdate}
        theme="light"
        basicSetup={true}
        height="100%"
        className="h-full"
      />
    </Workspace>
  )
}
