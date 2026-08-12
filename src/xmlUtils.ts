// XML 处理核心逻辑：格式化 / 压缩 / 校验 / 转义 / 反转义 / XML⇄JSON 转换

export interface ValidateResult {
  ok: boolean
  message: string
  line?: number
  column?: number
}

/** XML 转义 */
export function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** XML 反转义 */
export function unescape(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** 使用 DOMParser 解析 XML，解析失败时抛出 Error */
function parseXml(text: string): Document {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    // 提取第一行错误信息（DOMParser 的错误文本通常包含行列号）
    const raw = parseError.textContent || 'XML 解析错误'
    const firstLine = raw.split('\n').find((l) => l.trim()) || raw
    throw new Error(firstLine.trim())
  }
  return doc
}

/** 校验 XML 是否合法 */
export function validate(text: string): ValidateResult {
  if (!text.trim()) {
    return { ok: false, message: '内容为空' }
  }
  try {
    parseXml(text)
    return { ok: true, message: '✓ XML 合法' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}

/** 递归序列化 DOM 节点为带缩进的字符串 */
function serializeNode(node: Node, indent: number, indentStr: string): string {
  const pad = indentStr.repeat(indent)

  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const el = node as Element
      const attrs = Array.from(el.attributes)
        .map((a) => `${a.name}="${a.value}"`)
        .join(' ')
      const attrStr = attrs ? ' ' + attrs : ''

      const childNodes = Array.from(el.childNodes)
      const hasElementChildren = childNodes.some((c) => c.nodeType === Node.ELEMENT_NODE)
      const textContent = el.textContent?.trim() || ''

      if (childNodes.length === 0) {
        return `${pad}<${el.nodeName}${attrStr}/>`
      }
      if (!hasElementChildren && textContent) {
        return `${pad}<${el.nodeName}${attrStr}>${textContent}</${el.nodeName}>`
      }
      const childLines: string[] = []
      for (const child of childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent?.trim()
          if (text) childLines.push(`${indentStr.repeat(indent + 1)}${text}`)
        } else if (child.nodeType === Node.COMMENT_NODE) {
          childLines.push(`${indentStr.repeat(indent + 1)}<!--${child.textContent}-->`)
        } else if (child.nodeType === Node.CDATA_SECTION_NODE) {
          childLines.push(`${indentStr.repeat(indent + 1)}<![CDATA[${child.textContent}]]>`)
        } else {
          const serialized = serializeNode(child, indent + 1, indentStr)
          if (serialized) childLines.push(serialized)
        }
      }
      return `${pad}<${el.nodeName}${attrStr}>\n${childLines.join('\n')}\n${pad}</${el.nodeName}>`
    }
    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction
      return `${pad}<?${pi.target} ${pi.data}?>`
    }
    case Node.COMMENT_NODE: {
      return `${pad}<!--${node.textContent}-->`
    }
    case Node.DOCUMENT_TYPE_NODE: {
      return `${pad}<!DOCTYPE ${node.nodeName}>`
    }
    default:
      return ''
  }
}

/** 格式化（美化），indent 为缩进空格数 */
export function format(text: string, indent = 2): string {
  const doc = parseXml(text)
  const indentStr = ' '.repeat(indent)
  const lines: string[] = []

  // 检查原文是否有 XML 声明
  const declMatch = text.match(/^<\?xml\s[^?]*\?>/)
  if (declMatch) {
    lines.push(declMatch[0])
  }

  for (const child of Array.from(doc.childNodes)) {
    if (
      child.nodeType === Node.ELEMENT_NODE ||
      child.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
      child.nodeType === Node.COMMENT_NODE ||
      child.nodeType === Node.DOCUMENT_TYPE_NODE
    ) {
      const serialized = serializeNode(child, 0, indentStr)
      if (serialized) lines.push(serialized)
    }
  }

  return lines.join('\n')
}

/** 压缩为单行（去除换行和多余空格） */
export function minify(text: string): string {
  const doc = parseXml(text)
  const serializer = new XMLSerializer()
  let result = serializer.serializeToString(doc)
  result = result.replace(/>\s+</g, '><').trim()
  return result
}

// ── XML ⇄ JSON 转换 ──

/** XML 元素节点转 JSON 值 */
function xmlNodeToJson(node: Element): unknown {
  const obj: Record<string, unknown> = {}

  // 属性 → @attr
  for (const attr of Array.from(node.attributes)) {
    obj[`@${attr.name}`] = attr.value
  }

  const childElements = Array.from(node.children)
  const textContent = node.textContent?.trim()

  if (childElements.length === 0) {
    // 叶子节点
    if (Object.keys(obj).length > 0) {
      if (textContent) obj['#text'] = textContent
      return obj
    }
    return textContent || ''
  }

  // 子元素按 tag name 分组
  const grouped: Record<string, unknown[]> = {}
  for (const child of childElements) {
    const name = child.nodeName
    if (!grouped[name]) grouped[name] = []
    grouped[name].push(xmlNodeToJson(child))
  }

  for (const [name, values] of Object.entries(grouped)) {
    obj[name] = values.length === 1 ? values[0] : values
  }

  // 如果有文本内容混在子元素中
  if (textContent && Object.keys(obj).length > 0) {
    // 检查 textContent 是否不仅仅是子元素的文本
    const onlyChildText = childElements.every((c) => c.textContent?.trim() === '')
    if (!onlyChildText && textContent) {
      obj['#text'] = textContent
    }
  }

  return obj
}

/** XML 转 JSON */
export function toJson(text: string, indent = 2): string {
  const doc = parseXml(text)
  const root = doc.documentElement
  if (!root) throw new Error('未找到根元素')

  const result: Record<string, unknown> = {}
  result[root.nodeName] = xmlNodeToJson(root)

  return JSON.stringify(result, null, indent)
}

/** JSON 转 XML */
export function fromJson(jsonText: string, indent = 2): string {
  const data = JSON.parse(jsonText)

  function buildXml(name: string, value: unknown, level: number): string {
    const pad = ' '.repeat(indent * level)

    if (value === null || value === undefined) {
      return `${pad}<${name}/>`
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return `${pad}<${name}>${escape(String(value))}</${name}>`
    }

    if (Array.isArray(value)) {
      return value.map((v) => buildXml(name, v, level)).join('\n')
    }

    // 对象
    const obj = value as Record<string, unknown>
    const attrs: string[] = []
    const children: string[] = []
    let textContent = ''

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@')) {
        attrs.push(`${key.slice(1)}="${escape(String(val))}"`)
      } else if (key === '#text') {
        textContent = escape(String(val))
      } else {
        const child = buildXml(key, val, level + 1)
        if (child) children.push(child)
      }
    }

    const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''

    if (children.length === 0 && !textContent) {
      return `${pad}<${name}${attrStr}/>`
    }
    if (children.length === 0) {
      return `${pad}<${name}${attrStr}>${textContent}</${name}>`
    }

    return `${pad}<${name}${attrStr}>\n${children.join('\n')}\n${pad}</${name}>`
  }

  const entries = Object.entries(data)
  if (entries.length !== 1) {
    throw new Error('JSON 根必须是包含单个键的对象')
  }

  const [rootName, rootValue] = entries[0]
  return buildXml(rootName, rootValue, 0)
}
