import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * 跨页签共享状态：各页签的内容以及当前激活的页签。
 * 内容存放在此处，切换页签时组件卸载/重挂载也不会丢失内容，
 * 且「差异对比 / 编解码 / JSON⇄XML 转换」可通过设置对应内容 + 切换页签完成，
 * 无需做重型页面跳转。
 */
interface Store {
  activeTool: string
  setActiveTool: (id: string) => void

  jsonContent: string
  setJsonContent: (s: string) => void

  xmlContent: string
  setXmlContent: (s: string) => void

  diffLeft: string
  setDiffLeft: (s: string) => void
  diffRight: string
  setDiffRight: (s: string) => void

  codecContent: string
  setCodecContent: (s: string) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState('json')
  const [jsonContent, setJsonContent] = useState('')
  const [xmlContent, setXmlContent] = useState('')
  const [diffLeft, setDiffLeft] = useState('')
  const [diffRight, setDiffRight] = useState('')
  const [codecContent, setCodecContent] = useState('')

  return (
    <Ctx.Provider
      value={{
        activeTool,
        setActiveTool,
        jsonContent,
        setJsonContent,
        xmlContent,
        setXmlContent,
        diffLeft,
        setDiffLeft,
        diffRight,
        setDiffRight,
        codecContent,
        setCodecContent,
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
