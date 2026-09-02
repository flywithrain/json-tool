// 时间戳转换核心逻辑：不同长度时间戳（秒/毫秒/微秒/纳秒）⇄ 标准时间（可选时区）

export type TsUnit = 's' | 'ms' | 'us' | 'ns'

/** 单位中文名 */
export const UNIT_LABEL: Record<TsUnit, string> = { s: '秒', ms: '毫秒', us: '微秒', ns: '纳秒' }

/**
 * 时区选项：'local' 表示系统本地时区，其余为 IANA 时区名（如 Asia/Shanghai、UTC）。
 * 采用 IANA 时区名而非固定偏移，可自动处理夏令时与半小时偏移（印度 +5:30、纽芬兰 -3:30 等）。
 */
export type TzOption = 'local' | string

const formatterCache = new Map<string, Intl.DateTimeFormat | null>()

/** 取（缓存的）时区格式化器；时区名非法或环境不支持时返回 null */
function ianaFormatter(iana: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(iana)
  if (cached !== undefined) return cached
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  } as const
  let f: Intl.DateTimeFormat | null = null
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', ...options })
  } catch {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: iana, hour12: false, ...options })
    } catch {
      f = null
    }
  }
  formatterCache.set(iana, f)
  return f
}

/** 某时刻在 IANA 时区的偏移分钟数；无法计算时返回 null */
export function ianaOffsetMinutes(date: Date, iana: string): number | null {
  const f = ianaFormatter(iana)
  if (!f) return null
  const p: Record<string, number> = {}
  for (const part of f.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  if (!p.year || !p.month || !p.day) return null
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour || 0, p.minute || 0, p.second || 0)
  // 墙钟为秒精度，与真实偏移相差不足 1 秒；取整到分钟后归一化到 (-720, 720]
  const diff = Math.round((wall - date.getTime()) / 60_000)
  return (((diff % 1440) + 1440 + 720) % 1440) - 720
}

/** 固定偏移时区值前缀，形如 offset:480（东八区） */
const OFFSET_PREFIX = 'offset:'

/** 指定时刻在目标时区的偏移分钟数（local 取该时刻的系统偏移，自动含夏令时） */
export function offsetMinutesAt(date: Date, tz: TzOption = 'local'): number {
  if (tz === 'local') return -date.getTimezoneOffset()
  if (tz.startsWith(OFFSET_PREFIX)) return Number(tz.slice(OFFSET_PREFIX.length)) || 0
  return ianaOffsetMinutes(date, tz) ?? -date.getTimezoneOffset()
}

/**
 * 时区选项：value 为 'local' / IANA 名（如 Asia/Shanghai）/ offset:<分钟数>。
 * name 为跟随偏移一起展示的时区名，固定偏移项省略。
 */
export interface TzZone {
  value: string
  name?: string
}

/** 下拉分组：每项统一显示为「UTC 偏移 + 时区名」，如 UTC+08:00 Asia/Shanghai */
export interface TzGroup {
  label: string
  zones: TzZone[]
}

const asZones = (names: string[]): TzZone[] => names.map((value) => ({ value, name: value }))

/** 固定偏移项（无夏令时）：offset:<分钟数> */
const fixed = (minutes: number): TzZone => ({ value: `offset:${minutes}` })

export const TZ_GROUPS: TzGroup[] = [
  {
    label: 'Common',
    zones: [
      { value: 'local', name: 'Local' },
      { value: 'UTC' },
    ],
  },
  {
    label: 'Asia',
    zones: asZones([
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Taipei',
      'Asia/Singapore',
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Kolkata',
      'Asia/Kathmandu',
      'Asia/Karachi',
      'Asia/Dubai',
      'Asia/Tehran',
      'Asia/Jerusalem',
    ]),
  },
  {
    label: 'Europe / Africa',
    zones: asZones([
      'Europe/Moscow',
      'Europe/Istanbul',
      'Europe/Berlin',
      'Europe/Paris',
      'Europe/Madrid',
      'Europe/London',
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Lagos',
    ]),
  },
  {
    label: 'America',
    zones: asZones([
      'America/Sao_Paulo',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/St_Johns',
    ]),
  },
  {
    label: 'Oceania',
    zones: asZones([
      'Pacific/Auckland',
      'Australia/Sydney',
      'Australia/Adelaide',
      'Australia/Perth',
      'Pacific/Honolulu',
    ]),
  },
  {
    label: 'UTC Offset (no DST)',
    zones: [fixed(14 * 60), fixed(13 * 60), fixed(-11 * 60), fixed(-12 * 60)],
  },
]

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

/** Date → 指定时区的标准时间 YYYY-MM-DD HH:mm:ss（tz 缺省为本地时区） */
export function formatDate(date: Date, tz: TzOption = 'local'): string {
  // 加上目标时区偏移后用 UTC 取值，即为该时区的墙钟时间
  const d = new Date(date.getTime() + offsetMinutesAt(date, tz) * 60_000)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`
  )
}

/** Date → 带单位精度的标准时间（毫秒及以上补小数部分） */
export function formatFromDate(date: Date, unit: TsUnit, frac = '', tz: TzOption = 'local'): string {
  if (unit === 's') return formatDate(date, tz)
  return `${formatDate(date, tz)}.${pad(date.getMilliseconds(), 3)}${frac}`
}

/** 时间戳 → 标准时间。unit 缺省时按位数自动识别，指定时按指定单位解析 */
export function tsToDate(value: string, unit?: TsUnit, tz: TzOption = 'local'): string {
  const { date, unit: u, frac } = parseTimestamp(value, unit)
  return formatFromDate(date, u, frac, tz)
}

/** 日期时间字段：YYYY-MM-DD[ T]HH:mm[:ss[.SSS]]，时间部分可缺省（按零点） */
const WALL_CLOCK_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?)?/

/**
 * 将「无时区信息的墙钟时间」按目标时区还原为绝对时间。
 * 先按 UTC 组装字段得到初值，再用该时刻的时区偏移回退；迭代两次以消除夏令时切换边界的偏差。
 */
function parseWallClock(t: string, tz: TzOption): Date | null {
  const m = t.replace(/\//g, '-').match(WALL_CLOCK_RE)
  if (!m) return null
  const msField = m[7] ? Number(m[7].padEnd(3, '0')) : 0
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), msField)
  let ts = guess
  for (let i = 0; i < 2; i++) ts = guess - offsetMinutesAt(new Date(ts), tz) * 60_000
  return new Date(ts)
}

/**
 * 解析标准时间为 Date（兼容 2023/10/25、2023-10-25 20:00:00、ISO 8601 等）。
 * 输入的墙钟时间按 tz 指定时区解释；已自带 Z / ±hh:mm 的按绝对时间解析，不受时区选项影响。
 */
export function parseDate(value: string, tz: TzOption = 'local'): Date {
  const t = value.trim()
  if (!t) throw new Error('内容为空')
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(t)) {
    const abs = new Date(t)
    if (!Number.isNaN(abs.getTime())) return abs
  }
  const wall = parseWallClock(t, tz)
  if (wall && !Number.isNaN(wall.getTime())) return wall
  // 其他写法（如 Oct 25, 2023）：先按本地解析，再修正为目标时区下的同一墙钟时间
  const s = t.replace(/\//g, '-').replace(/^(\d{4}-\d{1,2}-\d{1,2})\s+/, '$1T')
  const local = new Date(s)
  if (Number.isNaN(local.getTime())) throw new Error('无法解析的日期')
  const shift = (-local.getTimezoneOffset() - offsetMinutesAt(local, tz)) * 60_000
  return new Date(local.getTime() + shift)
}

/** 标准时间 → 时间戳（指定单位；微秒/纳秒用 BigInt 保证精度） */
export function dateToTs(value: string, unit: TsUnit, tz: TzOption = 'local'): string {
  const raw = value.trim()
  const fraction = raw.match(/[T ]\d{1,2}:\d{2}:\d{2}\.(\d+)/)?.[1] ?? ''
  // Date 只保留毫秒；先截取前三位，再把剩余小数位补回微秒/纳秒结果。
  const normalized = raw.replace(/(\d{1,2}:\d{2}:\d{2})\.(\d+)/, (_, time, digits) => {
    return `${time}.${digits.slice(0, 3)}`
  })
  const ms = parseDate(normalized, tz).getTime()
  if (unit === 's') return String(Math.floor(ms / 1000))
  if (unit === 'ms') return String(ms)
  const scale = unit === 'us' ? 1000n : 1_000_000n
  const extraDigits = unit === 'us' ? 3 : 6
  const extra = BigInt(fraction.slice(3, 3 + extraDigits).padEnd(extraDigits, '0') || '0')
  return (BigInt(ms) * scale + extra).toString()
}

/** 批量：将文本中 10/13/16/19 位的独立数字串替换为标准时间（避免误伤手机号等） */
export function batchTsToDate(text: string, unit?: TsUnit, tz: TzOption = 'local'): { text: string; count: number } {
  let count = 0
  const out = text.replace(/(?<![\d.])-?(?:\d{10}|\d{13}|\d{16}|\d{19})(?![\d.])/g, (m) => {
    try {
      const result = tsToDate(m, unit, tz)
      count++
      return result
    } catch {
      // 长数字不一定是合法时间戳，保留原文并继续处理其他匹配项。
      return m
    }
  })
  return { text: out, count }
}

/** 转换方向：auto=按行内容判断（纯数字→时间，否则→时间戳） */
export type Direction = 'auto' | 'ts2date' | 'date2ts'

/** 单位选择：auto=时间戳按位数识别，时间转时间戳时按毫秒 */
export type UnitChoice = 'auto' | TsUnit

export interface ConvertResult {
  /** 与输入行一一对应的结果行 */
  lines: string[]
  /** 成功转换的行数（空行不计） */
  ok: number
  /** 转换失败的行数 */
  fail: number
}

const PURE_TS = /^-?\d+$/

/** 单行转换：失败时返回以 ✗ 开头的错误说明，保证与输入行一一对应 */
function convertOne(
  line: string,
  dir: Direction,
  unit: UnitChoice,
  tz: TzOption = 'local',
): { ok: boolean; text: string } {
  const t = line.trim()
  if (!t) return { ok: true, text: '' }
  const d = dir === 'auto' ? (PURE_TS.test(t) ? 'ts2date' : 'date2ts') : dir
  try {
    if (d === 'ts2date') return { ok: true, text: tsToDate(t, unit === 'auto' ? undefined : unit, tz) }
    return { ok: true, text: dateToTs(t, unit === 'auto' ? 'ms' : unit, tz) }
  } catch (e) {
    return { ok: false, text: `✗ ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 按行转换：每行独立处理，空行保持空行，行号与输入严格对应 */
export function convertLines(
  text: string,
  dir: Direction,
  unit: UnitChoice,
  tz: TzOption = 'local',
): ConvertResult {
  const lines: string[] = []
  let ok = 0
  let fail = 0
  for (const line of text.split(/\r?\n/)) {
    const r = convertOne(line, dir, unit, tz)
    lines.push(r.text)
    if (!line.trim()) continue
    if (r.ok) ok++
    else fail++
  }
  return { lines, ok, fail }
}

/** 按行批量替换：保留整段文本结构，仅将其中的独立时间戳替换为标准时间 */
export function convertBatch(text: string, unit?: TsUnit, tz: TzOption = 'local'): ConvertResult {
  let ok = 0
  const lines = text.split(/\r?\n/).map((line) => {
    const r = batchTsToDate(line, unit, tz)
    ok += r.count
    return r.text
  })
  return { lines, ok, fail: 0 }
}

/** 时区偏移标签：整点显示 UTC+8，非整点显示 UTC+5:30 */
export function tzOffsetLabel(tz: TzOption = 'local', at: Date = new Date()): string {
  const off = offsetMinutesAt(at, tz)
  const abs = Math.abs(off)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${off >= 0 ? '+' : '-'}${h}${m === 0 ? '' : `:${pad(m, 2)}`}`
}

/** 下拉项标签：「UTC 偏移 + 时区名」，如 UTC+08:00 Asia/Shanghai；固定偏移仅显示偏移 */
export function tzZoneLabel(zone: TzZone, at: Date = new Date()): string {
  const off = tzOffsetLabel(zone.value, at)
  return zone.name ? `${off} ${zone.name}` : off
}

/** 按 value 查找下拉项（未命中时以 value 本身作为时区名） */
export function findTzZone(value: TzOption): TzZone {
  for (const group of TZ_GROUPS) {
    const zone = group.zones.find((z) => z.value === value)
    if (zone) return zone
  }
  return { value, name: value === 'local' ? 'Local' : value }
}
