import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PROJECTS_DIR } from '../lib/load.js';

const STORY = path.join(ROOT, 'story.js');

// projects/ 下可能有多个项目，测试一律显式指定示例项目
function run(args) {
  const withProject = args.includes('--project') ? args : [...args, '--project', 'demo'];
  return execFileSync(process.execPath, [STORY, ...withProject], { cwd: ROOT, encoding: 'utf8' });
}

function runJson(args) {
  return JSON.parse(run([...args, '--json']));
}

test('index / --type / --json', () => {
  const text = run(['index']);
  assert.match(text, /^# 项目/m);
  assert.match(text, /char\.su-tang/);
  assert.match(text, /ep03/);

  const chars = runJson(['index', '--type', 'character']);
  assert.ok(Array.isArray(chars));
  assert.ok(chars.every((c) => c.type === 'character'));
  assert.ok(chars.some((c) => c.id === 'char.su-tang'));
});

test('show 集内条目', () => {
  const text = run(['show', 'ep01.hl4']);
  assert.match(text, /ep01\.hl4/);
  assert.match(text, /撑伞/);
  const data = runJson(['show', 'ep01.hl4']);
  assert.equal(data.id, 'ep01.hl4');
  assert.equal(data.climax, true);

  const many = runJson(['show', 'ep01.hl1', 'ep01.hl2']);
  assert.equal(many.length, 2);
});

test('ep 时间区间和字段过滤', () => {
  const data = runJson(['ep', '01', '--from', '3:00', '--to', '4:30', '--only', 'highlights,setups']);
  assert.equal(data.id, 'ep01');
  assert.ok(data.highlights.length >= 1);
  assert.ok(data.highlights.every((h) => h.t === '3:55'));
  assert.equal(data.beats, undefined);
  assert.equal(data.events, undefined);

  const text = run(['ep', 'ep02']);
  assert.match(text, /老周的单/);
  assert.match(text, /结尾/);
});

test('where 与 chain', () => {
  const refs = runJson(['where', 'char.yu-niang']);
  assert.ok(refs.some((r) => r.ep === 'ep01'));
  assert.ok(refs.some((r) => r.ep === 'ep02'));

  const chain = runJson(['chain', 'ep01.hl4']);
  assert.equal(chain.id, 'ep01.hl4');
  assert.deepEqual(chain.setups.map((s) => s.id), ['ep01.su2', 'ep01.su3', 'ep01.su4']);
  assert.ok(chain.setups.every((s) => s.crossEpisode === false));

  const text = run(['chain', 'ep01.hl4']);
  assert.match(text, /早 2:05/);
});

test('timeline 两种形态', () => {
  const rows = runJson(['timeline']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, 'ep01');
  assert.equal(rows[0].climax, '3:55');

  const items = runJson(['timeline', 'ep02']);
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 5);
});

test('check：示例项目无错误，按集过滤', () => {
  const result = runJson(['check']);
  assert.equal(result.counts.error, 0);
  assert.equal(result.counts.warn, 3);
  assert.ok(result.issues.some((i) => i.code === 'W117' && i.ep === 'ep02'));

  const ep2 = runJson(['check', 'ep02']);
  assert.ok(ep2.issues.some((i) => i.code === 'W101' && i.ep === 'ep02'));

  const ep1 = runJson(['check', 'ep01']);
  assert.equal(ep1.issues.length, 0);

  const errorsOnly = runJson(['check', '--level', 'error']);
  assert.equal(errorsOnly.issues.length, 0);
});

test('找不到条目时退出码为 2', () => {
  const result = spawnSync(process.execPath, [STORY, 'show', 'char.nope', '--project', 'demo'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /找不到条目/);
});

test('new 创建模板文件', (t) => {
  const slug = `tmp-new-${process.pid}`;
  const dir = path.join(PROJECTS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'project.json'),
    JSON.stringify({ id: slug, name: '临时', summary: '临时项目', skeleton: ['一'] }),
  );

  const text = run(['new', 'character', 'test-char', '--project', slug]);
  assert.match(text, /characters\/test-char\.json/);
  const file = path.join(dir, 'characters/test-char.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.id, 'char.test-char');
  assert.equal(data.name, '');

  const again = spawnSync(process.execPath, [STORY, 'new', 'character', 'test-char', '--project', slug], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(again.status, 2);
  assert.match(again.stderr, /已存在/);
});

test('script：没有场次时给出提示，--json 合法', () => {
  const out = run(['script', 'ep01', '--project', 'demo']);
  assert.match(out, /还没有写场次/);
  const data = runJson(['script', 'ep01', '--project', 'demo']);
  assert.equal(data.id, 'ep01');
  assert.deepEqual(data.scenes, []);
});

test('comments：没有评论时给出提示，未知状态报错', () => {
  assert.match(run(['comments']), /没有评论/);
  const r = spawnSync(process.execPath, [STORY, 'comments', '--status', '不存在', '--project', 'demo'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
});
