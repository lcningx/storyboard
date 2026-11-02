// index / show / ep / where / chain / timeline 的输出。

import { buildRefs, findEpisode, TYPE_LABEL, UserError } from './load.js';
import { parseTime, formatTime } from './time.js';
import { checkProject } from './check.js';

const GROUP_DEFS = [
  { type: 'character', label: '角色', key: 'characters' },
  { type: 'world', label: '世界', key: 'world' },
  { type: 'thread', label: '贯穿线', key: 'threads' },
  { type: 'unit', label: '单元', key: 'units' },
  { type: 'episode', label: '集', key: 'episodes' },
];

const TYPE_ALIASES = {
  character: 'character', 角色: 'character',
  world: 'world', 世界: 'world',
  thread: 'thread', 贯穿线: 'thread',
  unit: 'unit', 单元: 'unit',
  episode: 'episode', 集: 'episode',
};

export function entriesOf(project, type) {
  return project.entries.filter((e) => e.type === type).map((e) => e.data);
}

export function findEntry(project, id) {
  const entry = project.index.get(id);
  if (entry) return entry;
  if (project.project && (id === project.slug || id === project.project.id)) {
    return { type: 'project', file: 'project.json', data: project.project };
  }
  throw new UserError(`找不到条目：${id}`);
}

function item(t, tag, text, priority = 5) {
  return { t, tag, text, priority };
}

function epItems(ep) {
  const items = [];
  for (const sc of Array.isArray(ep.scenes) ? ep.scenes : []) {
    items.push(
      item(
        parseTime(sc?.from),
        '场次',
        `${sc.id} ${sc.from}–${sc.to} ${sc.place || ''}${sc.turn ? ` · 转：${sc.turn}` : ''}`,
        0,
      ),
    );
  }
  for (const b of Array.isArray(ep.beats) ? ep.beats : []) {
    const from = parseTime(b?.from);
    items.push(
      item(
        from,
        '节拍',
        `${b.from}–${b.to} ${b.type}${b.label ? ` · ${b.label}` : ''}`,
        0,
      ),
    );
  }
  for (const ev of Array.isArray(ep.events) ? ep.events : []) {
    items.push(
      item(
        parseTime(ev?.t),
        '事件',
        `${ev.id} ${ev.t} ${ev.kind} ${ev.ref}${ev.layer ? ` 第${ev.layer}层` : ''} · ${ev.summary}`,
        1,
      ),
    );
  }
  for (const su of Array.isArray(ep.setups) ? ep.setups : []) {
    items.push(
      item(
        parseTime(su?.t),
        '铺垫',
        `${su.id} ${su.t} ${su.kind} ${su.name}${su.longTerm ? '（长线）' : ''} · ${su.summary}`,
        2,
      ),
    );
  }
  for (const hl of Array.isArray(ep.highlights) ? ep.highlights : []) {
    items.push(
      item(
        parseTime(hl?.t),
        '高光',
        `${hl.id} ${hl.t} ${hl.type} ${hl.name}${hl.climax ? ' ◆爆点' : ''}${hl.clip ? ' ✂可切片' : ''} · ${hl.summary}`,
        3,
      ),
    );
  }
  for (const p of Array.isArray(ep.emotion) ? ep.emotion : []) {
    items.push(item(parseTime(p?.t), '情绪', `${p.t} ${p.v}${p.label ? ` ${p.label}` : ''}`, 4));
  }
  for (const g of Array.isArray(ep.grid) ? ep.grid : []) {
    items.push(item(parseTime(g?.t), '格', `${g.t} ${g.new}`, 6));
  }
  return items.sort((a, b) => (a.t ?? -1) - (b.t ?? -1) || a.priority - b.priority);
}

function lineFor(itemValue) {
  return `${itemValue.tag} ${itemValue.text}`;
}

// ---------- index ----------

export function cmdIndex(project, { type } = {}) {
  let types = GROUP_DEFS;
  if (type) {
    const normalized = TYPE_ALIASES[type];
    if (!normalized) throw new UserError(`未知类型：${type}（可用 character / world / thread / unit / episode）`);
    types = types.filter((g) => g.type === normalized);
  }
  const data = [];
  if (!type && project.project) {
    data.push({
      id: project.project.id || project.slug,
      type: 'project',
      name: project.project.name || '',
      summary: project.project.summary || '',
    });
  }
  for (const group of types) {
    for (const entry of entriesOf(project, group.type)) {
      data.push({ id: entry.id, type: group.type, name: entry.name || '', summary: entry.summary || '' });
    }
  }
  const lines = [];
  if (!type && project.project) lines.push(`# 项目`, `${data[0].id}  ${data[0].name}  ${data[0].summary}`);
  for (const group of types) {
    const rows = data.filter((d) => d.type === group.type);
    if (rows.length === 0) continue;
    lines.push(`# ${group.label}`);
    for (const row of rows) lines.push(`${row.id}  ${row.name}  ${row.summary}`);
  }
  return { data, text: lines.join('\n') };
}

// ---------- show ----------

export function cmdShow(project, ids) {
  if (ids.length === 0) throw new UserError('show 需要至少一个 ID');
  const entries = ids.map((id) => findEntry(project, id));
  const data = entries.map((e) => e.data);
  const text = entries
    .map((e) => `# ${e.data.id || e.file} · ${e.file}\n${JSON.stringify(e.data, null, 2)}`)
    .join('\n\n');
  return { data: data.length === 1 ? data[0] : data, text };
}

// ---------- ep ----------

const EP_FIELDS = ['beats', 'scenes', 'highlights', 'setups', 'events', 'emotion', 'grid'];

function inRange(t, from, to) {
  return t !== null && (from === null || t >= from) && (to === null || t <= to);
}

export function cmdEp(project, epArg, { from, to, only } = {}) {
  const ep = findEpisode(project, epArg);
  if (!ep) throw new UserError(`找不到集：${epArg}`);
  let onlyKeys = null;
  if (only) {
    onlyKeys = only.split(',').map((s) => s.trim()).filter(Boolean);
    const valid = new Set([...EP_FIELDS, 'hook', 'endHook']);
    for (const key of onlyKeys) {
      if (!valid.has(key)) throw new UserError(`--only 不支持字段：${key}（可用 ${[...valid].join(',')}）`);
    }
  }
  const fromSec = from === undefined ? null : parseTime(from);
  const toSec = to === undefined ? null : parseTime(to);
  if (from !== undefined && fromSec === null) throw new UserError(`--from 时间格式错误：${from}`);
  if (to !== undefined && toSec === null) throw new UserError(`--to 时间格式错误：${to}`);

  const out = {
    id: ep.id,
    no: ep.no,
    name: ep.name,
    summary: ep.summary,
    duration: ep.duration,
    unit: ep.unit,
  };
  const want = (key) => !onlyKeys || onlyKeys.includes(key);
  if (want('hook')) out.hook = ep.hook;
  if (want('endHook')) out.endHook = ep.endHook;

  for (const key of EP_FIELDS) {
    if (!want(key)) continue;
    const list = Array.isArray(ep[key]) ? ep[key] : [];
    if (key === 'beats' || key === 'scenes') {
      out[key] = list.filter((b) => {
        const bf = parseTime(b?.from);
        const bt = parseTime(b?.to);
        if (bf === null) return false;
        if (fromSec === null && toSec === null) return true;
        return bf < (toSec ?? Infinity) && (bt ?? bf) > (fromSec ?? -Infinity);
      });
    } else {
      out[key] = list.filter((x) => {
        const t = parseTime(x?.t);
        if (fromSec === null && toSec === null) return true;
        return inRange(t, fromSec, toSec);
      });
    }
  }

  const lines = [`${out.id} ${out.name || ''} · ${out.duration || '?'} · ${out.unit || '?'}`];
  if (out.hook !== undefined) lines.push(`钩子 ${out.hook}`);
  const tagKey = {
    节拍: 'beats',
    场次: 'scenes',
    高光: 'highlights',
    铺垫: 'setups',
    事件: 'events',
    情绪: 'emotion',
    格: 'grid',
  };
  for (const it of epItems({ ...out })) {
    if (!want(tagKey[it.tag])) continue;
    // 节拍、场次在上面已经按区间重叠过滤过，其他条目按时间点过滤。
    if (it.tag !== '节拍' && it.tag !== '场次' && (fromSec !== null || toSec !== null)) {
      if (it.t === null || it.t < (fromSec ?? -Infinity) || it.t > (toSec ?? Infinity)) continue;
    }
    lines.push(lineFor(it));
  }
  if (out.endHook !== undefined) lines.push(`结尾 ${out.endHook}`);
  return { data: out, text: lines.join('\n') };
}

// ---------- script ----------

function whoName(project, who) {
  if (typeof who !== 'string' || who === '') return '?';
  return project.index.get(who)?.data?.name || who;
}

export function cmdScript(project, epArg, sceneId) {
  const ep = findEpisode(project, epArg);
  if (!ep) throw new UserError(`找不到集：${epArg}`);
  const all = Array.isArray(ep.scenes) ? ep.scenes : [];
  let scenes = all;
  if (sceneId) {
    scenes = all.filter((sc) => sc?.id === sceneId);
    if (scenes.length === 0) throw new UserError(`${ep.id} 里没有场次：${sceneId}`);
  }
  const lines = [`${ep.id} ${ep.name || ''} · ${ep.duration || '?'}`];
  if (all.length === 0) lines.push('（这一集还没有写场次）');
  for (const sc of scenes) {
    const no = all.indexOf(sc) + 1;
    lines.push('', `第 ${no} 场  ${sc.id}  ${sc.from}–${sc.to}  ${sc.place || ''}`);
    (Array.isArray(sc.wants) ? sc.wants : []).forEach((w, i) => {
      lines.push(`${i === 0 ? '想要' : '    '}  ${whoName(project, w?.who)}：${w?.want || ''}`);
    });
    if (sc.turn) lines.push(`转    ${sc.turn}`);
    for (const shot of Array.isArray(sc.shots) ? sc.shots : []) {
      const head = [shot.size, shot.move].filter(Boolean).join('·');
      const realizes = Array.isArray(shot.realizes) && shot.realizes.length ? `  [${shot.realizes.join(' ')}]` : '';
      lines.push(`  ${shot.t}  【${head || '?'} ${shot.dur ?? '?'}秒】${shot.frame || ''}${realizes}`);
      for (const line of Array.isArray(shot.lines) ? shot.lines : []) {
        const kind = line?.kind && line.kind !== '对白' ? `（${line.kind}）` : '';
        lines.push(`        ${kind}${whoName(project, line?.who)}：${line?.text || ''}`);
      }
      if (shot.sound) lines.push(`        ♪ ${shot.sound}`);
    }
    if (sc.next) lines.push(`→ 下一场  ${sc.next}`);
  }
  return { data: { id: ep.id, scenes }, text: lines.join('\n') };
}

// ---------- where ----------

export function cmdWhere(project, id) {
  const entry = findEntry(project, id);
  const refs = buildRefs(project).get(id) || [];
  const label = entry.data.name || entry.data.id || id;
  const typeLabel = TYPE_LABEL[entry.type] || '条目';
  const lines = [`${id}  ${label}  （${typeLabel}）`];
  if (refs.length === 0) lines.push('（没有被引用）');
  for (const ref of refs) {
    const where = [ref.ep || '', ref.t || ''].filter(Boolean).join(' ');
    lines.push(`${where || '—'}  ${ref.kind}  ${ref.from}${ref.label ? ` · ${ref.label}` : ''}`.replace(/\s+/g, ' ').trim());
  }
  return { data: refs, text: lines.join('\n') };
}

// ---------- chain ----------

export function cmdChain(project, hlId) {
  const entry = findEntry(project, hlId);
  if (entry.type !== 'highlight') throw new UserError(`${hlId} 不是高光`);
  const hl = entry.data;
  const hlEp = entry.ep;
  const hlT = parseTime(hl.t);
  const setups = Array.isArray(hl.setups) ? hl.setups : [];
  const order = new Map(project.episodes.map((ep, i) => [ep.id, i]));
  const lines = [`${hlId} ${hl.t} ${hl.type} ${hl.name || ''}${hl.climax ? ' ◆爆点' : ''}`];
  if (setups.length === 0) {
    lines.push(hl.noSetupReason ? `无铺垫：${hl.noSetupReason}` : '无铺垫（也没有写 noSetupReason）');
  }
  const data = [];
  for (const sid of setups) {
    const suEntry = project.index.get(sid);
    if (!suEntry || suEntry.type !== 'setup') {
      lines.push(`${sid}  (不存在)`);
      data.push({ id: sid, missing: true });
      continue;
    }
    const su = suEntry.data;
    const suEp = suEntry.ep;
    const delta = hlT !== null && parseTime(su.t) !== null ? hlT - parseTime(su.t) : null;
    let relative = '';
    if (suEp?.id === hlEp?.id) {
      relative = delta === null ? '' : delta >= 0 ? `早 ${formatTime(delta)}` : `晚 ${formatTime(-delta)}`;
    } else {
      const diff = (order.get(suEp?.id) ?? 0) - (order.get(hlEp?.id) ?? 0);
      relative = `跨 ${Math.abs(diff)} 集（${suEp?.id || '?'}）`;
    }
    lines.push(`${sid} ${suEp?.id || '?'} ${su.t} ${su.kind || ''} ${su.name || ''} · ${relative}`);
    data.push({
      id: sid,
      episode: suEp?.id || null,
      t: su.t,
      kind: su.kind,
      name: su.name,
      summary: su.summary,
      delta,
      crossEpisode: suEp?.id !== hlEp?.id,
    });
  }
  return { data: { id: hlId, episode: hlEp?.id || null, t: hl.t, name: hl.name, setups: data }, text: lines.join('\n') };
}

// ---------- timeline ----------

export function cmdTimeline(project, epArg) {
  const { issues } = checkProject(project);
  if (epArg) {
    const ep = findEpisode(project, epArg);
    if (!ep) throw new UserError(`找不到集：${epArg}`);
    const items = epItems(ep).map((it) => `${it.t !== null ? formatTime(it.t) : '?'}  ${lineFor(it)}`);
    return { data: epItems(ep), text: items.join('\n') };
  }
  const rows = project.episodes.map((ep) => {
    const climax = (Array.isArray(ep.highlights) ? ep.highlights : []).find((h) => h?.climax === true);
    const count = issues.filter((i) => i.ep === ep.id && i.level !== 'info').length;
    return {
      id: ep.id,
      no: ep.no,
      name: ep.name,
      duration: ep.duration,
      unit: ep.unit,
      climax: climax?.t || null,
      highlights: Array.isArray(ep.highlights) ? ep.highlights.length : 0,
      issues: count,
    };
  });
  const text = rows
    .map((r) => `${r.id}  ${r.name || ''}  ${r.duration || '?'}  ${r.unit || '?'}  爆点 ${r.climax || '—'}  高光 ${r.highlights}  问题 ${r.issues}`)
    .join('\n');
  return { data: rows, text };
}

// ---------- check ----------

export function cmdCheck(project, { level, scope } = {}) {
  const result = checkProject(project);
  let issues = result.issues;
  if (scope) {
    const ep = findEpisode(project, scope);
    if (ep) {
      issues = issues.filter((i) => i.ep === ep.id || i.target === ep.id);
    } else {
      const isEntry = project.index.has(scope) || (project.project && (scope === project.slug || scope === project.project.id));
      if (!isEntry) throw new UserError(`找不到条目：${scope}`);
      issues = issues.filter((i) => i.target === scope);
    }
  }
  if (level) {
    const rank = { error: 0, warn: 1, info: 2 }[level];
    if (rank === undefined) throw new UserError(`未知级别：${level}（可用 error / warn / info）`);
    issues = issues.filter((i) => ({ error: 0, warn: 1, info: 2 })[i.level] <= rank);
  }
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.level] += 1;
  const text = issues.map((i) => {
    const range = i.from ? ` ${i.from}${i.to && i.to !== i.from ? `–${i.to}` : ''}` : '';
    return `${i.code} ${i.target}${range}  ${i.message}`;
  }).join('\n');
  return { data: { issues, counts }, text: text || '没有发现问题', counts };
}

