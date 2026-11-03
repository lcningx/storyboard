// 评论：人在网页上写，AI 在 CLI 里读、回复、结案。
// 存在项目目录的 comments.json，和剧情数据分开，两边同时写也不会互相覆盖。

import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './load.js';

export const COMMENTS_FILE = 'comments.json';
export const COMMENT_STATUS = ['待处理', '讨论中', '已采纳', '已拒绝', '已解决'];
export const OPEN_STATUS = ['待处理', '讨论中'];
const RESOLVE_AS = { 采纳: '已采纳', 拒绝: '已拒绝', 解决: '已解决' };

function now() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 读评论；文件不存在时是空列表，格式坏了时带 error，不抛出。 */
export function readComments(dir) {
  const file = path.join(dir, COMMENTS_FILE);
  if (!fs.existsSync(file)) return { comments: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(data) ? data : data?.comments;
    if (!Array.isArray(list)) return { comments: [], error: '顶层应为 { "comments": [...] }' };
    return { comments: list.filter((c) => c && typeof c === 'object') };
  } catch (err) {
    return { comments: [], error: `JSON 解析失败：${err.message}` };
  }
}

// 先写临时文件再改名，网页和 CLI 同时写时不会读到半截文件
function writeComments(project, comments) {
  const file = path.join(project.dir, COMMENTS_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ comments }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  project.comments = comments;
}

function load(project) {
  const { comments, error } = readComments(project.dir);
  if (error) throw new UserError(`${COMMENTS_FILE}：${error}`);
  return comments;
}

/** "ep01.sh12#2" → { id: "ep01.sh12", line: 2 }；不带 # 时 line 为 null。 */
export function parseTarget(target) {
  const m = String(target || '').match(/^(.+?)(?:#(\d+))?$/);
  return { id: m ? m[1] : '', line: m && m[2] ? Number(m[2]) : null };
}

function isProjectId(project, id) {
  return Boolean(project.project) && (id === project.slug || id === project.project.id);
}

/** 评论目标是否还在：条目存在；指向台词时，那一句也还在。 */
export function targetExists(project, target) {
  const { id, line } = parseTarget(target);
  if (isProjectId(project, id)) return line === null;
  const entry = project.index.get(id);
  if (!entry) return false;
  if (line === null) return true;
  return entry.type === 'shot' && Array.isArray(entry.data.lines) && line >= 1 && line <= entry.data.lines.length;
}

/** 评论时的原文：台词、镜头画面，或条目的名字和一句话。 */
export function quoteOf(project, target) {
  const { id, line } = parseTarget(target);
  if (isProjectId(project, id)) return project.project.name || id;
  const entry = project.index.get(id);
  if (!entry) return '';
  const d = entry.data;
  if (line !== null) {
    const l = d.lines?.[line - 1];
    return l ? `${project.index.get(l.who)?.data?.name || l.who}：${l.text}` : '';
  }
  if (entry.type === 'shot') return d.frame || '';
  return [d.name, d.summary].filter(Boolean).join(' · ');
}

function findComment(comments, id) {
  const c = comments.find((x) => x.id === id);
  if (!c) throw new UserError(`找不到评论：${id}`);
  return c;
}

function requireText(text) {
  const t = String(text || '').trim();
  if (!t) throw new UserError('评论内容不能为空');
  return t;
}

export function addComment(project, { target, text, by = '用户' }) {
  const comments = load(project);
  if (!targetExists(project, target)) throw new UserError(`评论的目标不存在：${target}`);
  const next = comments.reduce((n, c) => Math.max(n, Number(String(c.id).replace(/^c/, '')) || 0), 0) + 1;
  const at = now();
  const comment = {
    id: `c${next}`,
    target,
    quote: quoteOf(project, target),
    status: '待处理',
    createdAt: at,
    thread: [{ by, text: requireText(text), at }],
  };
  writeComments(project, [...comments, comment]);
  return comment;
}

export function replyComment(project, id, { text, by }) {
  const comments = load(project);
  const c = findComment(comments, id);
  c.thread = [...(Array.isArray(c.thread) ? c.thread : []), { by, text: requireText(text), at: now() }];
  // 一方回了话就进入讨论；结了案的被用户再回复，说明还没完，重新打开
  if (c.status === '待处理' || (by === '用户' && !OPEN_STATUS.includes(c.status))) c.status = '讨论中';
  writeComments(project, comments);
  return c;
}

export function resolveComment(project, id, { as, note, by = 'AI' }) {
  const status = RESOLVE_AS[as];
  if (!status) throw new UserError(`--as 只能是：${Object.keys(RESOLVE_AS).join('、')}`);
  const comments = load(project);
  const c = findComment(comments, id);
  const at = now();
  c.status = status;
  c.resolution = { status, note: String(note || '').trim(), by, at };
  c.thread = [...(Array.isArray(c.thread) ? c.thread : []), { by, text: `【${status}】${c.resolution.note}`.trim(), at }];
  writeComments(project, comments);
  return c;
}
