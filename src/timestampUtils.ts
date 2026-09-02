// 时间戳转换核心逻辑：不同长度时间戳（秒/毫秒/微秒/纳秒）⇄ 标准时间（本地时区）

export type TsUnit = 's' | 'ms' | 'us' | 'ns'

/** 单位中文名 */
export const UNIT_LABEL: Record<TsUnit, string> = { s: '秒', ms: '毫秒', us: '微秒', ns: '纳秒' }

/** Date 可表示的毫秒范围边界：±8.64e15 */
const MAX_MS = 8_640_000_000_000_000n

function pad(n: number | bigint, width: number): string {
  return String(n).padStart(width, '0')
}

/** 按位数推断单位：≤10 位按秒、11–13 位按毫秒、14–16 位按微秒、其余按纳秒 */
function detectUnit(digits: string): TsUnit {
  const len = digits.length
  if (len <= 10) return 's'
  if (len <= 13) return 'ms'
  if (len <= 16) return 'us'
  return 'ns'
}

/** BigInt 向下取整除法（原生 / 向零截断，负时间戳需 floor 才能与余数拼回原值） */
function divFloor(a: bigint, b: bigint): bigint {
  const q = a / b
  if (a % b !== 0n && (a < 0n) !== (b < 0n)) return q - 1n
  return q
}

/**
 * 解析时间戳字符串：unit 缺省时按位数自动识别。
 * 返回对应 Date 及毫秒以下的小数位（微秒 3 位 / 纳秒 6 位，用于无损展示）。
 */
export function parseTimestamp(
  value: string,
  unit?: TsUnit,
): { date: Date; unit: TsUnit; frac: string } {
  const t = value.trim()
  if (!/^-?\d+$/.test(t)) throw new Error('时间戳必须是纯数字')
  const u = unit ?? detectUnit(t.replace(/^-/, ''))
  const big = BigInt(t)
  const msBig =
    u === 's' ? big * 1000n : u === 'ms' ? big : u === 'us' ? divFloor(big, 1000n) : divFloor(big, 1_000_000n)
  if (msBig > MAX_MS || msBig < -MAX_MS) throw new Error('超出 Date 可表示的时间范围')
  const date = new Date(Number(msBig))
  const frac =
    u === 'us'
      ? pad(((big % 1000n) + 1000n) % 1000n, 3)
      : u === 'ns'
        ? pad(((big % 1_000_000n) + 1_000_000n) % 1_000_000n, 6)
        : ''
  return { date, unit: u, frac }
}

/** Date → 本地标准时间 YYYY-MM-DD HH:mm:ss */
export function formatDate(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)} ` +
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}`
  )
}

/** Date → 带单位精度的标准时间（毫秒及以上补小数部分） */
export function formatFromDate(date: Date, unit: TsUnit, frac = ''): string {
  if (unit === 's') return formatDate(date)
  return `${formatDate(date)}.${pad(date.getMilliseconds(), 3)}${frac}`
}

/** 时间戳 → 标准时间。unit 缺省时按位数自动识别，指定时按指定单位解析 */
export function tsToDate(value: string, unit?: TsUnit): string {
  const { date, unit: u, frac } = parseTimestamp(value, unit)
  return formatFromDate(date, u, frac)
}

/** 解析标准时间为 Date（本地时区；兼容 2023/10/25、2023-10-25 20:00:00、ISO 8601 等） */
export function parseDate(value: string): Date {
  const t = value.trim()
  if (!t) throw new Error('内容为空')
  const withDashes = t.replace(/\//g, '-')
  // 纯日期（无时间）按本地零点解析，避免 ISO 日期字符串被当作 UTC 产生时区偏移
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(withDashes)) {
    const [y, m, d] = withDashes.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  // 日期与时间之间可有多个空格；归一化后以 T 分隔（Safari 不认空格格式）
  const s = withDashes.replace(
    /^(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/,
    '$1T$2',
  )
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) throw new Error('无法解析的日期')
  return d
}

/** 标准时间 → 时间戳（指定单位；微秒/纳秒用 BigInt 保证精度） */
export function dateToTs(value: string, unit: TsUnit): string {
  const raw = value.trim()
  const fraction = raw.match(/[T ]\d{1,2}:\d{2}:\d{2}\.(\d+)/)?.[1] ?? ''
  // Date 只保留毫秒；先截取前三位，再把剩余小数位补回微秒/纳秒结果。
  const normalized = raw.replace(/(\d{1,2}:\d{2}:\d{2})\.(\d+)/, (_, time, digits) => {
    return `${time}.${digits.slice(0, 3)}`
  })
  const ms = parseDate(normalized).getTime()
  if (unit === 's') return String(Math.floor(ms / 1000))
  if (unit === 'ms') return String(ms)
  const scale = unit === 'us' ? 1000n : 1_000_000n
  const extraDigits = unit === 'us' ? 3 : 6
  const extra = BigInt(fraction.slice(3, 3 + extraDigits).padEnd(extraDigits, '0') || '0')
  return (BigInt(ms) * scale + extra).toString()
}

/** 批量：将文本中 10/13/16/19 位的独立数字串替换为标准时间（避免误伤手机号等） */
export function batchTsToDate(text: string): { text: string; count: number } {
  let count = 0
  const out = text.replace(/(?<![\d.])-?(?:\d{10}|\d{13}|\d{16}|\d{19})(?![\d.])/g, (m) => {
    try {
      const result = tsToDate(m)
      count++
      return result
    } catch {
      // 长数字不一定是合法时间戳，保留原文并继续处理其他匹配项。
      return m
    }
  })
  return { text: out, count }
}

/** 当前时区标签，如 UTC+08:00 */
export function tzOffsetLabel(): string {
  const off = -new Date().getTimezoneOffset()
  const abs = Math.abs(off)
  return `UTC${off >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60), 2)}:${pad(abs % 60, 2)}`
}
