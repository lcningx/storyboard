import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectDir } from '../lib/load.js';
import { checkProject } from '../lib/check.js';
import { addComment, replyComment, resolveComment } from '../lib/comments.js';

function baseFiles() {
  return {
    'project.json': {
      id: 'test',
      name: '测试剧',
      summary: '一句话',
      skeleton: ['步骤一', '步骤二'],
      gridSeconds: 10,
      climaxRange: [0.7, 0.85],
      coreQuestion: '人能不能自己成为光？',
      protagonist: 'char.hero',
      ensemble: ['单元角色：变'],
    },
    'characters/hero.json': {
      id: 'char.hero',
      name: '主角',
      summary: '主角一句话',
      layer: '核心',
      visual: '红马甲',
      ability: '能做到',
      limit: '不能做到',
      abilityReflects: '倔强的性格',
      limitChoice: '用了就会暴露身份',
      anchors: '开小店的母亲；小时候的同学',
      growth: ['A', 'B'],
      emotion: '倔强',
      vo: '吐槽',
      relations: [{ to: 'char.guest', kind: '互补', desc: '搭档' }],
      secret: '作者知道的事',
      ritual: '每次出手都可能暴露身份',
      mirror: '同样力量的另一个人',
      circle: [{ who: 'char.guest', desc: '第一个单元知道一半' }],
    },
    'characters/guest.json': {
      id: 'char.guest',
      name: '单元角色',
      summary: '单元角色一句话',
      layer: '单元',
      unit: 'unit.one',
      fate: '返场',
      want: '想再见母亲一面',
      exit: '化成一场雨，落在母亲的院子里',
      visual: '湿透',
      ability: '下雨',
      limit: '撑伞就停',
      growth: ['C'],
    },
    'world/rule.json': {
      id: 'world.rule',
      name: '规则',
      summary: '规则一句话',
      kind: '规则',
      truth: '完整规则',
    },
    'world/secret.json': {
      id: 'world.secret',
      name: '秘密',
      summary: '秘密一句话',
      kind: '秘密',
      truth: '完整秘密',
      layers: [{ no: 1, desc: '第一层' }],
    },
    'threads/main.json': {
      id: 'thread.main',
      name: '主线',
      summary: '主线一句话',
      kind: '大问号',
      question: '为什么？',
      ending: '因为这样。',
      maxGap: 2,
    },
    'units/one.json': {
      id: 'unit.one',
      name: '单元一',
      summary: '单元一句话',
      episodes: ['ep01'],
      emotion: '同情',
      question: '没说出口的道歉还算不算数？',
      anchor: 'char.hero',
      changes: 'char.guest',
      reveal: '单元角色撞见主角出手',
      legacy: [{ kind: '角色得到', desc: '学到东西', ref: 'char.hero' }],
    },
    'episodes/ep01.json': {
      id: 'ep01',
      no: 1,
      name: '第一集',
      summary: '第一集一句话',
      duration: '1:00',
      unit: 'unit.one',
      hook: '钩子',
      endHook: '结尾钩子',
      beats: [
        { type: '钩子', from: '0:00', to: '0:05' },
        { type: '教规则', from: '0:05', to: '0:30' },
        { type: '爆', from: '0:30', to: '0:50' },
        { type: '余波', from: '0:50', to: '1:00' },
      ],
      highlights: [
        {
          id: 'ep01.hl1',
          t: '0:45',
          type: '亮相',
          name: '爆点',
          summary: '高光一句话',
          climax: true,
          clip: true,
          setups: ['ep01.su1'],
          refs: ['char.hero'],
        },
      ],
      setups: [{ id: 'ep01.su1', t: '0:10', kind: '规则', name: '铺垫', summary: '铺垫一句话' }],
      events: [
        { id: 'ep01.ev1', t: '0:00', ref: 'char.hero', kind: '出场', summary: '主角出现' },
        { id: 'ep01.ev2', t: '0:05', ref: 'thread.main', kind: '推进', summary: '主线推进' },
        { id: 'ep01.ev3', t: '0:20', ref: 'world.rule', kind: '展开', summary: '规则展开' },
        { id: 'ep01.ev4', t: '0:45', ref: 'world.secret', kind: '揭示', layer: 1, summary: '揭开一层' },
      ],
      emotion: [
        { t: '0:00', v: 5 },
        { t: '0:30', v: 7 },
        { t: '0:34', v: 4 },
        { t: '0:45', v: 10, label: '燃' },
        { t: '0:58', v: 5 },
      ],
      grid: [],
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboard-test-'));
  for (const [rel, data] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  return dir;
}

function run(mutate, t) {
  const files = baseFiles();
  if (mutate) mutate(files);
  const dir = writeProject(files);
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const project = loadProjectDir(dir, 'test');
  const result = checkProject(project);
  return { files, dir, project, result, codes: result.issues.map((i) => i.code) };
}

function assertHas(t, code, mutate) {
  const { codes, result } = run(mutate, t);
  assert.ok(codes.includes(code), `期望 ${code}，实际：${codes.join(', ')}\n${result.issues.map((i) => i.message).join('\n')}`);
  return result;
}

function addEpisode(files, no, { advanceThread = false } = {}) {
  const ep = cloneJson(files['episodes/ep01.json']);
  const oldId = 'ep01';
  const newId = `ep${String(no).padStart(2, '0')}`;
  const text = JSON.stringify(ep);
  const rewritten = JSON.parse(text.replaceAll(oldId, newId));
  rewritten.no = no;
  rewritten.name = `第${no}集`;
  if (!advanceThread) {
    rewritten.events = rewritten.events.filter((ev) => ev.ref !== 'thread.main');
  }
  files[`episodes/${newId}.json`] = rewritten;
  files['units/one.json'].episodes.push(newId);
  return rewritten;
}

test('示例项目的基线数据没有任何问题', (t) => {
  const { result } = run(null, t);
  assert.deepEqual(result.counts, { error: 0, warn: 0, info: 0 });
});

test('E001 引用了不存在的 ID', (t) => {
  assertHas(t, 'E001', (files) => {
    files['episodes/ep01.json'].events[0].ref = 'char.nope';
  });
});

test('E002 ID 重复', (t) => {
  assertHas(t, 'E002', (files) => {
    files['characters/dup.json'] = cloneJson(files['characters/hero.json']);
  });
});

test('E002 文件名与 ID 不一致', (t) => {
  assertHas(t, 'E002', (files) => {
    files['characters/hero-2.json'] = files['characters/hero.json'];
    delete files['characters/hero.json'];
  });
});

test('E003 时间格式错误或超出时长', (t) => {
  assertHas(t, 'E003', (files) => {
    files['episodes/ep01.json'].highlights[0].t = '0:99';
  });
  assertHas(t, 'E003', (files) => {
    files['episodes/ep01.json'].highlights[0].t = '2:00';
  });
});

test('E004 climax 不是恰好 1 个', (t) => {
  assertHas(t, 'E004', (files) => {
    files['episodes/ep01.json'].highlights[0].climax = false;
  });
  assertHas(t, 'E004', (files) => {
    files['episodes/ep01.json'].highlights.push({ ...cloneJson(files['episodes/ep01.json'].highlights[0]), id: 'ep01.hl2', t: '0:20' });
  });
});

test('E005 节拍重叠或没有覆盖全集', (t) => {
  assertHas(t, 'E005', (files) => {
    files['episodes/ep01.json'].beats[2].from = '0:25';
  });
  assertHas(t, 'E005', (files) => {
    files['episodes/ep01.json'].beats[3].to = '0:55';
  });
  assertHas(t, 'E005', (files) => {
    files['episodes/ep01.json'].beats.shift();
  });
});

test('E006 必填字段缺失', (t) => {
  assertHas(t, 'E006', (files) => {
    delete files['characters/hero.json'].ability;
  });
  assertHas(t, 'E006', (files) => {
    delete files['episodes/ep01.json'].hook;
  });
  assertHas(t, 'E006', (files) => {
    files['episodes/ep01.json'].events[3].layer = undefined;
  });
});

test('W101 空格子', (t) => {
  const result = assertHas(t, 'W101', (files) => {
    files['episodes/ep01.json'].events.splice(2, 1);
  });
  assert.equal(result.issues.find((i) => i.code === 'W101').from, '0:20');
});

test('W102 高光没有铺垫', (t) => {
  assertHas(t, 'W102', (files) => {
    files['episodes/ep01.json'].highlights[0].setups = [];
  });
});

test('W103 铺垫没有被引用', (t) => {
  assertHas(t, 'W103', (files) => {
    files['episodes/ep01.json'].setups.push({ id: 'ep01.su2', t: '0:20', kind: '伏笔', name: '多余', summary: '没人用' });
  });
});

test('W104 铺垫在高光之后', (t) => {
  assertHas(t, 'W104', (files) => {
    files['episodes/ep01.json'].setups[0].t = '0:50';
  });
});

test('W105 爆点不在 climaxRange', (t) => {
  assertHas(t, 'W105', (files) => {
    files['episodes/ep01.json'].highlights[0].t = '0:10';
  });
});

test('W106 贯穿线断档超过 maxGap', (t) => {
  assertHas(t, 'W106', (files) => {
    files['threads/main.json'].maxGap = 0;
    addEpisode(files, 2, { advanceThread: false });
  });
});

test('W107 单元的 legacy 为空', (t) => {
  assertHas(t, 'W107', (files) => {
    files['units/one.json'].legacy = [];
  });
});

test('W108 单元里某一集没有高光', (t) => {
  assertHas(t, 'W108', (files) => {
    const ep2 = addEpisode(files, 2, { advanceThread: true });
    ep2.highlights = [];
  });
});

test('W109 第一拍不是钩子或钩子超过 5 秒', (t) => {
  assertHas(t, 'W109', (files) => {
    files['episodes/ep01.json'].beats[0].type = '教规则';
  });
  assertHas(t, 'W109', (files) => {
    files['episodes/ep01.json'].beats[0].to = '0:06';
    files['episodes/ep01.json'].beats[1].from = '0:06';
  });
});

test('W110 相邻高光间隔超过 2 分钟', (t) => {
  assertHas(t, 'W110', (files) => {
    const ep = files['episodes/ep01.json'];
    ep.duration = '5:00';
    ep.beats = [
      { type: '钩子', from: '0:00', to: '0:05' },
      { type: '教规则', from: '0:05', to: '0:30' },
      { type: '爆', from: '0:30', to: '4:50' },
      { type: '余波', from: '4:50', to: '5:00' },
    ];
    ep.highlights.push({ id: 'ep01.hl2', t: '3:00', type: '金句', name: '第二高光', summary: '间隔太久', setups: ['ep01.su1'], clip: true });
  });
});

test('W112 单元角色没有 fate', (t) => {
  assertHas(t, 'W112', (files) => {
    delete files['characters/guest.json'].fate;
  });
});

test('W113 未知枚举值', (t) => {
  const result = assertHas(t, 'W113', (files) => {
    files['characters/hero.json'].growth = ['D'];
    files['episodes/ep01.json'].beats[0].type = '随便';
  });
  assert.equal(result.issues.filter((i) => i.code === 'W113').length, 2);
});

test('W114 长线伏笔到最后一集都没有被引用', (t) => {
  const result = assertHas(t, 'W114', (files) => {
    files['episodes/ep01.json'].setups.push({ id: 'ep01.su2', t: '0:20', kind: '伏笔', longTerm: true, name: '长线', summary: '没人用' });
  });
  assert.ok(!result.issues.some((i) => i.code === 'W103' && i.target === 'ep01.su2'));
});

test('W115 决策记录格式不对', (t) => {
  const result = assertHas(t, 'W115', (files) => {
    files['characters/hero.json'].notes = [
      { date: '2026-10-31', what: '定下能力', why: '理由' },
      { date: '2026-10-30', what: '插在了后面', why: '理由' },
      { date: '10月31日', what: '日期格式不对' },
    ];
    files['episodes/ep01.json'].highlights[0].notes = 'ok';
  });
  const messages = result.issues.filter((i) => i.code === 'W115').map((i) => i.message);
  assert.equal(messages.length, 3);
  assert.ok(messages.some((m) => m.includes('早于上一条')));
  assert.ok(messages.some((m) => m.includes('缺少 why')));
  assert.ok(messages.some((m) => m.includes('YYYY-MM-DD')));
});

test('W115 合法的决策记录和纯文本 notes 不报', (t) => {
  const { codes } = run((files) => {
    files['characters/hero.json'].notes = [{ date: '2026-10-31', what: '定下能力', why: '理由', rejected: '另一个方案' }];
    files['episodes/ep01.json'].highlights[0].notes = '旧的纯文本备注';
  }, t);
  assert.ok(!codes.includes('W115'));
});

test('I201 爆点前缺少安静', (t) => {
  assertHas(t, 'I201', (files) => {
    files['episodes/ep01.json'].emotion = [
      { t: '0:00', v: 5 },
      { t: '0:45', v: 10 },
    ];
  });
});

test('I202 全集没有可切片高光', (t) => {
  assertHas(t, 'I202', (files) => {
    files['episodes/ep01.json'].highlights[0].clip = false;
  });
});

function addFight(files, id, t, fightType) {
  const hl = { id, t, type: '打斗', name: id, summary: '打一场', setups: ['ep01.su1'] };
  if (fightType) hl.fightType = fightType;
  files['episodes/ep01.json'].highlights.unshift(hl);
}

test('W116 一集里有两场以上死斗', (t) => {
  const result = assertHas(t, 'W116', (files) => {
    addFight(files, 'ep01.hl2', '0:20', '死斗');
    addFight(files, 'ep01.hl3', '0:15', '死斗');
  });
  assert.equal(result.issues.filter((i) => i.code === 'W116').length, 1);
});

test('W116 只有一场死斗不报', (t) => {
  const { codes } = run((files) => {
    addFight(files, 'ep01.hl2', '0:20', '死斗');
    addFight(files, 'ep01.hl3', '0:15', '亮相');
  }, t);
  assert.ok(!codes.includes('W116'));
});

test('I203 核心角色没写能力里写着什么或限制逼他做什么选择', (t) => {
  const result = assertHas(t, 'I203', (files) => {
    delete files['characters/hero.json'].limitChoice;
  });
  const issue = result.issues.find((i) => i.code === 'I203');
  assert.equal(issue.target, 'char.hero');
  assert.ok(issue.message.includes('限制逼他做什么选择'));
  assert.ok(!result.issues.some((i) => i.code === 'I203' && i.target === 'char.guest'));
});

test('I204 打斗高光没有标 fightType', (t) => {
  const result = assertHas(t, 'I204', (files) => {
    addFight(files, 'ep01.hl2', '0:20');
  });
  assert.equal(result.issues.find((i) => i.code === 'I204').target, 'ep01.hl2');
});

test('W113 fightType 和 fightEnding 的枚举', (t) => {
  const result = assertHas(t, 'W113', (files) => {
    addFight(files, 'ep01.hl2', '0:20', '乱打');
    files['episodes/ep01.json'].highlights[0].fightEnding = '平局';
  });
  assert.equal(result.issues.filter((i) => i.code === 'W113').length, 2);
});

test('E900 JSON 解析失败时包含文件路径和原因', (t) => {
  const files = baseFiles();
  const dir = writeProject(files);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'characters/broken.json'), '{ 坏掉的 json', 'utf8');
  const project = loadProjectDir(dir, 'test');
  const result = checkProject(project);
  const issue = result.issues.find((i) => i.code === 'E900');
  assert.ok(issue);
  assert.equal(issue.file, 'characters/broken.json');
  assert.match(issue.message, /解析失败/);
});

test('check --level 与 scope 过滤', async () => {
  const { cmdCheck } = await import('../lib/query.js');
  const files = baseFiles();
  files['episodes/ep01.json'].highlights[0].setups = [];
  files['episodes/ep01.json'].highlights[0].clip = false;
  const dir = writeProject(files);
  try {
    const project = loadProjectDir(dir, 'test');
    const scoped = cmdCheck(project, { scope: 'ep01.hl1' });
    assert.ok(scoped.data.issues.every((i) => i.target === 'ep01.hl1'));
    const onlyErrors = cmdCheck(project, { level: 'error' });
    assert.equal(onlyErrors.data.issues.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('I205 没有写全剧核心问题', (t) => {
  const result = assertHas(t, 'I205', (files) => {
    delete files['project.json'].coreQuestion;
  });
  assert.equal(result.issues.find((i) => i.code === 'I205').level, 'info');
});

test('I203 核心角色没写身边能引出单元的人和处境', (t) => {
  const result = assertHas(t, 'I203', (files) => {
    delete files['characters/hero.json'].anchors;
  });
  assert.ok(result.issues.find((i) => i.code === 'I203').message.includes('身边能引出单元的人和处境'));
});

test('I206 单元没写主题问题或挂靠的核心角色', (t) => {
  const result = assertHas(t, 'I206', (files) => {
    delete files['units/one.json'].question;
    delete files['units/one.json'].anchor;
  });
  const issue = result.issues.find((i) => i.code === 'I206');
  assert.equal(issue.target, 'unit.one');
  assert.ok(issue.message.includes('主题问题') && issue.message.includes('挂在哪个核心角色身上'));
});

test('E001 单元的 anchor 引用了不存在的角色', (t) => {
  assertHas(t, 'E001', (files) => {
    files['units/one.json'].anchor = 'char.nope';
  });
});

test('I207 单元角色没写一个想要或退场的去处', (t) => {
  const result = assertHas(t, 'I207', (files) => {
    delete files['characters/guest.json'].exit;
  });
  const issue = result.issues.find((i) => i.code === 'I207');
  assert.equal(issue.target, 'char.guest');
  assert.ok(issue.message.includes('退场的去处'));
});

test('I208 有核心角色没有当过任何单元的 anchor', (t) => {
  const result = assertHas(t, 'I208', (files) => {
    files['characters/mate.json'] = {
      ...cloneJson(files['characters/hero.json']),
      id: 'char.mate',
      name: '伙伴',
      relations: [],
    };
    files['units/two.json'] = { ...cloneJson(files['units/one.json']), id: 'unit.two', name: '单元二', episodes: [] };
  });
  assert.equal(result.issues.find((i) => i.code === 'I208').target, 'char.mate');
});

test('I208 挂靠的单元还少于核心角色数时不报', (t) => {
  const { codes } = run((files) => {
    files['characters/mate.json'] = { ...cloneJson(files['characters/hero.json']), id: 'char.mate', name: '伙伴', relations: [] };
  }, t);
  assert.ok(!codes.includes('I208'));
});

test('W117 前 3 集没有打斗或亮相高光', (t) => {
  const result = assertHas(t, 'W117', (files) => {
    files['episodes/ep01.json'].highlights[0].type = '情绪';
  });
  assert.equal(result.issues.find((i) => i.code === 'W117').target, 'ep01');
});

test('W117 第 4 集以后不报', (t) => {
  const { codes } = run((files) => {
    files['episodes/ep01.json'].highlights[0].type = '情绪';
    files['episodes/ep01.json'].no = 4;
  }, t);
  assert.ok(!codes.includes('W117'));
});

test('I209 项目没有写主角和群像', (t) => {
  assertHas(t, 'I209', (files) => {
    delete files['project.json'].protagonist;
  });
});

test('E001 protagonist 指向不存在的角色', (t) => {
  assertHas(t, 'E001', (files) => {
    files['project.json'].protagonist = 'char.nobody';
  });
});

test('I210 主角没有写固定动作', (t) => {
  const result = assertHas(t, 'I210', (files) => {
    delete files['characters/hero.json'].ritual;
  });
  assert.equal(result.issues.find((i) => i.code === 'I210').target, 'char.hero');
});

test('E001 mirror 写成角色 ID 时要存在，写描述不报', (t) => {
  assertHas(t, 'E001', (files) => {
    files['characters/hero.json'].mirror = 'char.nobody';
  });
  const { codes } = run((files) => {
    files['characters/hero.json'].mirror = '走了另一条路的师兄';
  }, t);
  assert.ok(!codes.includes('E001'));
});

function addUnits(files, n, patch = {}) {
  for (let i = 2; i < 2 + n; i++) {
    files[`units/u${i}.json`] = { ...cloneJson(files['units/one.json']), id: `unit.u${i}`, name: `单元${i}`, episodes: [], ...patch };
  }
}

test('I211 连续 3 个单元知情圈没有动', (t) => {
  assertHas(t, 'I211', (files) => addUnits(files, 3, { reveal: '' }));
});

test('I211 只有 2 个单元没动时不报', (t) => {
  const { codes } = run((files) => addUnits(files, 2, { reveal: '' }), t);
  assert.ok(!codes.includes('I211'));
});

test('I211 主角没有秘密时不报', (t) => {
  const { codes } = run((files) => {
    delete files['characters/hero.json'].secret;
    addUnits(files, 3, { reveal: '' });
  }, t);
  assert.ok(!codes.includes('I211'));
});

test('I210 主角没有秘密时不报', (t) => {
  const { codes } = run((files) => {
    delete files['characters/hero.json'].secret;
    delete files['characters/hero.json'].ritual;
  }, t);
  assert.ok(!codes.includes('I210'));
});

// ---- 场次和分镜 ----

function withScenes(files) {
  const ep = files['episodes/ep01.json'];
  ep.scenes = [
    {
      id: 'ep01.sc1',
      from: '0:00',
      to: '0:30',
      place: '街口 · 外 · 夜',
      wants: [{ who: 'char.hero', want: '找到人' }],
      turn: '他发现了规则',
      next: '所以他追了上去',
      shots: [
        { id: 'ep01.sh1', t: '0:00', dur: 10, size: '全景', move: '推', frame: '街口', lines: [{ who: 'char.hero', text: '人呢？' }] },
        { id: 'ep01.sh2', t: '0:10', dur: 20, size: '特写', frame: '地上的痕迹', realizes: ['ep01.su1'] },
      ],
    },
    {
      id: 'ep01.sc2',
      from: '0:30',
      to: '1:00',
      place: '屋顶 · 外 · 夜',
      wants: [{ who: 'char.guest', want: '再见母亲一面' }],
      turn: '他出手了',
      shots: [{ id: 'ep01.sh3', t: '0:30', dur: 30, size: '中景', frame: '屋顶上的对决', lines: [{ who: '路人', text: '快看！', kind: '画外' }], realizes: ['ep01.hl1'] }],
    },
  ];
}

test('合法的场次和分镜不报任何问题', (t) => {
  const { result } = run(withScenes, t);
  assert.deepEqual(result.counts, { error: 0, warn: 0, info: 0 }, result.issues.map((i) => `${i.code} ${i.message}`).join('\n'));
});

test('E007 场次重叠、镜头越出场次或彼此重叠', (t) => {
  assertHas(t, 'E007', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[1].from = '0:20';
  });
  assertHas(t, 'E007', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].shots[1].dur = 25;
  });
  assertHas(t, 'E007', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].shots[0].dur = 15;
  });
});

test('E001 镜头只能落实本集的条目，台词里的角色 ID 要存在', (t) => {
  assertHas(t, 'E001', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].shots[0].realizes = ['ep09.hl1'];
  });
  assertHas(t, 'E001', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].shots[0].lines[0].who = 'char.nope';
  });
});

test('W118 场次没有写 turn', (t) => {
  assertHas(t, 'W118', (files) => {
    withScenes(files);
    delete files['episodes/ep01.json'].scenes[1].turn;
  });
});

test('W119 场次没有写 next，最后一场不报', (t) => {
  assertHas(t, 'W119', (files) => {
    withScenes(files);
    delete files['episodes/ep01.json'].scenes[0].next;
  });
  const { codes } = run(withScenes, t);
  assert.ok(!codes.includes('W119'));
});

test('W120 核心角色第一次出场的那一场没写他想要什么', (t) => {
  assertHas(t, 'W120', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].wants = [];
  });
});

test('W121 高光或铺垫没有被镜头落实', (t) => {
  assertHas(t, 'W121', (files) => {
    withScenes(files);
    delete files['episodes/ep01.json'].scenes[1].shots[0].realizes;
  });
});

test('W121 没写场次的集不报', (t) => {
  const { codes } = run(null, t);
  assert.ok(!codes.includes('W121'));
});

test('W122 台词说不完', (t) => {
  assertHas(t, 'W122', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].shots[0].lines[0].text = '这一句台词非常非常长，长到十秒钟根本念不完，还在继续往下说，一直说一直说不停，说到天都黑了还没说完，旁边的人都睡着了';
  });
});

test('W123 场次没有覆盖全集', (t) => {
  assertHas(t, 'W123', (files) => {
    withScenes(files);
    const sc = files['episodes/ep01.json'].scenes[1];
    sc.to = '0:50';
    sc.shots[0].dur = 20;
  });
});

test('W113 景别、运镜、台词类型的枚举', (t) => {
  assertHas(t, 'W113', (files) => {
    withScenes(files);
    files['episodes/ep01.json'].scenes[0].shots[0].size = '大特写';
  });
});

test('E006 镜头缺少 id', (t) => {
  assertHas(t, 'E006', (files) => {
    withScenes(files);
    delete files['episodes/ep01.json'].scenes[0].shots[0].id;
  });
});

// ---- 评论 ----

function projectWithScenes(t) {
  const files = baseFiles();
  withScenes(files);
  const dir = writeProject(files);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, load: () => loadProjectDir(dir, 'test') };
}

test('评论：新建、回复、结案，用户再回复会重新打开', (t) => {
  const { load } = projectWithScenes(t);
  const c = addComment(load(), { target: 'ep01.sh1#1', text: '这句不像他' });
  assert.equal(c.id, 'c1');
  assert.equal(c.status, '待处理');
  assert.match(c.quote, /人呢/);
  assert.equal(replyComment(load(), 'c1', { text: '同意，改成……', by: 'AI' }).status, '讨论中');
  assert.equal(resolveComment(load(), 'c1', { as: '采纳', note: '改了台词' }).status, '已采纳');
  assert.equal(replyComment(load(), 'c1', { text: '还有一点', by: '用户' }).status, '讨论中');
  assert.equal(addComment(load(), { target: 'ep01.sc2', text: '第二条' }).id, 'c2');
});

test('评论：目标不存在、台词序号越界时拒绝', (t) => {
  const { load } = projectWithScenes(t);
  assert.throws(() => addComment(load(), { target: 'ep01.sh99', text: 'x' }), /目标不存在/);
  assert.throws(() => addComment(load(), { target: 'ep01.sh1#5', text: 'x' }), /目标不存在/);
  assert.throws(() => addComment(load(), { target: 'ep01.sh1', text: '  ' }), /不能为空/);
  assert.throws(() => resolveComment(load(), 'c9', { as: '采纳' }), /找不到评论/);
});

test('I213 有没处理完的评论；W124 评论指向的地方不在了', (t) => {
  const { dir, load } = projectWithScenes(t);
  addComment(load(), { target: 'ep01.sh2', text: '看看' });
  let codes = checkProject(load()).issues.map((i) => i.code);
  assert.ok(codes.includes('I213'));
  assert.ok(!codes.includes('W124'));
  // 镜头改了 ID，评论就指空了
  const epFile = path.join(dir, 'episodes/ep01.json');
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  ep.scenes[0].shots[1].id = 'ep01.sh9';
  fs.writeFileSync(epFile, JSON.stringify(ep));
  codes = checkProject(load()).issues.map((i) => i.code);
  assert.ok(codes.includes('W124'));
  // 结了案的评论不再报
  resolveComment(load(), 'c1', { as: '解决' });
  codes = checkProject(load()).issues.map((i) => i.code);
  assert.ok(!codes.includes('W124') && !codes.includes('I213'));
});
