#!/usr/bin/env node
// storyboard 唯一入口：CLI 命令 + serve。

import { loadProject, UserError } from './lib/load.js';
import { cmdIndex, cmdShow, cmdEp, cmdWhere, cmdChain, cmdTimeline, cmdCheck } from './lib/query.js';

const USAGE = `用法：node story.js <命令> [参数] [--project <slug>] [--json]

命令：
  index [--type <类型>]                 列出所有条目（项目、角色、世界、贯穿线、单元、集）
  show <id> [<id>...]                   输出条目完整内容，集内条目也可直接查
  ep <集ID或集号> [--from <t>] [--to <t>] [--only <字段,...>]
                                        输出一集；可限定时间段和字段（如 --only highlights,setups）
  where <id>                            某个条目在哪些集、什么时间被引用
  chain <高光ID>                        高光的铺垫链，标注所在集和相隔多久
  timeline [<集ID>]                     全季概览；带集 ID 时输出该集按时间排好的条目
  check [<集ID或条目ID>] [--level error|warn|info]
                                        运行检查规则（--level 只显示不低于该级别的问题）
  new <类型> <slug>                     按模板新建条目（character/world/thread/unit/episode）
  serve [--port 4173] [--host 0.0.0.0]  启动只读网页（默认监听所有网卡；--host 127.0.0.1 只允许本机）

时间格式为 m:ss。"--json" 输出结构化数据。`;

const VALUE_FLAGS = new Set(['project', 'type', 'from', 'to', 'only', 'level', 'port', 'host']);

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (name === 'json') {
      flags.json = true;
      continue;
    }
    if (name === 'help') {
      flags.help = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new UserError(`未知参数：--${name}`);
    let value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined || value === '') throw new UserError(`--${name} 需要一个值`);
    flags[name] = value;
  }
  return { flags, positional };
}

function print(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  } else if (result.text !== '') {
    process.stdout.write(`${result.text}\n`);
  }
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;

  if (!command || command === 'help' || flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  if (command === 'serve') {
    const port = flags.port === undefined ? 4173 : Number(flags.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new UserError(`端口不合法：${flags.port}`);
    }
    const { startServer } = await import('./lib/server.js');
    await startServer({ slug: flags.project, port, host: flags.host || '0.0.0.0' });
    return;
  }

  const project = loadProject(flags.project);
  if (command !== 'check') {
    for (const file of project.parseErrors) {
      process.stderr.write(`警告：${file.file}：${file.error}\n`);
    }
  }

  switch (command) {
    case 'index':
      print(cmdIndex(project, flags), flags.json);
      break;
    case 'show':
      print(cmdShow(project, rest), flags.json);
      break;
    case 'ep':
      if (!rest[0]) throw new UserError('ep 需要一个集 ID 或集号，例如 ep01');
      print(cmdEp(project, rest[0], flags), flags.json);
      break;
    case 'where':
      if (!rest[0]) throw new UserError('where 需要一个条目 ID');
      print(cmdWhere(project, rest[0]), flags.json);
      break;
    case 'chain':
      if (!rest[0]) throw new UserError('chain 需要一个高光 ID，例如 ep01.hl4');
      print(cmdChain(project, rest[0]), flags.json);
      break;
    case 'timeline':
      print(cmdTimeline(project, rest[0]), flags.json);
      break;
    case 'check': {
      const result = cmdCheck(project, { ...flags, scope: rest[0] });
      print(result, flags.json);
      if (result.counts.error > 0) process.exitCode = 1;
      break;
    }
    case 'new': {
      if (!rest[0] || !rest[1]) throw new UserError('new 需要类型和 slug，例如 new character su-tang');
      const { createEntry } = await import('./lib/scaffold.js');
      const created = createEntry(project.dir, rest[0], rest[1]);
      print({ data: { file: created.relative, ...created.data }, text: `已创建 ${created.relative}` }, flags.json);
      break;
    }
    default:
      throw new UserError(`未知命令：${command}\n\n${USAGE}`);
  }
}

main().catch((err) => {
  if (err instanceof UserError) {
    process.stderr.write(`错误：${err.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`错误：${err.message}\n`);
    process.exitCode = 2;
  }
});
