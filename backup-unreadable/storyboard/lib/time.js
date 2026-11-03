// 时间字符串 "m:ss" / "mm:ss" 与秒的互转。

const TIME_RE = /^(\d{1,3}):([0-5]\d)$/;

/** 解析 "m:ss" 为秒；格式不对返回 null。 */
export function parseTime(value) {
  if (typeof value !== 'string') return null;
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 秒 -> "m:ss"。 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '?';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 秒差 -> "+m:ss" / "-m:ss"。 */
export function formatDelta(seconds) {
  const sign = seconds < 0 ? '-' : '+';
  return sign + formatTime(Math.abs(seconds));
}

/** 允许 "5"、"05"、"ep05" 这类集号输入，统一成 epNN。 */
export function normalizeEpisodeId(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^ep\d{2}$/i.test(v)) return v.toLowerCase();
  if (/^\d{1,3}$/.test(v)) return `ep${v.padStart(2, '0')}`;
  return null;
}
