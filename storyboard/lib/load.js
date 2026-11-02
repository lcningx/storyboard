// 读取项目、解析 JSON、建立索引与反查关系。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECTS_DIR = path.join(ROOT, 'projects');

export const DIR_TYPES = [
  { dir: 'characters', type: 'character', prefix: 'char.' },
  { dir: 'world', type: 'world', prefix: 'world.' },
  { dir: 'threads', type: 'thread', prefix: 'thread.' },
  { dir: 'units', type: 'unit', prefix: 'unit.' },
  { dir: 'episodes', type: 'episode', prefix: 'ep' },
];

export const TYPE_LABEL = {
  project: '项目',
  character: '角色',
  world: '世界',
  thread: '贯穿线',
  unit: '单元',
  episode: '集',
  highlight: '高光',
  setup: '铺垫',
  event: '事件',
  scene: '场次',
};

export const TYPE_ORDER = ['project', 'character', 'world', 'thread', 'unit', 'episode'];

const SUB_KEYS = [
  ['highlights', 'highlight'],
  ['setups', 'setup'],
  ['events', 'event'],
  ['scenes', 'scene'],
];

export class UserError extends Error {}

function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('顶层必须是 JSON 对象');
    }
    return { data };
  } catch (err) {
    const msg = err instanceof SyntaxError ? `JSON 解析失败：${err.message}` : err.message;
    return { error: msg };
  }
}

/** 项目目录列表，附带 project.json 里的名字（读不到就跳过名字）。 */
export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((slug) => {
      const { data } = readJson(path.join(PROJECTS_DIR, slug, 'project.json'));
      return { slug, name: data?.name || slug, summary: data?.summary || '' };
    });
}

export function resolveProjectSlug(slug) {
  const projects = listProjects();
  if (projects.length === 0) {
    throw new UserError(`没有找到项目：${PROJECTS_DIR} 下没有子目录`);
  }
  if (slug) {
    const found = projects.find((p) => p.slug === slug);
    if (!found) {
      throw new UserError(
        `找不到项目 "${slug}"，可选：${projects.map((p) => p.slug).join('、')}`,
      );
    }
    return slug;
  }
  if (projects.length === 1) return projects[0].slug;
  throw new UserError(
    `有多个项目，请用 --project 指定：${projects.map((p) => p.slug).join('、')}`,
  );
}

/** 读取一个项目目录（供测试直接指定目录）。 */
export function loadProjectDir(dir, slug = path.basename(dir)) {
  const files = [];
  const entries = [];
  const duplicates = [];
  const index = new Map();
  let project = null;

  if (!fs.existsSync(dir)) throw new UserError(`项目目录不存在：${dir}`);

  const projectFile = path.join(dir, 'project.json');
  const projectResult = fs.existsSync(projectFile)
    ? readJson(projectFile)
    : { error: '缺少 project.json' };
  if (projectResult.data) {
    project = projectResult.data;
    files.push({ file: 'project.json', type: 'project' });
  } else {
    files.push({ file: 'project.json', type: 'project', error: projectResult.error });
  }

  for (const { dir: sub, type } of DIR_TYPES) {
    const abs = path.join(dir, sub);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.endsWith('.json')) continue;
      const file = `${sub}/${name}`;
      const result = readJson(path.join(abs, name));
      if (!result.data) {
        files.push({ file, type, error: result.error });
        continue;
      }
      files.push({ file, type });
      entries.push({ type, file, data: result.data });
    }
  }

  // 集内条目
  for (const entry of entries) {
    if (entry.type !== 'episode') continue;
    entry.ep = entry.data;
    for (const [key, type] of SUB_KEYS) {
      const list = Array.isArray(entry.data[key]) ? entry.data[key] : [];
      list.forEach((sub, i) => {
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
          entries.push({ type, file: entry.file, ep: entry.data, data: sub, sub, key, position: i });
        }
      });
    }
  }

  for (const entry of entries) {
    const id = entry.data.id;
    if (typeof id !== 'string' || id === '') continue;
    if (index.has(id)) {
      const first = index.get(id);
      duplicates.push({ id, files: [first.file, entry.file] });
      continue;
    }
    index.set(id, entry);
  }

  const episodes = entries
    .filter((e) => e.type === 'episode')
    .map((e) => e.data)
    .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0) || String(a.id).localeCompare(String(b.id)));

  return {
    slug,
    dir,
    project,
    files,
    entries,
    index,
    duplicates,
    episodes,
    parseErrors: files.filter((f) => f.error),
  };
}

export function loadProject(slug) {
  const resolved = resolveProjectSlug(slug);
  return loadProjectDir(path.join(PROJECTS_DIR, resolved), resolved);
}

function episodeOrder(project) {
  const order = new Map();
  project.episodes.forEach((ep, i) => order.set(ep.id, i));
  return order;
}

/**
 * 建立反查表：target id -> 引用它的地方。
 * ref: { from, fromType, kind, ep, t, label, summary }
 */
export function buildRefs(project) {
  const refs = new Map();
  const order = episodeOrder(project);
  const add = (target, ref) => {
    if (typeof target !== 'string' || target === '') return;
    if (!refs.has(target)) refs.set(target, []);
    refs.get(target).push(ref);
  };

  for (const entry of project.entries) {
    const d = entry.data;
    if (entry.type === 'character') {
      for (const rel of Array.isArray(d.relations) ? d.relations : []) {
        if (rel && rel.to) {
          add(rel.to, {
            from: d.id,
            fromType: 'character',
            kind: `关系：${rel.kind || '关联'}`,
            ep: null,
            t: null,
            label: rel.desc || '',
          });
        }
      }
      if (d.unit) {
        add(d.unit, { from: d.id, fromType: 'character', kind: '所属单元', ep: null, t: null, label: d.name || '' });
      }
    } else if (entry.type === 'unit') {
      for (const epId of Array.isArray(d.episodes) ? d.episodes : []) {
        add(epId, { from: d.id, fromType: 'unit', kind: '包含', ep: epId, t: null, label: d.name || '' });
      }
      for (const item of Array.isArray(d.legacy) ? d.legacy : []) {
        if (item && item.ref) {
          add(item.ref, {
            from: d.id,
            fromType: 'unit',
            kind: '单元遗留',
            ep: null,
            t: null,
            label: item.desc || '',
          });
        }
      }
    } else if (entry.type === 'episode') {
      if (d.unit) {
        add(d.unit, { from: d.id, fromType: 'episode', kind: '包含', ep: d.id, t: null, label: d.name || '' });
      }
      for (const hl of Array.isArray(d.highlights) ? d.highlights : []) {
        for (const sid of Array.isArray(hl?.setups) ? hl.setups : []) {
          add(sid, {
            from: hl.id,
            fromType: 'highlight',
            kind: '铺垫',
            ep: d.id,
            t: hl.t,
            label: hl.name || '',
            summary: hl.summary || '',
          });
        }
        for (const rid of Array.isArray(hl?.refs) ? hl.refs : []) {
          add(rid, {
            from: hl.id,
            fromType: 'highlight',
            kind: '高光引用',
            ep: d.id,
            t: hl.t,
            label: hl.name || '',
            summary: hl.summary || '',
          });
        }
      }
      for (const sc of Array.isArray(d.scenes) ? d.scenes : []) {
        if (!sc || typeof sc !== 'object') continue;
        const scRef = (target, kind, t, label) =>
          add(target, { from: sc.id, fromType: 'scene', kind, ep: d.id, t, label, summary: sc.place || '' });
        for (const w of Array.isArray(sc.wants) ? sc.wants : []) {
          if (typeof w?.who === 'string' && w.who.startsWith('char.')) scRef(w.who, '场次：想要', sc.from, w.want || '');
        }
        for (const shot of Array.isArray(sc.shots) ? sc.shots : []) {
          for (const line of Array.isArray(shot?.lines) ? shot.lines : []) {
            if (typeof line?.who === 'string' && line.who.startsWith('char.')) {
              scRef(line.who, line.kind === 'VO' ? '台词：VO' : '台词', shot.t, line.text || '');
            }
          }
          for (const rid of Array.isArray(shot?.realizes) ? shot.realizes : []) {
            scRef(rid, '镜头落实', shot.t, shot.frame || '');
          }
        }
      }
      for (const ev of Array.isArray(d.events) ? d.events : []) {
        if (ev && ev.ref) {
          add(ev.ref, {
            from: ev.id,
            fromType: 'event',
            kind: ev.kind || '事件',
            ep: d.id,
            t: ev.t,
            label: ev.summary || '',
            summary: ev.summary || '',
            layer: ev.layer,
          });
        }
      }
    }
  }

  for (const list of refs.values()) {
    list.sort((a, b) => {
      const ea = a.ep ? order.get(a.ep) ?? 999 : 999;
      const eb = b.ep ? order.get(b.ep) ?? 999 : 999;
      return ea - eb || (a.t || '').localeCompare(b.t || '');
    });
  }
  return refs;
}

/** 找集：接受 ep01 或集号 1 / 01。 */
export function findEpisode(project, arg) {
  if (!arg) return null;
  const raw = String(arg).trim().toLowerCase();
  const padded = /^\d{1,3}$/.test(raw) ? `ep${raw.padStart(2, '0')}` : raw;
  return project.episodes.find((ep) => ep.id === padded || String(ep.no) === String(arg)) || null;
}
