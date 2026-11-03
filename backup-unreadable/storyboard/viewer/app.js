// 只读查看器：全季 / 单集 / 资料。
// 原则：文字直接写出来，图只用来看形状；颜色区分类别；字号固定，不随窗口缩放。

const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const detail = $('#detail');
const tooltip = $('#tooltip');

const state = {
  project: window.__PROJECT__ || null,
  view: 'season',
  ep: null,
  detail: null,
  selHl: null,
  data: null,
  scriptPlain: false,
  commentTarget: null, // 详情面板里新评论要挂到哪：条目 ID，或 镜头ID#第几句
  commentFilter: 'open',
  drafts: {}, // 还没提交的评论草稿，数据刷新时不丢
};
const index = new Map();
const unitColor = new Map();
const charColor = new Map();

const TYPE_LABELS = {
  project: '项目',
  character: '角色',
  world: '世界设定',
  thread: '贯穿线',
  unit: '单元',
  episode: '集',
  highlight: '高光',
  setup: '铺垫',
  event: '事件',
  scene: '场次',
  shot: '镜头',
};

// 颜色：每一类东西一套固定的颜色，在 style.css 里定义成变量
const BEAT_COLOR = {
  钩子: 'var(--beat-hook)',
  钩子升级: 'var(--beat-hook2)',
  教规则: 'var(--beat-rule)',
  第一回合: 'var(--beat-round)',
  压: 'var(--beat-press)',
  爆: 'var(--beat-boom)',
  余波: 'var(--beat-after)',
  连接: 'var(--beat-link)',
};
const HL_COLOR = {
  打斗: 'var(--h-fight)',
  亮相: 'var(--h-show)',
  反转: 'var(--h-twist)',
  金句: 'var(--h-line)',
  笑点: 'var(--h-fun)',
  情绪: 'var(--h-emo)',
};
const SU_COLOR = {
  规则: 'var(--s-rule)',
  压: 'var(--s-press)',
  在乎: 'var(--s-care)',
  伏笔: 'var(--s-plant)',
};
const THREAD_COLOR = {
  大问号: 'var(--t-question)',
  威胁: 'var(--t-threat)',
  成长: 'var(--t-growth)',
};
const WORLD_COLOR = {
  规则: 'var(--w-rule)',
  秘密: 'var(--w-secret)',
};

// ---------- 工具 ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function parseT(value) {
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(String(value ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fmtT(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

// 估算文字宽度：中文按一个字号宽，其余按 0.6
function textW(text, size) {
  let w = 0;
  for (const ch of String(text)) w += /[⺀-￿]/.test(ch) ? size : size * 0.6;
  return w;
}

function unitVar(id) {
  return unitColor.get(id) || 'var(--ink-soft)';
}

function hlColor(hl) {
  return HL_COLOR[hl?.type] || 'var(--ink-soft)';
}

function suColor(su) {
  return SU_COLOR[su?.kind] || 'var(--ink-soft)';
}

// 角色、贯穿线、世界设定的颜色
function refColor(id) {
  const entry = index.get(id);
  if (!entry) return 'var(--ink-soft)';
  const d = entry.data;
  if (entry.type === 'character') return d.layer === '核心' ? 'var(--c-core)' : unitVar(d.unit);
  if (entry.type === 'thread') return THREAD_COLOR[d.kind] || 'var(--t-question)';
  if (entry.type === 'world') return WORLD_COLOR[d.kind] || 'var(--w-rule)';
  if (entry.type === 'unit') return unitVar(d.id);
  return 'var(--ink-soft)';
}

function epIndex(id) {
  return state.data?.episodes.findIndex((ep) => ep.id === id) ?? -1;
}

function getEntry(id) {
  return index.get(id) || null;
}

function issuesFor(target) {
  return state.data?.check.issues.filter((i) => i.target === target) || [];
}

function buildIndex() {
  index.clear();
  unitColor.clear();
  const d = state.data;
  if (!d) return;
  d.units.forEach((u, i) => unitColor.set(u.id, `var(--u${(i % 6) + 1})`));
  charColor.clear();
  d.characters.forEach((c, i) => charColor.set(c.id, `var(--p${(i % 8) + 1})`));
  for (const c of d.characters) index.set(c.id, { type: 'character', data: c });
  for (const w of d.world) index.set(w.id, { type: 'world', data: w });
  for (const t of d.threads) index.set(t.id, { type: 'thread', data: t });
  for (const u of d.units) index.set(u.id, { type: 'unit', data: u });
  for (const ep of d.episodes) {
    index.set(ep.id, { type: 'episode', data: ep });
    for (const hl of arr(ep.highlights)) index.set(hl.id, { type: 'highlight', data: hl, ep });
    for (const su of arr(ep.setups)) index.set(su.id, { type: 'setup', data: su, ep });
    for (const ev of arr(ep.events)) index.set(ev.id, { type: 'event', data: ev, ep });
    for (const sc of arr(ep.scenes)) {
      index.set(sc.id, { type: 'scene', data: { ...sc, name: sc.place }, ep });
      for (const shot of arr(sc.shots)) {
        if (shot.id) index.set(shot.id, { type: 'shot', data: { ...shot, name: `${shot.t} ${shot.size || ''}`, summary: shot.frame }, ep });
      }
    }
  }
}

function appearances(id) {
  const refs = state.data?.refs?.[id] || [];
  const eps = [];
  for (const ref of refs) {
    if (ref.ep && !eps.includes(ref.ep)) eps.push(ref.ep);
  }
  return eps.sort((a, b) => epIndex(a) - epIndex(b));
}

// 角色排序：核心在前，同层里被引用越多越靠前（主角自然排第一）
function sortedCharacters() {
  const refCount = (c) => (state.data.refs?.[c.id] || []).length;
  const byRefs = (a, b) => refCount(b) - refCount(a);
  const chars = state.data.characters;
  return {
    core: chars.filter((c) => c.layer === '核心').sort(byRefs),
    unit: chars.filter((c) => c.layer !== '核心').sort(byRefs),
  };
}

// 某个铺垫被哪些高光兑现（跨集查找）
function payoffsOf(setupId) {
  const out = [];
  for (const ep of state.data.episodes) {
    for (const hl of arr(ep.highlights)) {
      if (arr(hl.setups).includes(setupId)) out.push({ ep, hl });
    }
  }
  return out;
}

function climaxOf(ep) {
  return arr(ep.highlights).find((hl) => hl.climax === true) || null;
}

function tag(text, color, extra = '') {
  return `<span class="tag" style="--c:${color}"${extra}>${esc(text)}</span>`;
}

function dot(color) {
  return `<i class="dot" style="--c:${color}"></i>`;
}

// ---------- 数据与 hash ----------

async function loadData() {
  const res = await fetch(`/api/project?project=${encodeURIComponent(state.project)}`);
  if (!res.ok) throw Object.assign(new Error(`读取项目失败：${res.status}`), { status: res.status });
  state.data = await res.json();
  buildIndex();
  const bad = state.data.parseErrors || [];
  if (bad.length) {
    showBanner(`文件解析失败：${bad.map((f) => `${f.file} — ${f.message}`).join('；')}`);
  }
  if (state.view === 'episode' && !state.data.episodes.some((ep) => ep.id === state.ep)) {
    state.ep = state.data.episodes[0]?.id || null;
  }
  if (state.selHl && !index.has(state.selHl)) state.selHl = null;
}

function applyHash() {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('ep/')) {
    state.view = 'episode';
    state.ep = hash.slice(3) || null;
  } else if (hash === 'library' || hash === 'comments') {
    state.view = hash;
  } else {
    state.view = 'season';
  }
}

function setHash() {
  const next = state.view === 'episode' ? `ep/${state.ep || ''}` : state.view;
  if (location.hash !== `#${next}`) history.replaceState(null, '', `#${next}`);
}

function renderAll() {
  if (!state.data) return;
  renderTop();
  renderIssues();
  if (state.view === 'season') renderSeason();
  else if (state.view === 'episode') renderEpisode();
  else if (state.view === 'comments') renderComments();
  else renderLibrary();
  setHash();
  if (state.detail) renderDetail();
}

function renderTop() {
  const p = state.data.project || {};
  $('#project-name').textContent = p.name || state.data.slug;
  $('#project-summary').textContent = p.summary || '';
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.view === state.view);
  }
  const open = openComments().length;
  $('#comment-count').textContent = open ? ` ${open}` : '';
}

function renderIssues() {
  const { counts, issues } = state.data.check;
  const badge = $('#check-badge');
  let text;
  let cls;
  if (counts.error) {
    text = `${counts.error} 个错误${counts.warn ? ` · ${counts.warn} 个警告` : ''}`;
    cls = 'error';
  } else if (counts.warn) {
    text = `${counts.warn} 个警告${counts.info ? ` · ${counts.info} 个提示` : ''}`;
    cls = 'warn';
  } else if (counts.info) {
    text = `${counts.info} 个提示`;
    cls = 'ok';
  } else {
    text = '检查通过';
    cls = 'ok';
  }
  badge.textContent = text;
  badge.className = `badge ${cls}`;
  badge.hidden = false;

  const panel = $('#issue-panel');
  if (!issues.length) {
    panel.innerHTML = '<p class="muted">没有发现问题。</p>';
    return;
  }
  panel.innerHTML = issues
    .map((i) => {
      const range = i.from ? `${i.from}${i.to && i.to !== i.from ? `–${i.to}` : ''}` : '';
      return `<button class="issue-row lvl-${i.level}" data-issue-target="${esc(i.target)}" data-issue-ep="${esc(i.ep || '')}">
        <span class="issue-code">${esc(i.code)}</span>
        <span class="issue-target">${esc(i.target)}</span>
        <span class="issue-range">${esc(range)}</span>
        <span class="issue-msg">${esc(i.message)}</span>
      </button>`;
    })
    .join('');
}

// ---------- 全季：看板 ----------

function sparkline(ep) {
  const points = arr(ep.emotion)
    .map((p) => ({ t: parseT(p.t), v: Number(p.v) }))
    .filter((p) => p.t !== null && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) return '<div class="spark empty"></div>';
  const dur = parseT(ep.duration) || 1;
  const px = (t) => (t / dur) * 100;
  const py = (v) => 40 - (Math.max(0, Math.min(10, v)) / 10) * 36;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(2)},${py(p.v).toFixed(2)}`).join('');
  const area = `${line}L${px(points[points.length - 1].t).toFixed(2)},40L${px(points[0].t).toFixed(2)},40Z`;
  const climax = climaxOf(ep);
  const ct = climax ? parseT(climax.t) : null;
  const marker = ct !== null ? `<span class="spark-dot" style="left:${px(ct)}%;top:${(py(10) / 40) * 100}%"></span>` : '';
  return `<div class="spark">
    <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="${area}" class="spark-area"></path><path d="${line}" class="spark-line" vector-effect="non-scaling-stroke"></path></svg>
    ${marker}
  </div>`;
}

function boardItem(id, kindText, color, text) {
  return `<button class="bitem" data-detail="${esc(id)}" style="--c:${color}">
    <span class="bkind">${esc(kindText)}</span><span class="btext">${esc(text)}</span>
  </button>`;
}

function renderSeason() {
  const d = state.data;
  const eps = d.episodes;
  if (!eps.length) {
    view.innerHTML = '<p class="muted">还没有集。</p>';
    return;
  }
  const cols = `--cols:${eps.length}`;
  const rows = [];
  const row = (label, cells, cls = '') =>
    rows.push(`<div class="brow ${cls}" style="${cols}"><div class="blabel">${label}</div>${cells}</div>`);
  const group = (title, color) =>
    rows.push(`<div class="bgroup" style="${cols}"><span>${dot(color)}${esc(title)}</span></div>`);

  // 集
  row(
    '',
    eps
      .map((ep) => {
        const climax = climaxOf(ep);
        const issues = state.data.check.issues.filter((i) => i.ep === ep.id || i.target === ep.id).length;
        return `<button class="bep" data-ep="${ep.id}" style="--uc:${unitVar(ep.unit)}">
          <div class="bep-top"><span class="bep-id">${esc(ep.id)}</span><span class="bep-dur">${esc(ep.duration || '')}</span>${issues ? `<span class="bep-issue">${issues} 个问题</span>` : ''}</div>
          <div class="bep-name">${esc(ep.name || '')}</div>
          ${climax ? `<div class="bep-climax" style="--c:${hlColor(climax)}">◆ ${esc(climax.t)} ${esc(climax.name || '')}</div>` : ''}
          <div class="bep-hook">${esc(ep.hook || '')}</div>
        </button>`;
      })
      .join(''),
    'bhead',
  );

  // 情绪
  row('情绪', eps.map((ep) => `<div class="bcell" data-ep="${ep.id}">${sparkline(ep)}</div>`).join(''));

  // 单元色带
  const bands = d.units
    .map((unit) => {
      const idx = arr(unit.episodes).map((id) => eps.findIndex((ep) => ep.id === id)).filter((i) => i >= 0);
      if (!idx.length) return '';
      const from = Math.min(...idx);
      const to = Math.max(...idx);
      return `<button class="bband" data-detail="${unit.id}" style="grid-column:${from + 2} / ${to + 3};--c:${unitVar(unit.id)}">
        <b>${esc(unit.name || unit.id)}</b><span>${esc(unit.emotion || '')}</span></button>`;
    })
    .join('');
  row('单元', bands, 'bunits');

  // 贯穿线
  if (d.threads.length) {
    group('贯穿线', 'var(--t-question)');
    for (const th of d.threads) {
      const color = refColor(th.id);
      const maxGap = Number.isFinite(Number(th.maxGap)) ? Number(th.maxGap) : 3;
      const advanced = eps.map((ep) => arr(ep.events).some((ev) => ev.ref === th.id && ev.kind === '推进'));
      // 连续没推进的集数超过 maxGap 时，这一段标红
      const gapCells = new Set();
      let run = [];
      advanced.forEach((adv, i) => {
        if (adv) run = [];
        else {
          run.push(i);
          if (run.length > maxGap) run.forEach((j) => gapCells.add(j));
        }
      });
      const cells = eps
        .map((ep, i) => {
          const items = arr(ep.events)
            .filter((ev) => ev.ref === th.id)
            .map((ev) => boardItem(ev.id, ev.kind, color, ev.summary))
            .join('');
          return `<div class="bcell${gapCells.has(i) ? ' gap' : ''}">${items || (gapCells.has(i) ? '<span class="gap-note">断档</span>' : '')}</div>`;
        })
        .join('');
      row(`<button class="link-row" data-detail="${th.id}">${dot(color)}${esc(th.name || th.id)}<small>${esc(th.kind || '')}</small></button>`, cells);
    }
  }

  // 角色
  const { core, unit } = sortedCharacters();
  const charRows = (list, title, color) => {
    if (!list.length) return;
    group(title, color);
    for (const ch of list) {
      const c = refColor(ch.id);
      const cells = eps
        .map((ep) => {
          const evs = arr(ep.events)
            .filter((ev) => ev.ref === ch.id)
            .map((ev) => boardItem(ev.id, ev.kind, c, ev.summary));
          const hls = arr(ep.highlights)
            .filter((hl) => arr(hl.refs).includes(ch.id))
            .map((hl) => boardItem(hl.id, hl.climax ? '◆ 爆点' : hl.type, hlColor(hl), hl.name));
          return `<div class="bcell">${evs.join('')}${hls.length ? `<div class="bhls">${hls.join('')}</div>` : ''}</div>`;
        })
        .join('');
      row(`<button class="link-row" data-detail="${ch.id}">${dot(c)}${esc(ch.name || ch.id)}</button>`, cells);
    }
  };
  charRows(core, '核心角色', 'var(--c-core)');
  charRows(unit, '单元角色', 'var(--u1)');

  // 世界设定
  const worlds = d.world.filter((w) => eps.some((ep) => arr(ep.events).some((ev) => ev.ref === w.id)));
  if (worlds.length) {
    group('世界设定', 'var(--w-rule)');
    for (const w of worlds) {
      const c = refColor(w.id);
      const cells = eps
        .map((ep) => {
          const items = arr(ep.events)
            .filter((ev) => ev.ref === w.id)
            .map((ev) => boardItem(ev.id, ev.layer ? `第${ev.layer}层` : ev.kind, c, ev.summary))
            .join('');
          return `<div class="bcell">${items}</div>`;
        })
        .join('');
      row(`<button class="link-row" data-detail="${w.id}">${dot(c)}${esc(w.name || w.id)}<small>${esc(w.kind || '')}</small></button>`, cells);
    }
  }

  view.innerHTML = `<div class="board-scroll"><div class="board">${rows.join('')}</div></div>`;
}

// ---------- 单集：时间线 + 按时间排的清单 ----------

// 标签错开排布：放不下就换一行，超过 maxLanes 行就不显示文字（悬停仍可看）
function laneLabels(items, size, maxLanes, rightEdge) {
  const lanes = [];
  return items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((it) => {
      const w = textW(it.text, size);
      let start = it.x - 5;
      if (start + w > rightEdge) start = Math.max(it.x - w + 5, rightEdge - w);
      let lane = lanes.findIndex((right) => right < start);
      if (lane === -1 && lanes.length < maxLanes) {
        lanes.push(-Infinity);
        lane = lanes.length - 1;
      }
      if (lane !== -1) lanes[lane] = start + w + 12;
      return { ...it, start, lane };
    });
}

function starPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(angle) * rr).toFixed(1)},${(cy + Math.sin(angle) * rr).toFixed(1)}`;
  }
  return `${d}Z`;
}

function renderTimeline(ep, W) {
  const d = state.data;
  const dur = parseT(ep.duration) || 1;
  const gridSeconds = Number(d.project?.gridSeconds) > 0 ? Number(d.project.gridSeconds) : 15;
  const LEFT = 132;
  const RIGHT = 24;
  const plotW = W - LEFT - RIGHT;
  const x = (t) => LEFT + (Math.max(0, Math.min(t, dur)) / dur) * plotW;
  const sel = state.selHl ? getEntry(state.selHl) : null;
  const selHl = sel && sel.ep?.id === ep.id ? sel.data : null;
  const selSetups = new Set(arr(selHl?.setups));

  // 本集涉及的角色、贯穿线、设定
  const refIds = new Set();
  for (const ev of arr(ep.events)) if (ev.ref) refIds.add(ev.ref);
  for (const hl of arr(ep.highlights)) for (const id of arr(hl.refs)) refIds.add(id);
  const { core, unit } = sortedCharacters();
  const tracks = [
    ...[...core, ...unit].filter((c) => refIds.has(c.id)),
    ...d.threads.filter((t) => refIds.has(t.id)),
    ...d.world.filter((w) => refIds.has(w.id)),
  ];

  const body = [];
  const labels = [];
  const label = (text, y, color) =>
    labels.push(`<text class="tl-rowlabel" x="${LEFT - 16}" y="${y}" text-anchor="end"${color ? ` style="fill:${color}"` : ''}>${esc(text)}</text>`);
  let y = 8;

  // 时间尺
  const climax = climaxOf(ep);
  const ct = climax ? parseT(climax.t) : null;
  const rulerY = y + 14;
  const step = dur <= 150 ? 15 : dur <= 360 ? 30 : 60;
  for (let t = 0; t <= dur; t += step) {
    const tx = x(t);
    if (ct !== null && Math.abs(tx - x(ct)) < 44) continue;
    body.push(`<text x="${tx}" y="${rulerY}" text-anchor="${t === 0 ? 'start' : t >= dur ? 'end' : 'middle'}" class="tl-tick">${fmtT(t)}</text>`);
  }
  const plotTop = y + 24;
  y = plotTop + 8;

  // 情绪
  const EMO_H = 96;
  const emoY = y;
  label('情绪', emoY + EMO_H / 2 + 5);
  const ey = (v) => emoY + 14 + (1 - Math.max(0, Math.min(10, v)) / 10) * (EMO_H - 14);
  const emotion = arr(ep.emotion)
    .map((p) => ({ t: parseT(p.t), v: Number(p.v), label: p.label }))
    .filter((p) => p.t !== null && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  body.push(`<rect x="${LEFT}" y="${emoY}" width="${plotW}" height="${EMO_H}" class="tl-band"></rect>`);
  if (emotion.length > 1) {
    const line = emotion.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${ey(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(emotion[emotion.length - 1].t).toFixed(1)},${emoY + EMO_H}L${x(emotion[0].t).toFixed(1)},${emoY + EMO_H}Z`;
    body.push(`<path d="${area}" class="emo-area"></path><path d="${line}" class="emo-line"></path>`);
  }
  const emoLabels = laneLabels(
    emotion.filter((p) => p.label && !(ct !== null && p.t === ct)).map((p) => ({ x: x(p.t), text: p.label, p })),
    12,
    1,
    W - RIGHT,
  );
  for (const p of emotion) {
    body.push(`<g data-tip="${esc(`${fmtT(p.t)} · 情绪 ${p.v}${p.label ? ` · ${p.label}` : ''}`)}">
      <circle cx="${x(p.t)}" cy="${ey(p.v)}" r="8" fill="transparent"></circle>
      <circle cx="${x(p.t)}" cy="${ey(p.v)}" r="3" class="emo-dot"></circle></g>`);
  }
  for (const l of emoLabels) {
    if (l.lane === -1) continue;
    const ly = Math.min(ey(l.p.v) + 18, emoY + EMO_H - 4);
    body.push(`<text x="${l.start}" y="${ly}" class="emo-label">${esc(l.text)}</text>`);
  }
  y = emoY + EMO_H + 18;

  // 节拍
  const BEAT_H = 34;
  const beatY = y;
  label('节拍', beatY + BEAT_H / 2 + 5);
  for (const b of arr(ep.beats)) {
    const from = parseT(b.from);
    const to = parseT(b.to);
    if (from === null || to === null || to <= from) continue;
    const bx = x(from);
    const bw = Math.max(2, x(to) - bx);
    const full = b.label ? `${b.type} · ${b.label}` : b.type;
    const text = textW(full, 13) < bw - 14 ? full : textW(b.type, 13) < bw - 10 ? b.type : '';
    body.push(`<g data-tip="${esc(`${b.from}–${b.to} · ${full}`)}">
      <rect x="${bx + 1}" y="${beatY}" width="${bw - 2}" height="${BEAT_H}" rx="4" style="fill:${BEAT_COLOR[b.type] || 'var(--beat-after)'}"></rect>
      ${text ? `<text x="${bx + bw / 2}" y="${beatY + BEAT_H / 2 + 5}" text-anchor="middle" class="beat-label">${esc(text)}</text>` : ''}
    </g>`);
  }
  y = beatY + BEAT_H + 22;

  // 高光：标记 + 名字
  const hlY = y;
  label('高光', hlY + 12);
  const hlItems = laneLabels(
    arr(ep.highlights)
      .filter((hl) => parseT(hl.t) !== null)
      .map((hl) => ({ x: x(parseT(hl.t)), text: `${hl.climax ? '◆ ' : ''}${hl.name || hl.id}`, hl })),
    13,
    3,
    W - RIGHT,
  );
  const hlLanes = Math.max(1, ...hlItems.map((i) => i.lane + 1));
  const geoHl = new Map();
  for (const it of hlItems) {
    const { hl } = it;
    const cx = it.x;
    const cy = hlY + 12;
    const c = hlColor(hl);
    const isSel = selHl?.id === hl.id;
    const mark = hl.climax
      ? `<path d="M${cx},${cy - 10}L${cx + 8},${cy}L${cx},${cy + 10}L${cx - 8},${cy}Z" style="fill:${c}" class="climax-mark"></path>`
      : `<path d="${starPath(cx, cy, 8)}" style="fill:${c}"></path>`;
    const ly = hlY + 38 + Math.max(0, it.lane) * 19;
    const issue = issuesFor(hl.id).length ? `<circle cx="${cx + 9}" cy="${cy - 8}" r="3.5" class="issue-dot"></circle>` : '';
    const tip = `${hl.t} · ${hl.type}${hl.climax ? ' · 本集爆点' : ''}${hl.clip ? ' · 可切片' : ''}\n${hl.summary || ''}`;
    body.push(`<g class="mk${isSel ? ' is-sel' : ''}" data-mk="${hl.id}" data-hlsel="${hl.id}" data-tip="${esc(tip)}">
      <rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" fill="transparent"></rect>
      ${isSel ? `<circle cx="${cx}" cy="${cy}" r="14" class="sel-ring" style="stroke:${c}"></circle>` : ''}
      ${mark}${issue}
      ${it.lane >= 0 ? `<line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${ly - 12}" class="leader" style="stroke:${c}"></line>
        <text x="${it.start}" y="${ly}" class="hl-label${hl.climax ? ' climax' : ''}" style="fill:${c}">${esc(it.text)}${hl.clip ? ' ✂' : ''}</text>` : ''}
    </g>`);
    geoHl.set(hl.id, { x: cx, y: cy });
  }
  y = hlY + 38 + hlLanes * 19 + 10;

  // 铺垫：标记 + 名字
  const suY = y;
  label('铺垫', suY + 10);
  const suItems = laneLabels(
    arr(ep.setups)
      .filter((su) => parseT(su.t) !== null)
      .map((su) => ({ x: x(parseT(su.t)), text: su.name || su.id, su })),
    12,
    3,
    W - RIGHT,
  );
  const suLanes = Math.max(1, ...suItems.map((i) => i.lane + 1));
  const geoSu = new Map();
  for (const it of suItems) {
    const { su } = it;
    const cx = it.x;
    const cy = suY + 10;
    const c = suColor(su);
    const isSel = selSetups.has(su.id);
    const ly = suY + 34 + Math.max(0, it.lane) * 18;
    const tip = `${su.t} · 铺垫 · ${su.kind}${su.longTerm ? '（长线）' : ''}\n${su.summary || ''}`;
    body.push(`<g class="mk${isSel ? ' is-sel' : ''}" data-mk="${su.id}" data-detail="${su.id}" data-tip="${esc(tip)}">
      <circle cx="${cx}" cy="${cy}" r="11" fill="transparent"></circle>
      <circle cx="${cx}" cy="${cy}" r="6" class="su-mark${su.longTerm ? ' long' : ''}" style="stroke:${c}"></circle>
      ${issuesFor(su.id).length ? `<circle cx="${cx + 8}" cy="${cy - 7}" r="3.5" class="issue-dot"></circle>` : ''}
      ${it.lane >= 0 ? `<line x1="${cx}" y1="${cy + 7}" x2="${cx}" y2="${ly - 11}" class="leader" style="stroke:${c}"></line>
        <text x="${it.start}" y="${ly}" class="su-label" style="fill:${c}">${esc(it.text)}</text>` : ''}
    </g>`);
    geoSu.set(su.id, { x: cx, y: cy });
  }
  y = suY + 34 + suLanes * 18 + 12;

  // 铺垫 → 高光 的连线：选中高光时一直显示
  if (selHl && geoHl.has(selHl.id)) {
    const h = geoHl.get(selHl.id);
    const c = hlColor(selHl);
    for (const sid of arr(selHl.setups)) {
      const s = geoSu.get(sid);
      if (!s) continue; // 跨集的铺垫在时间线上方的选中提示里列出
      const midY = (h.y + s.y) / 2;
      body.push(`<path d="M${h.x},${h.y + 10} C${h.x},${midY} ${s.x},${midY} ${s.x},${s.y - 7}" class="setup-link" style="stroke:${c}"></path>`);
    }
  }

  // 角色、贯穿线、设定
  const TRACK_H = 28;
  const groupGap = (prev, cur) => prev && prev !== cur;
  let prevType = null;
  for (const entry of tracks) {
    const type = getEntry(entry.id)?.type;
    if (groupGap(prevType, type)) y += 8;
    prevType = type;
    const c = refColor(entry.id);
    const cy = y + TRACK_H / 2;
    label(entry.name || entry.id, cy + 5, c);
    body.push(`<line x1="${LEFT}" y1="${cy}" x2="${W - RIGHT}" y2="${cy}" class="track-base"></line>`);
    const points = [];
    for (const ev of arr(ep.events).filter((e) => e.ref === entry.id)) {
      const t = parseT(ev.t);
      if (t !== null) points.push({ t, id: ev.id, text: ev.layer ? `第${ev.layer}层` : ev.kind, tip: `${ev.t} · ${ev.kind}\n${ev.summary || ''}`, kind: 'event' });
    }
    for (const hl of arr(ep.highlights).filter((h) => arr(h.refs).includes(entry.id))) {
      const t = parseT(hl.t);
      if (t !== null && !points.some((p) => p.t === t)) {
        points.push({ t, id: hl.id, text: '', tip: `${hl.t} · 参与高光「${hl.name}」`, kind: 'hl' });
      }
    }
    const placed = laneLabels(points.map((p) => ({ ...p, x: x(p.t) + 12 })), 12, 1, W - RIGHT);
    for (const p of placed) {
      const px = p.x - 12;
      body.push(`<g class="mk" data-mk="${p.id}" data-detail="${p.id}" data-tip="${esc(p.tip)}">
        <circle cx="${px}" cy="${cy}" r="10" fill="transparent"></circle>
        <circle cx="${px}" cy="${cy}" r="${p.kind === 'hl' ? 3.5 : 5.5}" style="fill:${p.kind === 'hl' ? 'var(--panel)' : c};stroke:${c}" class="ev-mark"></circle>
        ${p.text && p.lane === 0 ? `<text x="${px + 9}" y="${cy + 4}" class="ev-label" style="fill:${c}">${esc(p.text)}</text>` : ''}
      </g>`);
    }
    y += TRACK_H;
  }
  y += 14;

  // 15 秒格
  const GRID_H = 22;
  const gridY = y;
  label(`${gridSeconds}秒格`, gridY + GRID_H / 2 + 5);
  const cells = Math.ceil(dur / gridSeconds);
  const cellW = plotW / cells;
  const emptyCells = new Set(state.data.check.issues.filter((i) => i.code === 'W101' && i.ep === ep.id).map((i) => i.from));
  for (let i = 0; i < cells; i += 1) {
    const from = i * gridSeconds;
    const to = Math.min(from + gridSeconds, dur);
    const empty = emptyCells.has(fmtT(from));
    body.push(`<g data-tip="${esc(empty ? `${fmtT(from)}–${fmtT(to)} · 空格子：这${to - from}秒没有新东西` : `${fmtT(from)}–${fmtT(to)}`)}">
      <rect x="${LEFT + i * cellW + 1.5}" y="${gridY}" width="${Math.max(1, cellW - 3)}" height="${GRID_H}" rx="3" class="${empty ? 'cell-empty' : 'cell-ok'}"></rect>
      ${empty ? `<text x="${LEFT + i * cellW + cellW / 2}" y="${gridY + GRID_H / 2 + 4}" text-anchor="middle" class="cell-text">空</text>` : ''}
    </g>`);
  }
  y = gridY + GRID_H + 10;
  const H = y;

  // 竖向时间网格和爆点线画在最底层
  const under = [];
  for (let t = 0; t <= dur; t += step) under.push(`<line x1="${x(t)}" y1="${plotTop}" x2="${x(t)}" y2="${H - 6}" class="time-line"></line>`);
  if (ct !== null) {
    const cx = x(ct);
    under.push(`<line x1="${cx}" y1="${plotTop}" x2="${cx}" y2="${H - 6}" class="climax-line" style="stroke:${hlColor(climax)}"></line>`);
    body.push(`<text x="${cx}" y="${rulerY}" text-anchor="middle" class="tl-climax" style="fill:${hlColor(climax)}">◆ 爆点 ${esc(climax.t)}</text>`);
  }

  return `<svg class="timeline${selHl ? ' has-sel' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ep.id)} 时间线">
    ${under.join('')}${labels.join('')}${body.join('')}
  </svg>`;
}

// 按时间排的清单：节拍做分段标题，铺垫、高光、事件、格子记录、空格子逐行列出
function renderList(ep) {
  const d = state.data;
  const dur = parseT(ep.duration) || 1;
  const gridSeconds = Number(d.project?.gridSeconds) > 0 ? Number(d.project.gridSeconds) : 15;
  const rows = [];
  const ORDER = { setup: 1, event: 2, highlight: 3, grid: 4, empty: 5 };
  for (const su of arr(ep.setups)) rows.push({ t: parseT(su.t), kind: 'setup', data: su });
  for (const ev of arr(ep.events)) rows.push({ t: parseT(ev.t), kind: 'event', data: ev });
  for (const hl of arr(ep.highlights)) rows.push({ t: parseT(hl.t), kind: 'highlight', data: hl });
  for (const g of arr(ep.grid)) rows.push({ t: parseT(g.t), kind: 'grid', data: g });
  for (const i of d.check.issues.filter((x) => x.code === 'W101' && x.ep === ep.id)) {
    rows.push({ t: parseT(i.from), kind: 'empty', data: i });
  }
  rows.sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || ORDER[a.kind] - ORDER[b.kind]);

  const beats = arr(ep.beats)
    .map((b) => ({ ...b, from: parseT(b.from), to: parseT(b.to) }))
    .filter((b) => b.from !== null && b.to !== null)
    .sort((a, b) => a.from - b.from);

  const sel = state.selHl ? getEntry(state.selHl)?.data : null;
  const selSetups = new Set(arr(sel?.setups));
  const refLink = (id) => {
    const e = getEntry(id);
    if (!e) return `<span class="muted">${esc(id)}</span>`;
    const where = e.ep && e.ep.id !== ep.id ? `${e.ep.id} ` : '';
    return `<button class="mini" data-goto="${esc(id)}">${esc(where)}${esc(e.data.t || '')} ${esc(e.data.name || id)}</button>`;
  };

  const line = (r) => {
    const t = r.t !== null ? fmtT(r.t) : '—';
    const issues = r.kind === 'empty' ? [] : issuesFor(r.data.id);
    const issueHtml = issues.map((i) => `<div class="row-issue lvl-${i.level}">${esc(i.code)} ${esc(i.message)}</div>`).join('');
    if (r.kind === 'highlight') {
      const hl = r.data;
      const c = hlColor(hl);
      const setups = arr(hl.setups);
      return `<div class="lrow hl${hl.climax ? ' climax' : ''}${sel?.id === hl.id ? ' is-sel' : ''}" data-row="${hl.id}" data-hlsel="${hl.id}" style="--c:${c}">
        <span class="lt">${t}</span>
        <span class="lk">${tag(hl.climax ? '◆ 爆点' : '★ 高光', c)}${tag(hl.type, c)}</span>
        <div class="lb"><b>${esc(hl.name || hl.id)}</b>${hl.clip ? '<span class="clip">✂ 可切片</span>' : ''}${hl.growth ? `<span class="growth">变强 ${esc(hl.growth)}</span>` : ''}
          <p>${esc(hl.summary || '')}</p>
          ${setups.length ? `<div class="links"><span class="muted">← 铺垫</span>${setups.map(refLink).join('')}</div>` : hl.noSetupReason ? `<div class="links muted">不需要铺垫：${esc(hl.noSetupReason)}</div>` : ''}
          ${issueHtml}</div>
      </div>`;
    }
    if (r.kind === 'setup') {
      const su = r.data;
      const c = suColor(su);
      const pays = payoffsOf(su.id);
      return `<div class="lrow su${selSetups.has(su.id) ? ' is-sel' : ''}" data-row="${su.id}" data-detail="${su.id}" style="--c:${c}">
        <span class="lt">${t}</span>
        <span class="lk">${tag('○ 铺垫', c)}${tag(su.kind, c)}${su.longTerm ? tag('长线', 'var(--s-plant)') : ''}</span>
        <div class="lb"><b>${esc(su.name || su.id)}</b><p>${esc(su.summary || '')}</p>
          ${pays.length ? `<div class="links"><span class="muted">→ 兑现</span>${pays.map((p) => refLink(p.hl.id)).join('')}</div>` : `<div class="links muted">还没有被兑现</div>`}
          ${issueHtml}</div>
      </div>`;
    }
    if (r.kind === 'event') {
      const ev = r.data;
      const c = refColor(ev.ref);
      const name = getEntry(ev.ref)?.data.name || ev.ref;
      return `<div class="lrow ev" data-row="${ev.id}" data-detail="${ev.id}" style="--c:${c}">
        <span class="lt">${t}</span>
        <span class="lk">${tag(name, c)}${tag(ev.layer ? `${ev.kind} 第${ev.layer}层` : ev.kind, c)}</span>
        <div class="lb"><p>${esc(ev.summary || '')}</p>
          ${ev.infoGap || ev.channel ? `<div class="meta">${ev.infoGap ? `<span>信息差 ${esc(ev.infoGap)}</span>` : ''}${ev.channel ? `<span>投放 ${esc(ev.channel)}</span>` : ''}</div>` : ''}
          ${issueHtml}</div>
      </div>`;
    }
    if (r.kind === 'grid') {
      return `<div class="lrow grid"><span class="lt">${t}</span><span class="lk">${tag('画面', 'var(--muted)')}</span><div class="lb"><p>${esc(r.data.new || '')}</p></div></div>`;
    }
    const to = Math.min((r.t ?? 0) + gridSeconds, dur);
    return `<div class="lrow empty"><span class="lt">${t}</span><span class="lk">${tag('⚠ 空格子', 'var(--danger)')}</span><div class="lb"><p>${t}–${fmtT(to)} 这 ${to - (r.t ?? 0)} 秒没有新东西，观众可能在这里划走</p></div></div>`;
  };

  const sections = [];
  let ri = 0;
  for (const b of beats) {
    const inside = [];
    while (ri < rows.length && (rows[ri].t ?? 0) < b.to) inside.push(rows[ri++]);
    sections.push(`<section class="lsec">
      <div class="lsec-head" style="--c:${BEAT_COLOR[b.type] || 'var(--beat-after)'}"><span class="lt">${fmtT(b.from)}–${fmtT(b.to)}</span><b>${esc(b.type)}</b>${b.label ? `<span>${esc(b.label)}</span>` : ''}</div>
      ${inside.map(line).join('') || '<div class="lrow none"><span class="lt"></span><span class="lk"></span><div class="lb muted">这一段没有条目</div></div>'}
    </section>`);
  }
  if (ri < rows.length) sections.push(`<section class="lsec">${rows.slice(ri).map(line).join('')}</section>`);
  return sections.join('');
}

function renderEpisode() {
  const d = state.data;
  const ep = d.episodes.find((e) => e.id === state.ep) || d.episodes[0];
  if (!ep) {
    view.innerHTML = '<p class="muted">还没有集。</p>';
    return;
  }
  state.ep = ep.id;
  const climax = climaxOf(ep);
  const unit = d.units.find((u) => u.id === ep.unit);
  const switcher = d.episodes
    .map((e) => `<button class="ep-chip${e.id === ep.id ? ' active' : ''}" data-ep="${e.id}" style="--uc:${unitVar(e.unit)}">
      <b>${e.id}</b><span>${esc(e.name || '')}</span></button>`)
    .join('');
  const legacy = arr(unit?.legacy)
    .map((x) => `<li>${tag(x.kind, 'var(--ink-soft)')} ${esc(x.desc)}${x.ref ? ` <button class="mini" data-goto="${esc(x.ref)}">${esc(getEntry(x.ref)?.data.name || x.ref)}</button>` : ''}</li>`)
    .join('');
  const sel = state.selHl ? getEntry(state.selHl) : null;
  const selNote =
    sel && sel.ep?.id === ep.id
      ? `<div class="sel-note" style="--c:${hlColor(sel.data)}">
          <span>已选中 <b>${sel.data.climax ? '◆' : '★'} ${esc(sel.data.name || sel.data.id)}</b></span>
          <span class="muted">铺垫：</span>${
            arr(sel.data.setups)
              .map((sid) => {
                const s = getEntry(sid);
                const cross = s?.ep && s.ep.id !== ep.id;
                return `<button class="mini${cross ? ' cross' : ''}" data-goto="${esc(sid)}">${cross ? `← ${esc(s.ep.id)} ` : ''}${esc(s?.data.t || '')} ${esc(s?.data.name || sid)}</button>`;
              })
              .join('') || `<span class="muted">${sel.data.noSetupReason ? `不需要（${esc(sel.data.noSetupReason)}）` : '没有'}</span>`
          }
          <button class="mini clear" data-hlsel="${sel.data.id}">取消选中 Esc</button>
        </div>`
      : '';
  const legend = Object.entries(HL_COLOR).map(([k, c]) => `<span>${dot(c)}${k}</span>`).join('')
    + '<span class="sep"></span>'
    + Object.entries(SU_COLOR).map(([k, c]) => `<span><i class="ring" style="--c:${c}"></i>${k}</span>`).join('');

  view.innerHTML = `
    <div class="ep-switcher">${switcher}</div>
    <header class="ep-head" style="--uc:${unitVar(ep.unit)}">
      <div class="ep-title">
        <h2><span class="muted">${esc(ep.id)}</span> ${esc(ep.name || '')}</h2>
        <p>${esc(ep.summary || '')}</p>
      </div>
      <div class="ep-meta">
        <span><small>时长</small>${esc(ep.duration || '—')}</span>
        <button data-detail="${esc(ep.unit)}"><small>单元</small><span>${dot(unitVar(ep.unit))}${esc(unit?.name || ep.unit || '—')}</span></button>
        ${climax ? `<button data-hlsel="${climax.id}" style="--c:${hlColor(climax)}"><small>爆点</small><b class="c">◆ ${esc(climax.t)} ${esc(climax.name || '')}</b></button>` : ''}
      </div>
    </header>
    <div class="hooks">
      <div class="hook"><small>前 5 秒钩子</small><p>${esc(ep.hook || '—')}</p></div>
      <div class="hook end"><small>结尾钩子</small><p>${esc(ep.endHook || '—')}</p></div>
    </div>
    <section class="panel">
      <div class="panel-head"><h3>时间线</h3><div class="legend">${legend}</div><span class="hint">点高光，看它的铺垫</span></div>
      ${selNote}
      <div class="timeline-scroll" id="timeline-box"></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>按时间顺序</h3><span class="hint">点任意一行看详情</span></div>
      <div class="list">${renderList(ep)}</div>
    </section>
    ${renderBoard(ep)}
    ${legacy ? `<section class="panel"><div class="panel-head"><h3>本单元留下的东西</h3></div><ul class="legacy">${legacy}</ul></section>` : ''}`;
  const box = $('#timeline-box');
  box.innerHTML = renderTimeline(ep, Math.max(960, box.clientWidth));
}

// ---------- 分镜 ----------
// 像翻漫画一样读：场次卡 + 一排漫画格；格子宽度按秒数缩放，台词是气泡，VO 是旁白框。

const SIZE_CLASS = { 远景: 'far', 全景: 'full', 中景: 'mid', 近景: 'near', 特写: 'close' };
const MOVE_ARROW = { 推: '→', 拉: '←', 摇: '↔', 移: '⇢', 跟: '⇉', 升降: '↕', 手持: '≈', 主观: '◉', 固定: '·' };

function whoName(who) {
  return getEntry(who)?.data.name || who || '?';
}

function whoColor(who) {
  return charColor.get(who) || 'var(--muted)';
}

function emotionAt(ep, t) {
  const pts = arr(ep.emotion).map((p) => ({ t: parseT(p.t), v: Number(p.v) })).filter((p) => p.t !== null).sort((a, b) => a.t - b.t);
  if (!pts.length || t === null) return null;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i += 1) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      return a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1, b.t - a.t);
    }
  }
  return pts[pts.length - 1].v;
}

function shotPanel(ep, shot) {
  const realized = arr(shot.realizes).map(getEntry).filter(Boolean);
  const hls = realized.filter((e) => e.type === 'highlight');
  const climax = hls.find((e) => e.data.climax);
  const pinned = realized.some((e) => e.type === 'setup');
  const dur = Number(shot.dur) || 3;
  const width = Math.round(Math.min(440, Math.max(150, dur * 26)) * (climax ? 1.35 : 1));
  const emo = emotionAt(ep, parseT(shot.t));
  const lines = arr(shot.lines);
  const vo = lines.filter((l) => l.kind === 'VO');
  const spoken = lines.filter((l) => l.kind !== 'VO');
  const goto = realized[0]?.data.id;
  const lineNo = (l) => lines.indexOf(l) + 1;
  const star = hls.length
    ? `<span class="shot-star" style="--c:${hlColor((climax || hls[0]).data)}">${climax ? '◆' : '★'} ${esc(hls.map((h) => h.data.name).join('、'))}</span>`
    : '';
  return `<div class="shot shot-${SIZE_CLASS[shot.size] || 'mid'}${climax ? ' shot-climax' : ''}" style="width:${width}px"${goto ? ` data-goto="${esc(goto)}"` : ''}>
    <div class="shot-emo" title="情绪 ${emo === null ? '—' : emo.toFixed(1)}"><i style="width:${emo === null ? 0 : emo * 10}%"></i></div>
    <div class="shot-frame">
      <div class="shot-head"><b>${esc(shot.size || '?')}</b>${shot.move && shot.move !== '固定' ? `<span>${MOVE_ARROW[shot.move] || ''}${esc(shot.move)}</span>` : ''}${pinned ? '<span class="shot-pin" title="落实了铺垫">📌</span>' : ''}${star}</div>
      ${vo.map((l) => `<div class="caption" style="--c:${whoColor(l.who)}"><small>${esc(whoName(l.who))} · VO${cmtButton(`${shot.id}#${lineNo(l)}`, true)}</small>${esc(l.text)}</div>`).join('')}
      <p class="shot-text">${esc(shot.frame || '')}</p>
      ${spoken.map((l) => `<div class="bubble${l.kind === '画外' ? ' off' : ''}" style="--c:${whoColor(l.who)}"><small>${esc(whoName(l.who))}${l.kind === '画外' ? ' · 画外' : ''}${cmtButton(`${shot.id}#${lineNo(l)}`, true)}</small>${esc(l.text)}</div>`).join('')}
      ${shot.sound ? `<div class="shot-sound">♪ ${esc(shot.sound)}</div>` : ''}
    </div>
    <div class="shot-foot">${esc(shot.t || '')} · ${dur} 秒${shot.id ? cmtButton(shot.id) : ''}</div>
  </div>`;
}

function plainScene(sc, no) {
  const wants = arr(sc.wants).map((w) => `${esc(whoName(w.who))}：${esc(w.want)}`).join('<br>');
  const shots = arr(sc.shots)
    .map((shot) => {
      const head = [shot.size, shot.move].filter(Boolean).join('·');
      const lines = arr(shot.lines)
        .map((l) => `<div class="pl-line"><b>${esc(whoName(l.who))}</b>${l.kind && l.kind !== '对白' ? `（${esc(l.kind)}）` : ''}：${esc(l.text)}</div>`)
        .join('');
      return `<div class="pl-shot"><span class="pl-t">${esc(shot.t)}</span><div><span class="pl-head">【${esc(head)} ${esc(String(shot.dur ?? '?'))}秒】</span>${esc(shot.frame || '')}${lines}${shot.sound ? `<div class="pl-line muted">♪ ${esc(shot.sound)}</div>` : ''}</div></div>`;
    })
    .join('');
  return `<div class="pl-scene"><h4>第 ${no} 场　${esc(sc.place || '')} <span class="muted">${esc(sc.from)}–${esc(sc.to)}</span></h4>
    ${wants ? `<p class="muted">想要：${wants}</p>` : ''}${sc.turn ? `<p class="muted">转：${esc(sc.turn)}</p>` : ''}
    ${shots}${sc.next ? `<p class="muted">→ 下一场：${esc(sc.next)}</p>` : ''}</div>`;
}

function renderBoard(ep) {
  const scenes = arr(ep.scenes);
  if (!scenes.length) return '';
  const toggle = `<button class="mini" data-scriptmode>${state.scriptPlain ? '看分镜' : '纯文本'}</button>`;
  const body = scenes
    .map((sc, i) => {
      if (state.scriptPlain) return plainScene(sc, i + 1);
      const issues = issuesFor(sc.id).filter((x) => x.level !== 'info').map((x) => `<div class="row-issue lvl-${x.level}">${esc(x.code)} ${esc(x.message)}</div>`).join('');
      const wants = arr(sc.wants).map((w) => `<div class="want" style="--c:${whoColor(w.who)}"><b>${esc(whoName(w.who))}</b>${esc(w.want)}</div>`).join('');
      return `<article class="scene">
        <header class="scene-card" data-goto="${esc(sc.id)}">
          <div class="scene-title"><span class="scene-no">第 ${i + 1} 场</span><b>${esc(sc.place || '')}</b><span class="muted">${esc(sc.from)}–${esc(sc.to)}</span>${cmtButton(sc.id)}</div>
          ${wants ? `<div class="wants">${wants}</div>` : ''}
          ${sc.turn ? `<div class="turn"><span>转</span>${esc(sc.turn)}</div>` : ''}
          ${issues}
        </header>
        <div class="strip">${arr(sc.shots).map((shot) => shotPanel(ep, shot)).join('')}</div>
        ${sc.next ? `<div class="next">→ 下一场：${esc(sc.next)}</div>` : ''}
      </article>`;
    })
    .join('');
  return `<section class="panel board">
    <div class="panel-head"><h3>分镜</h3><span class="hint">像翻漫画一样读：气泡是台词，方框是 VO，★ 是高光，📌 是铺垫；点格子看它落实了什么</span>${toggle}</div>
    ${body}
  </section>`;
}

// ---------- 评论 ----------
// 网页上只有用户在写：新建、回复、自己关掉。AI 在 CLI 里读、讨论、结案。

const OPEN = ['待处理', '讨论中'];
const STATUS_COLOR = { 待处理: 'var(--danger)', 讨论中: 'var(--warn)', 已采纳: 'var(--h-fun)', 已拒绝: 'var(--muted)', 已解决: 'var(--muted)' };

function allComments() {
  return arr(state.data?.comments);
}

function openComments() {
  return allComments().filter((c) => OPEN.includes(c.status));
}

function baseOf(target) {
  return String(target || '').split('#')[0];
}

// 某个目标上的评论；镜头的话，连它的每一句台词一起算
function commentsOn(target, withLines = false) {
  return allComments().filter((c) => c.target === target || (withLines && baseOf(c.target) === target && c.target.includes('#')));
}

function cmtButton(target, small = false) {
  const open = commentsOn(target).filter((c) => OPEN.includes(c.status)).length;
  return `<button class="cmt${small ? ' small' : ''}${open ? ' has' : ''}" data-cmt="${esc(target)}" title="评论">💬${open ? ` ${open}` : ''}</button>`;
}

function targetLabel(target) {
  const [id, line] = String(target).split('#');
  const entry = getEntry(id);
  const base = entry ? `${TYPE_LABELS[entry.type] || ''} ${entry.data.name || id}` : id;
  return line ? `${base} 第 ${line} 句` : base;
}

function draftBox(key, placeholder, button, data) {
  return `<div class="cmt-form"><textarea data-draft="${esc(key)}" placeholder="${esc(placeholder)}">${esc(state.drafts[key] || '')}</textarea>
    <button class="mini primary" ${data}>${button}</button></div>`;
}

function commentCard(c, { showTarget = false } = {}) {
  const thread = arr(c.thread)
    .map((m) => `<div class="msg ${m.by === 'AI' ? 'ai' : 'me'}"><small>${m.by === 'AI' ? 'AI' : '我'} · ${esc(m.at || '')}</small><p>${esc(m.text)}</p></div>`)
    .join('');
  const open = OPEN.includes(c.status);
  return `<div class="cmt-card" style="--c:${STATUS_COLOR[c.status] || 'var(--muted)'}">
    <div class="cmt-head"><b>${esc(c.id)}</b><span class="cmt-status">${esc(c.status)}</span>
      ${showTarget ? `<button class="mini" data-cmt="${esc(c.target)}">${esc(targetLabel(c.target))}</button>` : ''}</div>
    ${c.quote ? `<blockquote>${esc(c.quote)}</blockquote>` : ''}
    ${thread}
    ${draftBox(`reply:${c.id}`, open ? '接着说…' : '还有话要说？回复会重新打开它', '回复', `data-cmt-reply="${esc(c.id)}"`)}
    ${open ? `<button class="mini" data-cmt-close="${esc(c.id)}">我这边没问题了，关掉</button>` : ''}
  </div>`;
}

// 详情面板底部：这个条目上的评论 + 写新评论
function commentBlock(entry) {
  const id = entry.data.id;
  const list = commentsOn(id, entry.type === 'shot');
  const lines = entry.type === 'shot' ? arr(entry.data.lines) : [];
  const target = state.commentTarget && baseOf(state.commentTarget) === id ? state.commentTarget : id;
  const choices = lines.length
    ? `<div class="cmt-choose">评论：<button class="mini${target === id ? ' active' : ''}" data-cmt="${esc(id)}">整个镜头</button>${lines
        .map((l, i) => `<button class="mini${target === `${id}#${i + 1}` ? ' active' : ''}" data-cmt="${esc(`${id}#${i + 1}`)}">第 ${i + 1} 句：${esc(whoName(l.who))}「${esc(String(l.text).slice(0, 12))}${String(l.text).length > 12 ? '…' : ''}」</button>`)
        .join('')}</div>`
    : '';
  return `<h3 id="cmt-anchor">评论（${list.length}）</h3>
    ${list.map((c) => commentCard(c, { showTarget: c.target !== id })).join('')}
    ${choices}
    ${draftBox(`new:${target}`, `对「${targetLabel(target)}」说点什么…`, '发表评论', `data-cmt-new="${esc(target)}"`)}`;
}

function renderComments() {
  const list = state.commentFilter === 'open' ? openComments() : allComments();
  const sorted = list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const filter = ['open', 'all']
    .map((f) => `<button class="mini${state.commentFilter === f ? ' active' : ''}" data-cmt-filter="${f}">${f === 'open' ? `没处理完（${openComments().length}）` : `全部（${allComments().length}）`}</button>`)
    .join('');
  view.innerHTML = `<section class="panel">
    <div class="panel-head"><h3>评论</h3><div class="legend">${filter}</div><span class="hint">在分镜、台词或任何详情面板里点 💬 留评论；回到对话里说"处理评论"，AI 会一条条和你讨论</span></div>
    ${sorted.length ? sorted.map((c) => commentCard(c, { showTarget: true })).join('') : '<p class="muted">还没有评论。</p>'}
  </section>`;
}

async function postComment(path, body) {
  const res = await fetch(`/api/comments${path}?project=${encodeURIComponent(state.project)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `提交失败：${res.status}`);
  await loadData();
  renderAll();
}

function openCommentTarget(target) {
  const id = baseOf(target);
  if (!index.has(id)) return;
  state.commentTarget = target;
  openDetail(id);
  setTimeout(() => $('#cmt-anchor')?.scrollIntoView({ block: 'start' }), 0);
}

// ---------- 资料 ----------

function chipEp(id) {
  return `<button class="chip ep" data-ep="${id}">${esc(id)}</button>`;
}

function appearLine(id) {
  const eps = appearances(id);
  if (!eps.length) return '<div class="appear"><span class="muted">尚未出现</span></div>';
  return `<div class="appear"><span class="muted">出现在</span>${eps.map(chipEp).join('')}</div>`;
}

function cardNotes(notes) {
  const list = noteList(notes);
  if (!list.length) return '';
  const latest = list[list.length - 1];
  return `<details class="card-notes">
    <summary>决策记录 ${list.length} 条<span class="muted"> · 最新：${esc(latest.what || '')}</span></summary>
    ${notesHtml(notes)}
  </details>`;
}

function card(entry) {
  const { type, data } = entry;
  const color = refColor(data.id);
  const kv = (k, v, cls = '') => (v ? `<div class="kv ${cls}"><span>${k}</span><p>${v}</p></div>` : '');
  let body = '';
  if (type === 'character') {
    body = [
      kv('视觉', esc(data.visual)),
      kv('能力', esc(data.ability)),
      kv('限制', esc(data.limit)),
      kv('变强', arr(data.growth).map((g) => tag(g, color)).join('')),
      kv('情绪', esc(data.emotion)),
      kv('VO', data.vo ? esc(data.vo) : data.layer === '核心' ? '<span class="muted">没有 VO</span>' : ''),
      data.layer !== '核心' ? kv('去向', esc(data.fate || '—')) : '',
      kv('关系', arr(data.relations).map((r) => `${esc(r.kind)} <button class="mini" data-goto="${esc(r.to)}">${esc(getEntry(r.to)?.data.name || r.to)}</button>`).join(' ')),
      kv('秘密', esc(data.secret), 'secret'),
    ].join('');
  } else if (type === 'world') {
    const layers = arr(data.layers)
      .map((l) => {
        const reveal = state.data.episodes.find((ep) => arr(ep.events).some((ev) => ev.ref === data.id && ev.kind === '揭示' && ev.layer === l.no));
        return `<li><b>第 ${l.no} 层</b> ${esc(l.desc)} ${reveal ? chipEp(reveal.id) : '<span class="muted">未揭开</span>'}</li>`;
      })
      .join('');
    body = kv('设定', esc(data.truth)) + (layers ? `<div class="kv"><span>揭开</span><ul class="layers">${layers}</ul></div>` : '');
  } else if (type === 'thread') {
    body = kv('问题', esc(data.question)) + kv('结局', esc(data.ending), 'secret') + kv('断档上限', `${data.maxGap ?? 3} 集`);
  } else if (type === 'unit') {
    const legacy = arr(data.legacy).map((x) => `<li>${tag(x.kind, color)} ${esc(x.desc)}</li>`).join('');
    body = kv('情绪', esc(data.emotion)) + (legacy ? `<div class="kv"><span>留下</span><ul class="legacy">${legacy}</ul></div>` : '');
  }
  const kind = type === 'character' ? data.layer : type === 'unit' ? '单元' : data.kind;
  return `<article class="card" data-detail="${data.id}" style="--c:${color}">
    <header><h3>${esc(data.name || data.id)}</h3>${tag(kind || '', color)}</header>
    <p class="card-summary">${esc(data.summary || '')}</p>
    ${body}
    ${cardNotes(data.notes)}
    ${type === 'unit' ? `<div class="appear"><span class="muted">包含</span>${arr(data.episodes).map(chipEp).join('')}</div>` : appearLine(data.id)}
  </article>`;
}

function renderLibrary() {
  const d = state.data;
  const { core, unit } = sortedCharacters();
  const groups = [
    { title: '核心角色', color: 'var(--c-core)', entries: core.map((c) => ({ type: 'character', data: c })) },
    { title: '单元角色', color: 'var(--u1)', entries: unit.map((c) => ({ type: 'character', data: c })) },
    { title: '贯穿线', color: 'var(--t-question)', entries: d.threads.map((t) => ({ type: 'thread', data: t })) },
    { title: '世界 · 规则类', color: 'var(--w-rule)', entries: d.world.filter((w) => w.kind === '规则').map((w) => ({ type: 'world', data: w })) },
    { title: '世界 · 秘密类', color: 'var(--w-secret)', entries: d.world.filter((w) => w.kind === '秘密').map((w) => ({ type: 'world', data: w })) },
    { title: '单元', color: 'var(--u2)', entries: d.units.map((u) => ({ type: 'unit', data: u })) },
  ];
  view.innerHTML = groups
    .filter((g) => g.entries.length)
    .map((g) => `<section class="library-group"><h2>${dot(g.color)}${g.title}<span class="muted">${g.entries.length}</span></h2><div class="cards">${g.entries.map(card).join('')}</div></section>`)
    .join('');
}

// ---------- 详情面板 ----------

const DETAIL_FIELDS = {
  character: [['layer', '层级'], ['visual', '视觉'], ['ability', '能力'], ['limit', '限制'], ['abilityReflects', '能力里写着什么'], ['limitChoice', '限制逼他做什么选择'], ['anchors', '身边能引出单元的人和处境'], ['growth', '变强方式'], ['emotion', '情绪'], ['vo', 'VO'], ['unit', '所属单元'], ['want', '一个想要'], ['fate', '单元结束后去向'], ['exit', '退场的去处'], ['relations', '关系'], ['secret', '秘密'], ['ritual', '固定动作'], ['mirror', '镜像'], ['circle', '知情圈']],
  world: [['kind', '类型'], ['truth', '完整设定'], ['layers', '揭开层次']],
  thread: [['kind', '类型'], ['question', '让人惦记的问题'], ['ending', '结局'], ['maxGap', '最多连续不推进']],
  unit: [['episodes', '包含的集'], ['emotion', '核心情绪'], ['question', '主题问题'], ['anchor', '挂在哪个核心角色身上'], ['changes', '谁变了'], ['reveal', '知情圈怎么动'], ['legacy', '留下的东西']],
  episode: [['no', '集号'], ['duration', '时长'], ['unit', '所属单元'], ['hook', '钩子'], ['endHook', '结尾钩子']],
  highlight: [['t', '时间'], ['type', '类型'], ['climax', '情绪爆点'], ['fightType', '打斗类型'], ['fightEnding', '打斗结局'], ['line', '高潮台词'], ['growth', '变强方式'], ['clip', '可切片'], ['setups', '铺垫'], ['noSetupReason', '无铺垫原因'], ['refs', '涉及']],
  setup: [['t', '时间'], ['kind', '类型'], ['longTerm', '长线伏笔']],
  event: [['t', '时间'], ['ref', '指向'], ['kind', '动作'], ['layer', '揭示层次'], ['infoGap', '信息差'], ['channel', '投放渠道']],
  scene: [['from', '开始'], ['to', '结束'], ['wants', '谁想要什么'], ['turn', '怎么转'], ['next', '接下一场的理由']],
  shot: [['t', '开始'], ['dur', '秒数'], ['size', '景别'], ['move', '运镜'], ['frame', '画面'], ['lines', '台词'], ['sound', '音效'], ['realizes', '落实了']],
};

function linkId(id) {
  const name = getEntry(id)?.data.name;
  return `<button class="mini" data-goto="${esc(id)}">${esc(name || id)}</button>`;
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') {
    if (['unit', 'ref', 'to', 'anchor', 'mirror', 'changes'].includes(key) && index.has(value)) return linkId(value);
    return esc(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    if (key === 'growth') return value.map((g) => tag(g, 'var(--ink-soft)')).join('');
    if (key === 'episodes') return value.map(chipEp).join(' ');
    if (['setups', 'refs', 'realizes'].includes(key)) return value.map(linkId).join(' ');
    if (value.every((v) => typeof v === 'string')) return value.map((v) => esc(v)).join('、');
    if (key === 'relations') {
      return value.map((r) => `<div>${esc(r.kind)}：${linkId(r.to)} <span class="muted">${esc(r.desc)}</span></div>`).join('');
    }
    if (key === 'legacy') {
      return `<ul class="legacy">${value.map((x) => `<li>${esc(x.kind)}：${esc(x.desc)}${x.ref ? ` ${linkId(x.ref)}` : ''}</li>`).join('')}</ul>`;
    }
    if (key === 'circle') {
      return value.map((c) => `<div>${c?.who && index.has(c.who) ? linkId(c.who) : esc(c?.who || '')}：<span class="muted">${esc(c?.desc || '')}</span></div>`).join('');
    }
    if (key === 'lines') {
      return value.map((l, i) => `<div>${i + 1}. <b>${esc(whoName(l.who))}</b>${l.kind && l.kind !== '对白' ? `（${esc(l.kind)}）` : ''}：${esc(l.text)}</div>`).join('');
    }
    if (key === 'wants') {
      return value.map((w) => `<div>${w?.who && index.has(w.who) ? linkId(w.who) : esc(w?.who || '')}：<span class="muted">${esc(w?.want || '')}</span></div>`).join('');
    }
    if (key === 'layers') {
      return value.map((l) => `<div>第 ${l.no} 层：${esc(l.desc)}</div>`).join('');
    }
    return esc(JSON.stringify(value));
  }
  return esc(String(value));
}

// notes：决策记录数组（新的追加在末尾），也兼容旧的纯文本
function noteList(notes) {
  if (typeof notes === 'string') return notes.trim() ? [{ what: notes }] : [];
  return arr(notes).filter((n) => n && typeof n === 'object');
}

function notesHtml(notes) {
  const list = noteList(notes).slice().reverse();
  const part = (label, text, cls) => (text ? `<div class="note-part ${cls}"><span>${label}</span><p>${esc(text)}</p></div>` : '');
  return `<ol class="note-list">${list
    .map(
      (n) => `<li>
        <div class="note-head">${n.date ? `<span class="note-date">${esc(n.date)}</span>` : ''}<p class="note-what">${esc(n.what || '')}</p></div>
        ${part('理由', n.why, 'why')}${part('否掉的方案', n.rejected, 'rejected')}${part('风险', n.risk, 'risk')}
      </li>`,
    )
    .join('')}</ol>`;
}

function renderNotes(notes) {
  const n = noteList(notes).length;
  return n ? `<h3>决策记录（${n}）</h3>${notesHtml(notes)}` : '';
}

function detailColor(entry) {
  const { type, data } = entry;
  if (type === 'highlight') return hlColor(data);
  if (type === 'setup') return suColor(data);
  if (type === 'event') return refColor(data.ref);
  if (type === 'episode') return unitVar(data.unit);
  return refColor(data.id);
}

function renderDetail() {
  const entry = getEntry(state.detail);
  if (!entry) {
    detail.hidden = true;
    state.detail = null;
    return;
  }
  const { type, data } = entry;
  const fields = DETAIL_FIELDS[type] || [];
  const rows = fields
    .filter(([key]) => data[key] !== undefined)
    .map(([key, label]) => `<div class="detail-field"><span class="field-key">${label}</span><span class="field-value">${formatValue(key, data[key])}</span></div>`)
    .join('');
  const refs = state.data.refs?.[data.id] || [];
  const refList = refs.length
    ? `<ul class="ref-list">${refs
        .map((r) => `<li>${r.ep ? chipEp(r.ep) : ''}${linkId(r.from)}${r.t ? ` <span class="muted">${esc(r.t)}</span>` : ''} <span class="muted">${esc(r.kind)}</span>${r.label ? ` ${esc(r.label)}` : ''}</li>`)
        .join('')}</ul>`
    : '<p class="muted">没有被引用</p>';
  const issues = issuesFor(data.id).map((i) => `<div class="row-issue lvl-${i.level}">${esc(i.code)} ${esc(i.message)}</div>`).join('');

  detail.style.setProperty('--c', detailColor(entry));
  $('#detail-body').innerHTML = `
    <div class="detail-type">${TYPE_LABELS[type] || type}${entry.ep ? ` · ${esc(entry.ep.id)}` : ''}</div>
    <h2>${esc(data.name || data.id || state.detail)}</h2>
    ${data.summary ? `<p class="summary">${esc(data.summary)}</p>` : ''}
    ${type === 'episode' ? `<button class="chip ep" data-ep="${data.id}">打开单集</button>` : ''}
    ${issues}
    <div class="fields">${rows}</div>
    ${renderNotes(data.notes)}
    <h3>被引用</h3>
    ${refList}
    ${commentBlock(entry)}`;
  detail.hidden = false;
}

function openDetail(id) {
  if (!index.has(id)) return;
  state.detail = id;
  renderDetail();
}

function closeDetail() {
  state.detail = null;
  state.commentTarget = null;
  detail.hidden = true;
}

// ---------- 提示框 ----------

function showTooltip(target, px, py) {
  const text = target.dataset.tip;
  if (!text) return;
  tooltip.textContent = text;
  tooltip.hidden = false;
  moveTooltip(px, py);
}

function moveTooltip(px, py) {
  if (tooltip.hidden) return;
  const rect = tooltip.getBoundingClientRect();
  let left = px + 14;
  let top = py + 14;
  if (left + rect.width > window.innerWidth - 10) left = px - rect.width - 14;
  if (top + rect.height > window.innerHeight - 10) top = py - rect.height - 14;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

// 清单行和时间线标记互相高亮
function setHot(id, on) {
  for (const el of document.querySelectorAll(`[data-mk="${CSS.escape(id)}"], [data-row="${CSS.escape(id)}"]`)) {
    el.classList.toggle('hot', on);
  }
}

// ---------- 交互 ----------

function goEpisode(id) {
  state.view = 'episode';
  if (state.ep !== id) state.selHl = null;
  state.ep = id;
  renderAll();
  window.scrollTo(0, 0);
}

function setView(name) {
  if (name === 'episode') {
    state.view = 'episode';
    state.ep = state.ep || state.data?.episodes[0]?.id || null;
  } else {
    state.view = name;
  }
  renderAll();
}

function bind() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('summary')) return; // 展开决策记录，不打开详情
    if (e.target.closest('textarea')) return;
    const cmt = e.target.closest('[data-cmt]');
    if (cmt) {
      e.stopPropagation();
      openCommentTarget(cmt.dataset.cmt);
      return;
    }
    const send = e.target.closest('[data-cmt-new], [data-cmt-reply], [data-cmt-close]');
    if (send) {
      const { cmtNew, cmtReply, cmtClose } = send.dataset;
      const key = cmtNew ? `new:${cmtNew}` : cmtReply ? `reply:${cmtReply}` : null;
      const text = key ? (state.drafts[key] || '').trim() : '';
      if (key && !text) return;
      const req = cmtNew
        ? postComment('', { target: cmtNew, text })
        : cmtReply
          ? postComment('/reply', { id: cmtReply, text })
          : postComment('/close', { id: cmtClose });
      send.disabled = true;
      req
        .then(() => {
          if (key) delete state.drafts[key];
          if (state.detail) renderDetail();
          else if (state.view === 'comments') renderComments();
        })
        .catch((err) => showBanner(err.message))
        .finally(() => {
          send.disabled = false;
        });
      return;
    }
    const cmtFilter = e.target.closest('[data-cmt-filter]');
    if (cmtFilter) {
      state.commentFilter = cmtFilter.dataset.cmtFilter;
      renderComments();
      return;
    }
    const close = e.target.closest('[data-close]');
    if (close) {
      closeDetail();
      return;
    }
    const issue = e.target.closest('.issue-row');
    if (issue) {
      const ep = issue.dataset.issueEp;
      const target = issue.dataset.issueTarget;
      if (ep) goEpisode(ep);
      if (target !== ep && index.has(target)) openDetail(target);
      $('#issue-panel').hidden = true;
      return;
    }
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      const entry = getEntry(goto.dataset.goto);
      if (entry?.type === 'highlight' && state.view === 'episode' && entry.ep?.id === state.ep) {
        state.selHl = entry.data.id;
        renderEpisode();
      }
      openDetail(goto.dataset.goto);
      return;
    }
    if (e.target.closest('[data-scriptmode]')) {
      state.scriptPlain = !state.scriptPlain;
      renderEpisode();
      return;
    }
    const hlSel = e.target.closest('[data-hlsel]');
    if (hlSel) {
      const id = hlSel.dataset.hlsel;
      state.selHl = state.selHl === id ? null : id;
      renderEpisode();
      if (state.selHl) openDetail(id);
      return;
    }
    const epBtn = e.target.closest('[data-ep]');
    if (epBtn) {
      goEpisode(epBtn.dataset.ep);
      return;
    }
    const detailBtn = e.target.closest('[data-detail]');
    if (detailBtn) {
      openDetail(detailBtn.dataset.detail);
      return;
    }
    const tab = e.target.closest('[data-view]');
    if (tab) {
      setView(tab.dataset.view);
      return;
    }
    if (e.target.closest('#check-badge')) {
      const panel = $('#issue-panel');
      panel.hidden = !panel.hidden;
    }
  });

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tip]');
    if (target) showTooltip(target, e.clientX, e.clientY);
    const hot = e.target.closest('[data-row], [data-mk]');
    if (hot) setHot(hot.dataset.row || hot.dataset.mk, true);
  });
  document.addEventListener('mousemove', (e) => moveTooltip(e.clientX, e.clientY));
  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tip]');
    if (target && !target.contains(e.relatedTarget)) hideTooltip();
    const hot = e.target.closest('[data-row], [data-mk]');
    if (hot && !hot.contains(e.relatedTarget)) setHot(hot.dataset.row || hot.dataset.mk, false);
  });

  document.addEventListener('input', (e) => {
    const box = e.target.closest?.('[data-draft]');
    if (box) state.drafts[box.dataset.draft] = box.value;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (e.target.closest?.('textarea')) return; // 正在写评论时 Esc 不关面板
    if (state.detail) closeDetail();
    else if (state.selHl) {
      state.selHl = null;
      if (state.view === 'episode') renderEpisode();
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.view === 'episode') renderEpisode();
    }, 150);
  });

  window.addEventListener('hashchange', () => {
    applyHash();
    if (state.view === 'episode' && !state.ep) state.ep = state.data?.episodes[0]?.id || null;
    if (state.data) renderAll();
  });
}

function showBanner(message) {
  const banner = $('#banner');
  banner.textContent = message;
  banner.hidden = false;
}

function connect() {
  const es = new EventSource(`/api/stream?project=${encodeURIComponent(state.project)}`);
  es.addEventListener('change', async () => {
    $('#banner').hidden = true;
    try {
      await loadData();
      renderAll();
    } catch (err) {
      showBanner(`刷新失败：${err.message}`);
    }
  });
  es.addEventListener('error', (e) => {
    if (e.data) {
      try {
        const info = JSON.parse(e.data);
        showBanner(`文件解析失败：${info.file || '未知文件'} — ${info.message}`);
      } catch {
        showBanner('文件解析失败');
      }
    }
  });
}

// ---------- 项目列表（/ 或不存在的 /<slug>） ----------

async function renderProjects() {
  document.body.classList.add('home-page');
  $('#tabs').hidden = true;
  $('#check-badge').hidden = true;
  $('#project-name').textContent = '全部项目';
  let projects;
  try {
    projects = await (await fetch('/api/projects')).json();
  } catch (err) {
    view.innerHTML = `<p class="error-text">读取项目列表失败：${esc(err.message)}</p>`;
    return;
  }
  const missing = state.project && !projects.some((p) => p.slug === state.project);
  if (missing) showBanner(`找不到项目 "${state.project}"，下面是现有的项目。`);
  document.title = 'storyboard';
  view.innerHTML = `
    <div class="cards project-cards">
      ${projects
        .map(
          (p) => `
        <a class="card project-card" href="/${encodeURIComponent(p.slug)}" style="--c:var(--c-core)">
          <header><h3>${esc(p.name)}</h3><code class="muted">/${esc(p.slug)}</code></header>
          <p class="card-summary">${esc(p.summary || '')}</p>
        </a>`,
        )
        .join('')}
    </div>`;
}

async function init() {
  if (!state.project) {
    renderProjects();
    return;
  }
  bind();
  applyHash();
  try {
    await loadData();
  } catch (err) {
    if (err.status === 404) {
      renderProjects();
      return;
    }
    view.innerHTML = `<p class="error-text">读取失败：${esc(err.message)}</p>`;
    return;
  }
  document.title = `${state.data.project?.name || state.data.slug} · storyboard`;
  if (state.view === 'episode' && !state.ep) state.ep = state.data.episodes[0]?.id || null;
  renderAll();
  connect();
}

init();
