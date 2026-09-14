import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * JSON / XML 多页签模型：每个页签独立内容，切换/关闭互不影响。
 * 内容存放在此处，页签切换或工具切换时组件卸载/重挂载也不会丢失内容。
 */
export interface DocTab {
  id: string
  title: string
  content: string
}

interface TabState {
  tabs: DocTab[]
  activeId: string
}

let tabSeq = 0
function freshTab(prefix: string, content = ''): DocTab {
  tabSeq += 1
  return { id: `tab-${tabSeq}`, title: `${prefix} 1`, content }
}

/** 依据现有标题递增编号，关闭页签后新建的页签不会与历史编号冲突 */
function nextTitle(tabs: DocTab[], prefix: string): string {
  const max = tabs.reduce((m, t) => {
    const n = Number(t.title.slice(prefix.length + 1))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `${prefix} ${max + 1}`
}

function initialTabState(prefix: string): TabState {
  const t = freshTab(prefix)
  return { tabs: [t], activeId: t.id }
}

/**
 * 跨页签共享状态：JSON / XML 多页签、其余工具的单一内容，以及当前激活的工具。
 * 「差异对比 / 编解码」通过设置对应内容 + 切换页签完成；
 * 「JSON⇄XML 转换」改为开新页签，避免覆盖目标工具已有内容。
 */
interface Store {
  activeTool: string
  setActiveTool: (id: string) => void

  // ── JSON 多页签 ──
  jsonTabs: DocTab[]
  jsonActiveId: string
  jsonContent: string
  setJsonContent: (s: string) => void
  addJsonTab: () => void
  closeJsonTab: (id: string) => void
  selectJsonTab: (id: string) => void
  renameJsonTab: (id: string, title: string) => void
  /** 新建一个 JSON 页签并写入内容，同时切换到 JSON 工具 */
  openJsonTab: (content: string) => void

  // ── XML 多页签 ──
  xmlTabs: DocTab[]
  xmlActiveId: string
  xmlContent: string
  setXmlContent: (s: string) => void
  addXmlTab: () => void
  closeXmlTab: (id: string) => void
  selectXmlTab: (id: string) => void
  renameXmlTab: (id: string, title: string) => void
  /** 新建一个 XML 页签并写入内容，同时切换到 XML 工具 */
  openXmlTab: (content: string) => void

  diffLeft: string
  setDiffLeft: (s: string) => void
  diffRight: string
  setDiffRight: (s: string) => void

  codecContent: string
  setCodecContent: (s: string) => void

  tsContent: string
  setTsContent: (s: string) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState('json')
  const [json, setJson] = useState<TabState>(() => initialTabState('JSON'))
  const [xml, setXml] = useState<TabState>(() => initialTabState('XML'))
  const [diffLeft, setDiffLeft] = useState('')
  const [diffRight, setDiffRight] = useState('')
  const [codecContent, setCodecContent] = useState('')
  const [tsContent, setTsContent] = useState('')

  const setJsonContent = useCallback((s: string) => {
    setJson((st) => ({
      ...st,
      tabs: st.tabs.map((t) => (t.id === st.activeId ? { ...t, content: s } : t)),
    }))
  }, [])

  const setXmlContent = useCallback((s: string) => {
    setXml((st) => ({
      ...st,
      tabs: st.tabs.map((t) => (t.id === st.activeId ? { ...t, content: s } : t)),
    }))
  }, [])

  const addJsonTab = useCallback(() => {
    setJson((st) => {
      const t: DocTab = { id: `tab-${++tabSeq}`, title: nextTitle(st.tabs, 'JSON'), content: '' }
      return { tabs: [...st.tabs, t], activeId: t.id }
    })
  }, [])

  const addXmlTab = useCallback(() => {
    setXml((st) => {
      const t: DocTab = { id: `tab-${++tabSeq}`, title: nextTitle(st.tabs, 'XML'), content: '' }
      return { tabs: [...st.tabs, t], activeId: t.id }
    })
  }, [])

  const closeJsonTab = useCallback((id: string) => {
    setJson((st) => {
      const idx = st.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return st
      const tabs = st.tabs.filter((t) => t.id !== id)
      if (tabs.length === 0) {
        const fresh = freshTab('JSON')
        return { tabs: [fresh], activeId: fresh.id }
      }
      const activeId = st.activeId === id ? tabs[Math.min(idx, tabs.length - 1)].id : st.activeId
      return { tabs, activeId }
    })
  }, [])

  const closeXmlTab = useCallback((id: string) => {
    setXml((st) => {
      const idx = st.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return st
      const tabs = st.tabs.filter((t) => t.id !== id)
      if (tabs.length === 0) {
        const fresh = freshTab('XML')
        return { tabs: [fresh], activeId: fresh.id }
      }
      const activeId = st.activeId === id ? tabs[Math.min(idx, tabs.length - 1)].id : st.activeId
      return { tabs, activeId }
    })
  }, [])

  const selectJsonTab = useCallback((id: string) => {
    setJson((st) => (st.activeId === id ? st : { ...st, activeId: id }))
  }, [])

  const selectXmlTab = useCallback((id: string) => {
    setXml((st) => (st.activeId === id ? st : { ...st, activeId: id }))
  }, [])

  const renameJsonTab = useCallback((id: string, title: string) => {
    setJson((st) => ({
      ...st,
      tabs: st.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }))
  }, [])

  const renameXmlTab = useCallback((id: string, title: string) => {
    setXml((st) => ({
      ...st,
      tabs: st.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }))
  }, [])

  const openJsonTab = useCallback(
    (content: string) => {
      setJson((st) => {
        const t: DocTab = { id: `tab-${++tabSeq}`, title: nextTitle(st.tabs, 'JSON'), content }
        return { tabs: [...st.tabs, t], activeId: t.id }
      })
      setActiveTool('json')
    },
    [],
  )

  const openXmlTab = useCallback(
    (content: string) => {
      setXml((st) => {
        const t: DocTab = { id: `tab-${++tabSeq}`, title: nextTitle(st.tabs, 'XML'), content }
        return { tabs: [...st.tabs, t], activeId: t.id }
      })
      setActiveTool('xml')
    },
    [],
  )

  return (
    <Ctx.Provider
      value={{
        activeTool,
        setActiveTool,
        jsonTabs: json.tabs,
        jsonActiveId: json.activeId,
        jsonContent: json.tabs.find((t) => t.id === json.activeId)?.content ?? '',
        setJsonContent,
        addJsonTab,
        closeJsonTab,
        selectJsonTab,
        renameJsonTab,
        openJsonTab,
        xmlTabs: xml.tabs,
        xmlActiveId: xml.activeId,
        xmlContent: xml.tabs.find((t) => t.id === xml.activeId)?.content ?? '',
        setXmlContent,
        addXmlTab,
        closeXmlTab,
        selectXmlTab,
        renameXmlTab,
        openXmlTab,
        diffLeft,
        setDiffLeft,
        diffRight,
        setDiffRight,
        codecContent,
        setCodecContent,
        tsContent,
        setTsContent,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useStore(): Store {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用')
  return ctx
}
