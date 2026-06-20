// JSON 处理核心逻辑：格式化 / 压缩 / 转义 / 去转义 / 校验 / 二次强制转义（嵌套解析）

export interface ValidateResult {
  ok: boolean
  message: string
  line?: number
  column?: number
}

/** 根据字符偏移量计算行列号（从 1 开始） */
function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let column = 1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

/** 从 JSON.parse 抛出的错误信息中尽量解析出行列位置 */
function describeParseError(text: string, err: unknown): ValidateResult {
  const message = err instanceof Error ? err.message : String(err)

  // V8: "... at position 123 (line 4 column 5)" / "... at position 123"
  const posMatch = message.match(/at position (\d+)/)
  const lineColMatch = message.match(/line (\d+) column (\d+)/)

  if (lineColMatch) {
    return {
      ok: false,
      message,
      line: Number(lineColMatch[1]),
      column: Number(lineColMatch[2]),
    }
  }
  if (posMatch) {
    const { line, column } = offsetToLineCol(text, Number(posMatch[1]))
    return { ok: false, message, line, column }
  }
  return { ok: false, message }
}

/** 校验 JSON 是否合法 */
export function validate(text: string): ValidateResult {
  if (!text.trim()) {
    return { ok: false, message: '内容为空' }
  }
  try {
    JSON.parse(text)
    return { ok: true, message: '✓ JSON 合法' }
  } catch (err) {
    return describeParseError(text, err)
  }
}

/** 格式化（美化），indent 为缩进空格数 */
export function format(text: string, indent = 2): string {
  return JSON.stringify(JSON.parse(text), null, indent)
}

/** 压缩为单行 */
export function minify(text: string): string {
  return JSON.stringify(JSON.parse(text))
}

/**
 * 转义：把当前文本转成可以嵌入到另一个字符串里的转义文本（不含外层引号）。
 * 例如 {"a":1} -> {\"a\":1}
 */
export function escape(text: string): string {
  const s = JSON.stringify(text)
  return s.slice(1, -1)
}

/**
 * 去转义：把被转义的字符串还原。
 * 兼容两种输入：带外层引号的字符串字面量，或不带引号的纯转义内容。
 */
export function unescape(text: string): string {
  const trimmed = text.trim()
  // 形如 "....." 的完整字符串字面量
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'string') return parsed
  }
  // 当作不带引号的转义内容处理
  return JSON.parse('"' + trimmed.replace(/\n/g, '\\n') + '"')
}

function looksLikeJsonContainer(s: string): boolean {
  const t = s.trim()
  return t.startsWith('{') || t.startsWith('[')
}

export interface ForceUnescapeResult {
  /** 处理后的文本（changed 为 false 时为格式化后的原内容） */
  text: string
  /** 本次是否真的去掉了某一层引号 */
  changed: boolean
}

/**
 * 去掉「一层」转义：遍历整棵 JSON，把当前处于字符串形式、内容又是 JSON 对象/数组的值
 * 解析成真正的对象/数组（去掉这层引号）。已经是对象/数组的分支继续向内遍历查找。
 * 注意：对解析出来的结果不再深入展开——嵌套多层时，点一次去一层。
 */
function unwrapOneLevel(value: unknown, ctx: { changed: boolean }): unknown {
  if (typeof value === 'string') {
    if (looksLikeJsonContainer(value)) {
      try {
        const parsed = JSON.parse(value)
        if (parsed !== null && typeof parsed === 'object') {
          ctx.changed = true
          return parsed // 只去一层，不再递归 parsed 内部
        }
      } catch {
        // 不是合法 JSON，保持原字符串
      }
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => unwrapOneLevel(v, ctx))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = unwrapOneLevel(v, ctx)
    }
    return out
  }
  return value
}

/**
 * 强制去除转义：先解析整个 JSON，再去掉一层引号（见 unwrapOneLevel）。
 * 若本次没有任何可去除的转义，changed 返回 false。indent=0 时输出压缩单行。
 */
export function forceUnescape(text: string, indent = 2): ForceUnescapeResult {
  const root = JSON.parse(text)
  const ctx = { changed: false }
  const result = unwrapOneLevel(root, ctx)
  return {
    text: JSON.stringify(result, null, indent || undefined),
    changed: ctx.changed,
  }
}
