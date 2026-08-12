import { useCallback, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { xml } from '@codemirror/lang-xml'
import * as X from '../xmlUtils'
import { useStore } from '../store'
import { Workspace, SidebarBtn, SidebarGroup, Arrow, SidebarToggle, useCursorInfo, type Status } from '../components/Workspace'
import { createTipExtension } from '../components/widgets'

const editorTip = createTipExtension([
  ['粘贴 XML 或任意文本，使用左侧工具栏进行处理'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

export function XmlTool() {
  const { xmlContent, setXmlContent, setDiffLeft, setCodecContent, setJsonContent, setActiveTool } = useStore()
  const [status, setStatus] = useState<Status>({ type: 'idle', text: '' })
  const [indent, setIndent] = useState(2)
  const [wrap, setWrap] = useState(true)
  const [autoFormat, setAutoFormat] = useState(true)
  const justPasted = useRef(false)
  const [cursorInfo, onCursorUpdate] = useCursorInfo()

  const extensions = useMemo(
    () => [xml(), ...(wrap ? [EditorView.lineWrapping] : [])],
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
      if (!xmlContent.trim()) {
        setStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(xmlContent)
        setXmlContent(result)
        setStatus({ type: 'ok', text: `${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus({ type: 'error', text: `${label}失败：${msg}` })
      }
    },
    [xmlContent, setXmlContent],
  )

  const formatValidate = useCallback(() => {
    if (!xmlContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const result = X.format(xmlContent, indent)
      setXmlContent(result)
      setStatus({ type: 'ok', text: `格式化成功 · ${result.length} 字符` })
    } catch (e) {
      const r = X.validate(xmlContent)
      setStatus({ type: 'error', text: r.message })
    }
  }, [xmlContent, indent, setXmlContent])

  // ── 跨页签：差异对比 ──
  const sendToDiff = useCallback(() => {
    if (!xmlContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    setDiffLeft(xmlContent)
    setActiveTool('diff')
  }, [xmlContent, setDiffLeft, setActiveTool])

  // ── 跨页签：编解码 ──
  const sendToCodec = useCallback(() => {
    setCodecContent(xmlContent)
    setActiveTool('codec')
  }, [xmlContent, setCodecContent, setActiveTool])

  // ── 跨页签：转 JSON ──
  const convertToJson = useCallback(() => {
    if (!xmlContent.trim()) {
      setStatus({ type: 'error', text: '内容为空' })
      return
    }
    try {
      const result = X.toJson(xmlContent, indent)
      setJsonContent(result)
      setActiveTool('json')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus({ type: 'error', text: `转 JSON 失败：${msg}` })
    }
  }, [xmlContent, indent, setJsonContent, setActiveTool])

  // ── 粘贴时自动格式化/校验 ──
  const handleChange = useCallback(
    (value: string) => {
      setXmlContent(value)
      if (autoFormat && justPasted.current) {
        justPasted.current = false
        if (value.trim()) {
          try {
            const result = X.format(value, indent)
            setXmlContent(result)
            setStatus({ type: 'ok', text: `格式化成功 · ${result.length} 字符` })
          } catch {
            const r = X.validate(value)
            setStatus({ type: 'error', text: r.message })
          }
        }
      }
    },
    [autoFormat, indent, setXmlContent],
  )

  const sidebar = (
    <>
      <SidebarGroup label="格式化">
        <SidebarBtn onClick={formatValidate}>格式化 / 校验</SidebarBtn>
        <SidebarBtn onClick={() => operate('压缩', X.minify)}>压缩</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="转义">
        <SidebarBtn onClick={() => operate('转义', X.escape)}>转义</SidebarBtn>
        <SidebarBtn onClick={() => operate('反转义', X.unescape)}>反转义</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="跨页签">
        <SidebarBtn onClick={sendToDiff}><span>差异对比</span><Arrow /></SidebarBtn>
        <SidebarBtn onClick={sendToCodec}><span>编解码</span><Arrow /></SidebarBtn>
        <SidebarBtn onClick={convertToJson}><span>转 JSON</span><Arrow /></SidebarBtn>
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
    <Workspace sidebar={sidebar} status={status} count={xmlContent.length} cursorInfo={cursorInfo}>
      <CodeMirror
        value={xmlContent}
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
