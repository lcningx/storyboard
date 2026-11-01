// 检查规则：E001–E006、W101–W117、I201–I208。

import { parseTime, formatTime } from './time.js';

const LEVEL_RANK = { error: 0, warn: 1, info: 2 };

export const ENUMS = {
  beatType: ['钩子', '钩子升级', '教规则', '第一回合', '压', '爆', '余波', '连接'],
  highlightType: ['打斗', '亮相', '反转', '金句', '笑点', '情绪'],
  fightType: ['亮相', '切磋', '教学', '压制', '规则', '团战', '死斗'],
  fightEnding: ['打赢', '打输', '打平', '打出关系', '送别'],
  setupKind: ['规则', '压', '在乎', '伏笔'],
  eventKind: ['露面', '展开', '出场', '支援', '退场', '返场', '推进', '揭示'],
  layer: ['核心', '单元'],
  growth: ['A', 'B', 'C'],
  fate: ['退场', '返场', '伏笔'],
  relationKind: ['克制', '互补', '组合', '镜像', '敌对', '旧识'],
  worldKind: ['规则', '秘密'],
  threadKind: ['大问号', '成长', '威胁'],
  legacyKind: ['角色得到', '世界变化', '关系变化', '遗留问题'],
  infoGap: ['观众<角色', '观众=角色', '观众>角色'],
  channel: ['VO定格', '对白', '路人', '物件', '打斗'],
};

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : '');
const filled = (v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'object') return true;
  return true;
};

function make(code, level, target, message, extra = {}) {
  return { code, level, target, message, ...extra };
}

function targetOf(entry) {
  return typeof entry.data.id === 'string' && entry.data.id ? entry.data.id : entry.file;
}

export function checkProject(project) {
  const issues = [];
  const add = (...args) => issues.push(make(...args));
  const index = project.index;
  const exists = (id) => index.has(id);
  const typeOf = (id) => index.get(id)?.type;
  const meta = project.project || {};
  const epOrder = new Map(project.episodes.map((ep, i) => [ep.id, i]));

  // ---- 解析错误（坏文件不影响其他数据） ----
  for (const file of project.parseErrors || []) {
    add('E900', 'error', file.file, `${file.error}`, { file: file.file });
  }

  // ---- E002 重复 ID / 文件名与 ID 不一致 ----
  for (const dup of project.duplicates || []) {
    add('E002', 'error', dup.id, `ID 重复：同时出现在 ${dup.files.join(' 和 ')}`);
  }
  for (const entry of project.entries) {
    if (entry.sub) continue;
    const id = entry.data.id;
    const base = entry.file.split('/').pop().replace(/\.json$/, '');
    if (entry.type === 'episode') {
      if (!/^ep\d{2}$/.test(base)) {
        add('E002', 'error', id || entry.file, `集的文件名必须是 epNN.json（当前 ${entry.file}）`, { file: entry.file });
      } else if (id !== base) {
        add('E002', 'error', id || entry.file, `文件名与 ID 不一致：${entry.file} 的 ID 是 ${id ?? '(缺失)'}`, { file: entry.file });
      }
    } else {
      const type = entry.type;
      const prefix = { character: 'char.', world: 'world.', thread: 'thread.', unit: 'unit.' }[type];
      if (typeof id === 'string' && id) {
        const expectBase = id.startsWith(prefix) ? id.slice(prefix.length) : null;
        if (expectBase === null || expectBase !== base) {
          add(
            'E002',
            'error',
            id,
            `文件名与 ID 不一致：ID ${id} 应放在 ${type === 'character' ? 'characters' : type === 'world' ? 'world' : type === 'thread' ? 'threads' : 'units'}/${expectBase ?? '?'}.json（当前 ${entry.file}）`,
            { file: entry.file },
          );
        }
      }
    }
  }

  // ---- E006 必填字段 ----
  const require = (obj, target, field, label = field) => {
    if (!filled(obj?.[field])) add('E006', 'error', target, `缺少必填字段：${label}`);
  };
  if (!project.project) {
    add('E006', 'error', 'project.json', '缺少或无法读取项目信息');
  } else {
    for (const [f, label] of [['id', 'id'], ['name', '剧名'], ['summary', '一句话设想'], ['skeleton', '骨架公式']]) {
      require(meta, 'project.json', f, label);
    }
    if (meta.maxEpisodeDuration !== undefined && parseTime(meta.maxEpisodeDuration) === null) {
      add('E003', 'error', meta.id || 'project.json', `maxEpisodeDuration 时间格式错误：${meta.maxEpisodeDuration}`);
    }
  }
  if (project.project && !filled(meta.coreQuestion)) {
    add('I205', 'info', meta.id || 'project.json', '没有写 coreQuestion（全剧核心问题：大结局要回答的那一个问题）');
  }

  for (const entry of project.entries) {
    const d = entry.data;
    const target = targetOf(entry);
    if (entry.type === 'character') {
      require(d, target, 'id');
      require(d, target, 'name', '名字');
      require(d, target, 'summary', '一句话');
      require(d, target, 'layer', '层级');
      if (d.layer === '核心') {
        for (const [f, label] of [['visual', '视觉标签'], ['ability', '能力'], ['limit', '限制'], ['growth', '变强方式']]) {
          require(d, target, f, label);
        }
      }
      if (d.layer === '核心') {
        const missing = [['abilityReflects', '能力里写着什么'], ['limitChoice', '限制逼他做什么选择'], ['anchors', '身边能引出单元的人和处境']].filter(([f]) => !filled(d[f])).map(([, label]) => label);
        if (missing.length) add('I203', 'info', target, `核心角色没有写：${missing.join('、')}`);
      }
      if (d.layer === '单元') {
        require(d, target, 'unit', '所属单元');
        require(d, target, 'fate', '单元结束后去向');
        const missing = [['want', '一个想要'], ['exit', '退场的去处']].filter(([f]) => !filled(d[f])).map(([, label]) => label);
        if (missing.length) add('I207', 'info', target, `单元角色没有写：${missing.join('、')}`);
      }
    } else if (entry.type === 'world') {
      require(d, target, 'id');
      require(d, target, 'name', '名字');
      require(d, target, 'summary', '一句话');
      require(d, target, 'kind', '类型');
      require(d, target, 'truth', '完整设定');
      if (d.kind === '秘密') require(d, target, 'layers', '揭开层次');
    } else if (entry.type === 'thread') {
      require(d, target, 'id');
      require(d, target, 'name', '名字');
      require(d, target, 'summary', '一句话');
      require(d, target, 'kind', '类型');
      require(d, target, 'question', '问题');
      require(d, target, 'ending', '结局');
    } else if (entry.type === 'unit') {
      require(d, target, 'id');
      require(d, target, 'name', '名字');
      require(d, target, 'summary', '一句话');
      require(d, target, 'episodes', '包含的集');
      require(d, target, 'emotion', '核心情绪');
      require(d, target, 'legacy', '留下的东西');
      const missing = [['question', '主题问题'], ['anchor', '挂在哪个核心角色身上']].filter(([f]) => !filled(d[f])).map(([, label]) => label);
      if (missing.length) add('I206', 'info', target, `单元没有写：${missing.join('、')}`);
    } else if (entry.type === 'episode') {
      for (const [f, label] of [
        ['id', 'id'], ['name', '名字'], ['summary', '一句话'], ['no', '集号'], ['duration', '时长'],
        ['unit', '所属单元'], ['hook', '钩子'], ['endHook', '结尾钩子'], ['beats', '节拍'],
        ['highlights', '高光'], ['emotion', '情绪曲线'],
      ]) {
        require(d, target, f, label);
      }
    } else if (entry.type === 'highlight') {
      for (const [f, label] of [['id', 'id'], ['t', '时间'], ['type', '类型'], ['name', '名字'], ['summary', '一句话']]) {
        require(d, target, f, label);
      }
    } else if (entry.type === 'setup') {
      for (const [f, label] of [['id', 'id'], ['t', '时间'], ['name', '名字'], ['summary', '一句话'], ['kind', '类型']]) {
        require(d, target, f, label);
      }
    } else if (entry.type === 'event') {
      for (const [f, label] of [['id', 'id'], ['t', '时间'], ['ref', '指向条目'], ['kind', '类型'], ['summary', '一句话']]) {
        require(d, target, f, label);
      }
      if (d.kind === '揭示' && d.ref) {
        const refEntry = index.get(d.ref);
        if (refEntry?.type === 'world' && refEntry.data.kind === '秘密') {
          require(d, target, 'layer', '揭示层次 layer');
        }
      }
    }
  }

  // ---- E001 引用 ----
  const refCheck = (target, ref, field, allowed) => {
    if (typeof ref !== 'string' || ref === '') return;
    if (!exists(ref)) {
      add('E001', 'error', target, `引用了不存在的 ID：${ref}（${field}）`);
    } else if (allowed && !allowed.includes(typeOf(ref))) {
      add('E001', 'error', target, `引用了类型不对的 ID：${ref}（${field}）`);
    }
  };
  for (const entry of project.entries) {
    const d = entry.data;
    const target = targetOf(entry);
    if (entry.type === 'character') {
      refCheck(target, d.unit, 'unit', ['unit']);
      for (const rel of arr(d.relations)) refCheck(target, rel?.to, 'relations.to', ['character']);
    } else if (entry.type === 'unit') {
      for (const id of arr(d.episodes)) refCheck(target, id, 'episodes', ['episode']);
      for (const item of arr(d.legacy)) refCheck(target, item?.ref, 'legacy.ref');
      refCheck(target, d.anchor, 'anchor', ['character']);
    } else if (entry.type === 'episode') {
      refCheck(target, d.unit, 'unit', ['unit']);
      for (const hl of arr(d.highlights)) {
        for (const id of arr(hl?.setups)) refCheck(hl?.id || target, id, 'highlights.setups', ['setup']);
        for (const id of arr(hl?.refs)) refCheck(hl?.id || target, id, 'highlights.refs', ['character', 'world', 'thread']);
      }
      for (const ev of arr(d.events)) {
        if (ev?.ref) refCheck(ev.id || target, ev.ref, 'events.ref', ['character', 'thread', 'world']);
      }
    }
  }

  // ---- E003 时间格式 / 超出时长 ----
  const timeCheck = (value, duration, target, label) => {
    const sec = parseTime(value);
    if (sec === null) {
      add('E003', 'error', target, `时间格式错误：${label} "${value ?? '(缺失)'}"`);
      return null;
    }
    if (duration !== null && sec > duration) {
      add('E003', 'error', target, `时间超出本集时长：${label} ${value} > ${formatTime(duration)}`);
    }
    return sec;
  };

  for (const ep of project.episodes) {
    const epTarget = ep.id || 'episode';
    const duration = timeCheck(ep.duration, null, epTarget, 'duration');
    for (const b of arr(ep.beats)) {
      timeCheck(b?.from, duration, epTarget, 'beat.from');
      timeCheck(b?.to, duration, epTarget, 'beat.to');
    }
    for (const hl of arr(ep.highlights)) timeCheck(hl?.t, duration, hl?.id || epTarget, 'highlight.t');
    for (const su of arr(ep.setups)) timeCheck(su?.t, duration, su?.id || epTarget, 'setup.t');
    for (const ev of arr(ep.events)) timeCheck(ev?.t, duration, ev?.id || epTarget, 'event.t');
    for (const p of arr(ep.emotion)) timeCheck(p?.t, duration, epTarget, 'emotion.t');
    for (const g of arr(ep.grid)) timeCheck(g?.t, duration, epTarget, 'grid.t');
  }

  // ---- E005 节拍 ----
  for (const ep of project.episodes) {
    const epTarget = ep.id || 'episode';
    const duration = parseTime(ep.duration);
    const beats = arr(ep.beats)
      .map((b) => ({ b, from: parseTime(b?.from), to: parseTime(b?.to) }))
      .filter((x) => x.from !== null && x.to !== null)
      .sort((a, b) => a.from - b.from);
    if (beats.length === 0) continue;
    if (beats[0].from !== 0) {
      add('E005', 'error', epTarget, `节拍没有从 0:00 开始（从 ${formatTime(beats[0].from)} 开始）`);
    }
    for (let i = 0; i < beats.length; i += 1) {
      const cur = beats[i];
      if (cur.to <= cur.from) {
        add('E005', 'error', epTarget, `节拍结束时间不晚于开始：${formatTime(cur.from)}–${formatTime(cur.to)}`, {
          from: formatTime(cur.from),
          to: formatTime(cur.to),
        });
      }
      if (i > 0) {
        const prev = beats[i - 1];
        if (cur.from < prev.to) {
          add('E005', 'error', epTarget, `节拍重叠：${formatTime(prev.from)}–${formatTime(prev.to)} 与 ${formatTime(cur.from)}–${formatTime(cur.to)}`, {
            from: formatTime(cur.from),
            to: formatTime(prev.to),
          });
        } else if (cur.from > prev.to) {
          add('E005', 'error', epTarget, `节拍没有覆盖：${formatTime(prev.to)}–${formatTime(cur.from)} 之间有空档`, {
            from: formatTime(prev.to),
            to: formatTime(cur.from),
          });
        }
      }
    }
    const last = beats[beats.length - 1];
    if (duration !== null && last.to < duration) {
      add('E005', 'error', epTarget, `节拍没有覆盖到结尾：${formatTime(last.to)}–${formatTime(duration)}`, {
        from: formatTime(last.to),
        to: formatTime(duration),
      });
    }
  }

  // ---- 高光相关 ----
  const referencedSetups = new Set();
  for (const ep of project.episodes) {
    for (const hl of arr(ep.highlights)) {
      for (const id of arr(hl?.setups)) referencedSetups.add(id);
    }
  }

  for (const ep of project.episodes) {
    const epTarget = ep.id || 'episode';
    const duration = parseTime(ep.duration);
    const highlights = arr(ep.highlights);
    const climaxes = highlights.filter((h) => h?.climax === true);

    // E004
    if (climaxes.length !== 1) {
      add(
        'E004',
        'error',
        epTarget,
        climaxes.length === 0
          ? '本集没有 climax: true 的高光（必须恰好 1 个）'
          : `本集有 ${climaxes.length} 个 climax: true 的高光（必须恰好 1 个）：${climaxes.map((h) => h.id).join('、')}`,
      );
    }

    // W105
    if (climaxes.length === 1 && duration) {
      const t = parseTime(climaxes[0].t);
      const [lo, hi] = arr(meta.climaxRange).length === 2 ? meta.climaxRange : [0.7, 0.85];
      if (t !== null && (t / duration < lo || t / duration > hi)) {
        add(
          'W105',
          'warn',
          climaxes[0].id || epTarget,
          `情绪爆点不在 ${Math.round(lo * 100)}%–${Math.round(hi * 100)}% 之间（本集 ${Math.round((t / duration) * 100)}%，${climaxes[0].t}）`,
          { ep: ep.id, from: climaxes[0].t, to: climaxes[0].t, file: index.get(climaxes[0].id)?.file },
        );
      }
    }

    // W102
    for (const hl of highlights) {
      if (arr(hl?.setups).length === 0 && !filled(hl?.noSetupReason)) {
        add('W102', 'warn', hl?.id || epTarget, `高光「${hl?.name || '(未命名)'}」没有铺垫`, {
          ep: ep.id,
          from: hl?.t,
          to: hl?.t,
          file: index.get(hl?.id)?.file,
        });
      }
    }

    // W109
    const sortedBeats = arr(ep.beats)
      .map((b) => ({ b, from: parseTime(b?.from), to: parseTime(b?.to) }))
      .filter((x) => x.from !== null)
      .sort((a, b) => a.from - b.from);
    if (sortedBeats.length > 0) {
      const first = sortedBeats[0];
      if (first.b.type !== '钩子') {
        add('W109', 'warn', epTarget, `第一个节拍不是"钩子"（是"${first.b.type || '(未填)'}"）`, {
          ep: ep.id,
          from: first.b.from,
          to: first.b.to,
        });
      }
      if (first.b.type === '钩子' && first.to !== null && first.to - first.from > 5) {
        add('W109', 'warn', epTarget, `钩子长于 5 秒（${formatTime(first.to - first.from)}）`, {
          ep: ep.id,
          from: first.b.from,
          to: first.b.to,
        });
      }
    }

    // W110
    const hlTimes = highlights
      .map((h) => ({ h, t: parseTime(h?.t) }))
      .filter((x) => x.t !== null)
      .sort((a, b) => a.t - b.t);
    for (let i = 1; i < hlTimes.length; i += 1) {
      const gap = hlTimes[i].t - hlTimes[i - 1].t;
      if (gap > 120) {
        add(
          'W110',
          'warn',
          epTarget,
          `相邻高光间隔超过 2 分钟：${hlTimes[i - 1].h.t} 到 ${hlTimes[i].h.t}（${formatTime(gap)}）`,
          { ep: ep.id, from: formatTime(hlTimes[i - 1].t), to: hlTimes[i].h.t },
        );
      }
    }

    // W111
    if (duration !== null) {
      const max = parseTime(meta.maxEpisodeDuration) ?? 600;
      if (duration > max) {
        add('W111', 'warn', epTarget, `单集时长超过上限：${ep.duration} > ${formatTime(max)}`, { ep: ep.id });
      }
    }

    // W101 空格子
    const gridSeconds = Number(meta.gridSeconds) > 0 ? Number(meta.gridSeconds) : 15;
    if (duration !== null) {
      const points = [];
      for (const b of arr(ep.beats)) {
        const t = parseTime(b?.from);
        if (t !== null) points.push(t);
      }
      for (const hl of highlights) {
        const t = parseTime(hl?.t);
        if (t !== null) points.push(t);
      }
      for (const su of arr(ep.setups)) {
        const t = parseTime(su?.t);
        if (t !== null) points.push(t);
      }
      for (const ev of arr(ep.events)) {
        const t = parseTime(ev?.t);
        if (t !== null) points.push(t);
      }
      for (const g of arr(ep.grid)) {
        const t = parseTime(g?.t);
        if (t !== null) points.push(t);
      }
      for (let s = 0; s < duration; s += gridSeconds) {
        const end = Math.min(s + gridSeconds, duration);
        if (!points.some((t) => t >= s && t < end)) {
          add('W101', 'warn', epTarget, `空格子：这${end - s}秒没有新东西`, {
            ep: ep.id,
            from: formatTime(s),
            to: formatTime(end),
          });
        }
      }
    }

    // I201 爆发前缺少安静
    if (climaxes.length === 1) {
      const ct = parseTime(climaxes[0].t);
      const emotion = arr(ep.emotion)
        .map((p) => ({ t: parseTime(p?.t), v: Number(p?.v) }))
        .filter((p) => p.t !== null && Number.isFinite(p.v))
        .sort((a, b) => a.t - b.t);
      if (ct !== null && emotion.length > 0) {
        let atClimax = null;
        for (const p of emotion) if (p.t <= ct) atClimax = p;
        if (atClimax) {
          const quiet = emotion.some((p) => p.t >= ct - 15 && p.t <= ct && p.v <= atClimax.v - 3);
          if (!quiet) {
            add('I201', 'info', climaxes[0].id || epTarget, '情绪爆点前 15 秒内没有低于爆点 3 分以上的情绪点（缺少安静）', {
              ep: ep.id,
              from: formatTime(Math.max(0, ct - 15)),
              to: climaxes[0].t,
            });
          }
        }
      }
    }

    // I202
    if (!highlights.some((h) => h?.clip === true)) {
      add('I202', 'info', epTarget, '全集没有 clip: true 的高光（没有可单独传播的片段）', { ep: ep.id });
    }

    // W116 / I204 打斗类型
    const fights = highlights.filter((h) => h?.type === '打斗');
    const deathMatches = fights.filter((h) => h?.fightType === '死斗');
    if (deathMatches.length >= 2) {
      add('W116', 'warn', epTarget, `本集有 ${deathMatches.length} 场死斗（不要每场都打成死斗）：${deathMatches.map((h) => h.id).join('、')}`, { ep: ep.id });
    }
    for (const hl of fights) {
      if (!filled(hl?.fightType)) {
        add('I204', 'info', hl?.id || epTarget, `打斗高光「${hl?.name || hl?.id}」没有标 fightType（这场仗的任务）`, { ep: ep.id, from: hl?.t, to: hl?.t });
      }
    }
  }

  // ---- W103 / W104 / W114 铺垫 ----
  for (const ep of project.episodes) {
    for (const su of arr(ep.setups)) {
      const sid = su?.id;
      if (!sid) continue;
      if (!referencedSetups.has(sid)) {
        if (su.longTerm === true) {
          add('W114', 'warn', sid, `长线伏笔「${su.name || sid}」到最后一集都没有被引用`, {
            ep: ep.id,
            from: su.t,
            to: su.t,
            file: ep.id ? `episodes/${ep.id}.json` : undefined,
          });
        } else {
          add('W103', 'warn', sid, `铺垫「${su.name || sid}」没有被任何高光引用`, {
            ep: ep.id,
            from: su.t,
            to: su.t,
            file: ep.id ? `episodes/${ep.id}.json` : undefined,
          });
        }
      }
    }
  }
  for (const ep of project.episodes) {
    for (const hl of arr(ep.highlights)) {
      for (const sid of arr(hl?.setups)) {
        const suEntry = index.get(sid);
        if (!suEntry || suEntry.type !== 'setup') continue;
        const suEp = suEntry.ep?.id || '';
        const hlEp = ep.id || '';
        const oSu = epOrder.get(suEp) ?? 999;
        const oHl = epOrder.get(hlEp) ?? 999;
        const suT = parseTime(suEntry.data.t);
        const hlT = parseTime(hl.t);
        const after = oSu > oHl || (oSu === oHl && suT !== null && hlT !== null && suT > hlT);
        if (after) {
          add(
            'W104',
            'warn',
            sid,
            `铺垫「${suEntry.data.name || sid}」出现在支撑的高光「${hl.name || hl.id}」之后`,
            { ep: suEp || ep.id, from: suEntry.data.t, to: suEntry.data.t },
          );
        }
      }
    }
  }

  // ---- W106 贯穿线断档 ----
  const positions = new Map();
  project.episodes.forEach((ep, i) => positions.set(ep.id, Number.isFinite(Number(ep.no)) ? Number(ep.no) : i + 1));
  const maxPos = Math.max(0, ...positions.values());
  for (const entry of project.entries) {
    if (entry.type !== 'thread') continue;
    const d = entry.data;
    const target = targetOf(entry);
    const maxGap = Number.isFinite(Number(d.maxGap)) ? Number(d.maxGap) : 3;
    const advanced = [];
    for (const ep of project.episodes) {
      if (arr(ep.events).some((ev) => ev?.ref === d.id && ev?.kind === '推进')) {
        advanced.push(positions.get(ep.id));
      }
    }
    const pts = [...new Set(advanced)].sort((a, b) => a - b);
    for (let i = 1; i < pts.length; i += 1) {
      const gap = pts[i] - pts[i - 1] - 1;
      if (gap > maxGap) {
        add('W106', 'warn', target, `贯穿线「${d.name || d.id}」连续 ${gap} 集没有推进（最多 ${maxGap} 集）`);
      }
    }
    if (pts.length > 0 && maxPos - pts[pts.length - 1] > maxGap) {
      add('W106', 'warn', target, `贯穿线「${d.name || d.id}」最后 ${maxPos - pts[pts.length - 1]} 集没有推进（最多 ${maxGap} 集）`);
    }
  }

  // ---- W117 前 3 集没有打斗或亮相 ----
  for (const ep of project.episodes) {
    const no = Number(ep.no);
    if (!Number.isFinite(no) || no > 3) continue;
    if (!arr(ep.highlights).some((h) => h?.type === '打斗' || h?.type === '亮相')) {
      add('W117', 'warn', ep.id || 'episode', `第 ${no} 集没有打斗或亮相高光（试播集和前几集不要让打斗退后，观众还不认识任何人）`, { ep: ep.id });
    }
  }

  // ---- I208 核心角色轮流当情绪中心 ----
  {
    const units = project.entries.filter((e) => e.type === 'unit');
    const anchored = new Set(units.map((e) => e.data.anchor).filter((a) => typeof a === 'string' && a));
    const cores = project.entries.filter((e) => e.type === 'character' && e.data.layer === '核心');
    const anchoredUnits = units.filter((e) => filled(e.data.anchor)).length;
    if (anchoredUnits >= cores.length && cores.length > 0) {
      for (const c of cores) {
        if (!anchored.has(c.data.id)) {
          add('I208', 'info', targetOf(c), `核心角色「${c.data.name || c.data.id}」还没有当过任何单元的 anchor（核心角色要轮流当情绪中心）`);
        }
      }
    }
  }

  // ---- W107 / W108 / W112 ----
  for (const entry of project.entries) {
    if (entry.type === 'unit') {
      const d = entry.data;
      if (arr(d.legacy).length === 0) add('W107', 'warn', targetOf(entry), `单元「${d.name || d.id}」的 legacy 为空`);
      for (const epId of arr(d.episodes)) {
        const ep = index.get(epId);
        if (ep?.type === 'episode' && arr(ep.data.highlights).length === 0) {
          add('W108', 'warn', epId, `单元「${d.name || d.id}」里的这一集没有高光`);
        }
      }
    }
    if (entry.type === 'character') {
      const d = entry.data;
      if (d.layer === '单元' && !filled(d.fate)) {
        add('W112', 'warn', targetOf(entry), `单元角色「${d.name || d.id}」没有 fate`);
      }
    }
  }

  // ---- W113 枚举 ----
  const enumCheck = (target, label, value, list, ep, t) => {
    if (!filled(value)) return;
    if (!list.includes(value)) {
      add('W113', 'warn', target, `未知的枚举值：${label} = "${value}"`, ep ? { ep, from: t, to: t } : {});
    }
  };
  for (const entry of project.entries) {
    const d = entry.data;
    const target = targetOf(entry);
    if (entry.type === 'character') {
      enumCheck(target, 'layer', d.layer, ENUMS.layer);
      for (const g of arr(d.growth)) enumCheck(target, 'growth', g, ENUMS.growth);
      enumCheck(target, 'fate', d.fate, ENUMS.fate);
      for (const rel of arr(d.relations)) enumCheck(target, 'relations.kind', rel?.kind, ENUMS.relationKind);
    } else if (entry.type === 'world') {
      enumCheck(target, 'kind', d.kind, ENUMS.worldKind);
    } else if (entry.type === 'thread') {
      enumCheck(target, 'kind', d.kind, ENUMS.threadKind);
    } else if (entry.type === 'unit') {
      for (const item of arr(d.legacy)) enumCheck(target, 'legacy.kind', item?.kind, ENUMS.legacyKind);
    } else if (entry.type === 'episode') {
      for (const b of arr(d.beats)) enumCheck(target, 'beats.type', b?.type, ENUMS.beatType);
      for (const hl of arr(d.highlights)) {
        enumCheck(hl?.id || target, 'highlights.type', hl?.type, ENUMS.highlightType, d.id, hl?.t);
        enumCheck(hl?.id || target, 'highlights.growth', hl?.growth, ENUMS.growth, d.id, hl?.t);
        enumCheck(hl?.id || target, 'highlights.fightType', hl?.fightType, ENUMS.fightType, d.id, hl?.t);
        enumCheck(hl?.id || target, 'highlights.fightEnding', hl?.fightEnding, ENUMS.fightEnding, d.id, hl?.t);
      }
      for (const su of arr(d.setups)) enumCheck(su?.id || target, 'setups.kind', su?.kind, ENUMS.setupKind, d.id, su?.t);
      for (const ev of arr(d.events)) {
        enumCheck(ev?.id || target, 'events.kind', ev?.kind, ENUMS.eventKind, d.id, ev?.t);
        enumCheck(ev?.id || target, 'events.infoGap', ev?.infoGap, ENUMS.infoGap, d.id, ev?.t);
        enumCheck(ev?.id || target, 'events.channel', ev?.channel, ENUMS.channel, d.id, ev?.t);
      }
    }
  }

  // ---- W115 决策记录格式 ----
  const notesCheck = (target, notes, ep, t) => {
    if (notes === undefined || typeof notes === 'string') return;
    const extra = ep ? { ep, from: t, to: t } : {};
    if (!Array.isArray(notes)) {
      add('W115', 'warn', target, 'notes 应为决策记录数组', extra);
      return;
    }
    let prevDate = '';
    notes.forEach((note, i) => {
      if (!note || typeof note !== 'object' || Array.isArray(note)) {
        add('W115', 'warn', target, `决策记录第 ${i + 1} 条不是对象`, extra);
        return;
      }
      const missing = ['date', 'what', 'why'].filter((key) => !filled(note[key]));
      if (missing.length) add('W115', 'warn', target, `决策记录第 ${i + 1} 条缺少 ${missing.join('、')}`, extra);
      const date = str(note.date);
      if (filled(date) && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        add('W115', 'warn', target, `决策记录第 ${i + 1} 条日期格式应为 YYYY-MM-DD：${date}`, extra);
      } else if (date && prevDate && date < prevDate) {
        add('W115', 'warn', target, `决策记录第 ${i + 1} 条日期早于上一条：新记录应追加在末尾`, extra);
      }
      if (date) prevDate = date;
    });
  };
  for (const entry of project.entries) {
    const d = entry.data;
    notesCheck(targetOf(entry), d.notes);
    if (entry.type === 'episode') {
      for (const key of ['highlights', 'setups', 'events']) {
        for (const item of arr(d[key])) notesCheck(item?.id || targetOf(entry), item?.notes, d.id, item?.t);
      }
    }
  }

  // ---- 排序输出 ----
  const epRank = (epId) => (epId ? epOrder.get(epId) ?? 998 : 999);
  issues.sort((a, b) => {
    if (a.code === 'E900' || b.code === 'E900') return a.code === 'E900' ? -1 : 1;
    return (
      epRank(a.ep) - epRank(b.ep) ||
      (parseTime(a.from) ?? -1) - (parseTime(b.from) ?? -1) ||
      a.code.localeCompare(b.code) ||
      String(a.target).localeCompare(String(b.target))
    );
  });

  const counts = { error: 0, warn: 0, info: 0 };
  for (const issue of issues) counts[issue.level] += 1;
  return { issues, counts };
}


export function formatIssue(issue) {
  const range = issue.from ? ` ${issue.from}${issue.to && issue.to !== issue.from ? `–${issue.to}` : ''}` : '';
  return `${issue.code} ${issue.target}${range}  ${issue.message}`;
}
