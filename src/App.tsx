import { StoreProvider, useStore } from './store'
import { JsonTool } from './tools/JsonTool'
import { XmlTool } from './tools/XmlTool'
import { DiffTool } from './tools/DiffTool'
import { CodecTool } from './tools/CodecTool'

interface ToolDef {
  id: string
  name: string
  icon: string
  component: () => JSX.Element
}

const TOOLS: ToolDef[] = [
  { id: 'json', name: 'JSON', icon: '{ }', component: JsonTool },
  { id: 'xml', name: 'XML', icon: '< />', component: XmlTool },
  { id: 'codec', name: '编解码', icon: '#', component: CodecTool },
  { id: 'diff', name: '差异对比', icon: '⇄', component: DiffTool },
]

/** 外部站点：作为页签平级链接展示在差异对比之后 */
const SITES = [
  { name: '资源导航', url: 'https://navigation.oneget.space' },
  { name: '计算器大全', url: 'https://calculator-tool.oneget.space' },
  { name: '文生图', url: 'https://text-img.oneget.space/' },
]

function Shell() {
  const { activeTool, setActiveTool } = useStore()
  const Active = TOOLS.find((t) => t.id === activeTool)?.component ?? JsonTool

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-800">
      <header className="relative z-50 flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur sm:px-4">
        <a href="#" className="flex shrink-0 items-center gap-2" aria-label="开发工具首页">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-bold text-white shadow-sm">
            {'</>'}
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-slate-900 sm:block">开发工具</span>
        </a>

        <span className="h-5 w-px bg-slate-200" />

        <nav className="flex min-w-0 flex-wrap items-center gap-1" aria-label="工具类型">
          {TOOLS.map((tool) => {
            const active = tool.id === activeTool
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ' +
                  (active
                    ? 'bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.12)]'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')
                }
              >
                <span className="font-mono text-[11px] text-blue-600">{tool.icon}</span>
                {tool.name}
              </button>
            )
          })}
          {SITES.map((site) => (
            <a
              key={site.url}
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <span className="font-mono text-[11px] text-blue-600">↗</span>
              {site.name}
            </a>
          ))}
        </nav>
      </header>

      <Active />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
