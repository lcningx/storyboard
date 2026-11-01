// new 命令的模板。

import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './load.js';
import { normalizeEpisodeId } from './time.js';

const TEMPLATES = {
  character: (id) => ({
    id,
    name: '',
    summary: '',
    layer: '核心',
    visual: '',
    ability: '',
    limit: '',
    abilityReflects: '',
    limitChoice: '',
    growth: [],
    emotion: '',
    vo: null,
    relations: [],
  }),
  world: (id) => ({
    id,
    name: '',
    summary: '',
    kind: '规则',
    truth: '',
  }),
  thread: (id) => ({
    id,
    name: '',
    summary: '',
    kind: '大问号',
    question: '',
    ending: '',
  }),
  unit: (id) => ({
    id,
    name: '',
    summary: '',
    episodes: [],
    emotion: '',
    legacy: [],
  }),
  episode: (id) => ({
    id,
    no: Number(id.slice(2)),
    name: '',
    summary: '',
    duration: '',
    unit: '',
    hook: '',
    endHook: '',
    beats: [],
    highlights: [],
    setups: [],
    events: [],
    emotion: [],
    grid: [],
  }),
};

const DIRS = {
  character: 'characters',
  world: 'world',
  thread: 'threads',
  unit: 'units',
  episode: 'episodes',
};

const PREFIXES = {
  character: 'char.',
  world: 'world.',
  thread: 'thread.',
  unit: 'unit.',
};

/**
 * 写入模板文件，返回 { file, data }。
 * projectDir 是已解析的 projects/<slug> 目录。
 */
export function createEntry(projectDir, type, slug) {
  const template = TEMPLATES[type];
  if (!template) {
    throw new UserError(`未知类型：${type}（可用 character / world / thread / unit / episode）`);
  }
  let base = String(slug || '').trim();
  let id;
  if (type === 'episode') {
    const epId = normalizeEpisodeId(base);
    if (!epId) throw new UserError(`集 ID 必须形如 ep04 或数字 4：${slug}`);
    id = epId;
    base = epId;
  } else {
    if (!/^[a-z0-9-]+$/.test(base)) {
      throw new UserError(`slug 只能含小写字母、数字和 -：${slug}`);
    }
    id = PREFIXES[type] + base;
  }
  const file = path.join(projectDir, DIRS[type], `${base}.json`);
  if (fs.existsSync(file)) {
    throw new UserError(`文件已存在：${path.relative(projectDir, file)}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = template(id);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { file, data, relative: path.relative(projectDir, file) };
}
