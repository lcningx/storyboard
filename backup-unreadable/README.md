# storyboard

AI 制作连续剧（单集时长不限）的剧本工作台：一套写剧本的方法论，一个把剧本结构可视化的工具，一个按方法论带着人一步步搭剧本的 AI 编剧搭档。

## 从哪开始

| 想做什么 | 看这里 |
|---|---|
| 了解剧本怎么写才留得住人 | [docs/精品剧剧本框架.md](docs/精品剧剧本框架.md) |
| 和 AI 一起从零搭一部剧 | 在 Claude Code 里输入 `/story-partner`，或者说"搭剧本" |
| 在网页上看剧本结构 | `node storyboard/story.js serve`，打开 `http://<服务器IP>:4173`，选项目或直接访问 `/<项目名>` |
| 开发或修改工具 | [storyboard/技术方案.md](storyboard/技术方案.md) |

## 目录

```
docs/
  精品剧剧本框架.md        方法论
  案例拆解.md              方法论的案例证据
storyboard/                剧本结构工具：数据 + 命令行 + 只读网页
  技术方案.md              设计文档：数据模型、命令、检查规则、网页
  CLAUDE.md                写给 AI 的使用说明
  projects/                剧本数据，一个项目一个目录
    demo/                  示例项目《零点收银》
.claude/skills/story-partner/
  SKILL.md                 编剧搭档：角色、流程、确认规则
  references/stages.md     8 个阶段各自怎么做
  references/data-ops.md   怎么读写剧本数据、决策记录
archive/                   早期剧本存档，见 archive/README.md
```

## 文档索引

### 方法论：[docs/精品剧剧本框架.md](docs/精品剧剧本框架.md)

| 章节 | 讲什么 |
|---|---|
| [一、底层逻辑](docs/精品剧剧本框架.md#一底层逻辑) | 观众的账本；核心引擎"猜 → 验证" |
| [二、两个来源各管什么](docs/精品剧剧本框架.md#二两个来源各管什么) | 特摄管"一个单元一个单元怎么来"，动漫管"每一场怎么打"；两边在哪接上 |
| [三、叙事壳](docs/精品剧剧本框架.md#三叙事壳从特摄拿什么) | 三层结构、对手为什么一个单元一个单元地来、仪式、伙伴集结、单元剧与贯穿线 |
| [四、打斗质感](docs/精品剧剧本框架.md#四打斗质感从动漫拿什么) | 能力规则、打斗类型、单场结构、情绪、变强方式 |
| [五、角色](docs/精品剧剧本框架.md#五角色) | 两层角色、核心角色和对手怎么设计、支援、角色卡 |
| [六、单集](docs/精品剧剧本框架.md#六单集节拍与高光倒推) | 高光倒推法、节拍表、15 秒格、流失检查点 |
| [七、开头5秒](docs/精品剧剧本框架.md#七开头5秒) | 钩子类型、颜值 + 反常 |
| [八、世界观](docs/精品剧剧本框架.md#八世界观分散投放) | 分散投放、信息差、VO 的用法 |
| [九、待讨论](docs/精品剧剧本框架.md#九待讨论) | 还没解决的问题 |

案例证据：[docs/案例拆解.md](docs/案例拆解.md)，框架里的案例编号（如 `OP-3`）都在这里。

### 工具：[storyboard/技术方案.md](storyboard/技术方案.md)

| 章节 | 讲什么 |
|---|---|
| 1–4 | 要解决的问题、设计原则、运行环境、目录结构 |
| 5 | 数据模型：角色、世界设定、贯穿线、单元、集，以及决策记录 |
| 6 | 命令行和检查规则 |
| 7–8 | 本地服务和网页查看器 |
| 9–12 | 非功能要求、CLAUDE.md 要求、验收标准、暂不做 |

### 编剧搭档：[.claude/skills/story-partner/](.claude/skills/story-partner/SKILL.md)

| 文件 | 讲什么 |
|---|---|
| [SKILL.md](.claude/skills/story-partner/SKILL.md) | 平等不讨好的讨论方式、讨论循环、变更单确认规则 |
| [references/stages.md](.claude/skills/story-partner/references/stages.md) | 一句话设想 → 骨架 → 核心角色 → 试播集 → 回看试播 → 贯穿线 → 单元池 → 逐集 |
| [references/data-ops.md](.claude/skills/story-partner/references/data-ops.md) | 按需读取、变更单格式、增删改步骤、决策记录 |

## 常用命令

所有命令在 `storyboard/` 目录下运行，有多个项目时加 `--project <名字>`。

```bash
node story.js index            # 项目里有什么
node story.js check            # 检查问题
node story.js serve            # 启动网页（默认端口 4173，/<项目名> 打开某个项目）
npm test                       # 运行测试
```
