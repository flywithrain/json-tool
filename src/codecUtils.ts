// 编解码核心逻辑：URL / Base64 / HTML 实体 / Unicode 转义

/** URL 编码（component） */
export function urlEncode(text: string): string {
  return encodeURIComponent(text)
}

/** URL 解码（component） */
export function urlDecode(text: string): string {
  return decodeURIComponent(text)
}

/** Base64 编码（支持 Unicode） */
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Base64 解码（支持 Unicode） */
export function base64Decode(text: string): string {
  const binary = atob(text.trim())
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** HTML 实体编码 */
export function htmlEncode(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** HTML 实体解码（借助 textarea，安全且支持命名/数字实体） */
export function htmlDecode(text: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = text
  return el.value
}

/** Unicode 转义：非 ASCII 字符转为 \uXXXX 或 \u{XXXXX} */
export function unicodeEscape(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code > 0xffff) {
      out += '\\u{' + code.toString(16) + '}'
    } else if (code > 127) {
      out += '\\u' + code.toString(16).padStart(4, '0')
    } else {
      out += ch
    }
  }
  return out
}

/** Unicode 反转义：\uXXXX 与 \u{XXXXX} 还原为字符 */
export function unicodeUnescape(text: string): string {
  return text.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, braced, hex) => {
    const code = parseInt(braced ?? hex, 16)
    return String.fromCodePoint(code)
  })
}
