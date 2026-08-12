import { useCallback, useMemo, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import * as C from '../codecUtils'
import { useStore } from '../store'
import { Workspace, SidebarBtn, SidebarGroup, SidebarToggle, useCursorInfo, type Status } from '../components/Workspace'
import { createTipExtension } from '../components/widgets'

const editorTip = createTipExtension([
  ['粘贴文本，使用左侧工具栏进行编解码'],
  [],
  ['kbd:Ctrl+Z', ' 撤销'],
  ['kbd:Ctrl+Y', ' 重做'],
  ['kbd:Ctrl+F', ' 搜索'],
])

export function CodecTool() {
  const { codecContent, setCodecContent } = useStore()
  const [status, setStatus] = useState<Status>({ type: 'idle', text: '' })
  const [wrap, setWrap] = useState(true)
  const [cursorInfo, onCursorUpdate] = useCursorInfo()

  const extensions = useMemo(
    () => [...(wrap ? [EditorView.lineWrapping] : [])],
    [wrap],
  )

  const allExtensions = useMemo(() => [...extensions, editorTip], [extensions])

  // ── 通用操作：对当前内容应用 fn ──
  const operate = useCallback(
    (label: string, fn: (t: string) => string) => {
      if (!codecContent.trim()) {
        setStatus({ type: 'error', text: '内容为空' })
        return
      }
      try {
        const result = fn(codecContent)
        setCodecContent(result)
        setStatus({ type: 'ok', text: `${label}成功 · ${result.length} 字符` })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus({ type: 'error', text: `${label}失败：${msg}` })
      }
    },
    [codecContent, setCodecContent],
  )

  const sidebar = (
    <>
      <SidebarGroup label="URL">
        <SidebarBtn onClick={() => operate('URL 编码', C.urlEncode)}>URL 编码</SidebarBtn>
        <SidebarBtn onClick={() => operate('URL 解码', C.urlDecode)}>URL 解码</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="Base64">
        <SidebarBtn onClick={() => operate('Base64 编码', C.base64Encode)}>Base64 编码</SidebarBtn>
        <SidebarBtn onClick={() => operate('Base64 解码', C.base64Decode)}>Base64 解码</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="HTML">
        <SidebarBtn onClick={() => operate('HTML 编码', C.htmlEncode)}>HTML 编码</SidebarBtn>
        <SidebarBtn onClick={() => operate('HTML 解码', C.htmlDecode)}>HTML 解码</SidebarBtn>
      </SidebarGroup>

      <SidebarGroup label="Unicode">
        <SidebarBtn onClick={() => operate('Unicode 转义', C.unicodeEscape)}>Unicode 转义</SidebarBtn>
        <SidebarBtn onClick={() => operate('Unicode 反转义', C.unicodeUnescape)}>Unicode 反转义</SidebarBtn>
      </SidebarGroup>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-2">
        <SidebarToggle checked={wrap} onChange={setWrap} label="自动换行" />
      </div>
    </>
  )

  return (
    <Workspace sidebar={sidebar} status={status} count={codecContent.length} cursorInfo={cursorInfo}>
      <CodeMirror
        value={codecContent}
        extensions={allExtensions}
        onChange={setCodecContent}
        onUpdate={onCursorUpdate}
        theme="light"
        basicSetup={true}
        height="100%"
        className="h-full"
      />
    </Workspace>
  )
}
