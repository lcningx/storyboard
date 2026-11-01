# storyboard

AI 制作短剧（单集 10 分钟以内）的剧本工作台：一套写剧本的方法论，一个把剧本结构可视化的工具，一个按方法论带着人一步步搭剧本的 AI 编剧搭档。

## 从哪开始

| 想做什么 | 看这里 |
|---|---|
| 了解剧本怎么写才留得住人 | [docs/短剧爆款剧本框架.md](docs/短剧爆款剧本框架.md) |
| 和 AI 一起从零搭一部剧 | 在 Claude Code 里输入 `/story-partner`，或者说"搭剧本" |
| 在网页上看剧本结构 | `node storyboard/story.js serve`，打开 `http://<服务器IP>:4173` |
| 开发或修改工具 | [storyboard/技术方案.md](storyboard/技术方案.md) |

## 目录

```
docs/
  短剧爆款剧本框架.md      方法论
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

### 方法论：[docs/短剧爆款剧本框架.md](docs/短剧爆款剧本框架.md)

| 章节 | 讲什么 |
|---|---|
| [一、底层逻辑](docs/短剧爆款剧本框架.md#一底层逻辑) | 观众的账本；核心引擎"猜 → 验证" |
| [二、三层结构](docs/短剧爆款剧本框架.md#二三层结构) | 骨架、变量、入口 |
| [三、故事结构](docs/短剧爆款剧本框架.md#三故事结构单元剧--贯穿线) | 单元剧留下什么；三种贯穿线 |
| [四、单集](docs/短剧爆款剧本框架.md#四单集节拍与高光倒推) | 高光倒推法、节拍表、15 秒格、流失检查点 |
| [五、开头5秒](docs/短剧爆款剧本框架.md#五开头5秒) | 钩子类型、颜值 + 反常 |
| [六、角色池](docs/短剧爆款剧本框架.md#六角色池) | 核心层与单元层、五种新的点、角色卡 |
| [七、打斗](docs/短剧爆款剧本框架.md#七打斗) | 视觉免费后价值转向逻辑和情绪；硬规则 |
| [八、爆发方式](docs/短剧爆款剧本框架.md#八爆发方式) | 换形态、用法升级、情绪爆发 |
| [九、世界观](docs/短剧爆款剧本框架.md#九世界观分散投放) | 分散投放、信息差、VO 的用法 |
| [十、待讨论](docs/短剧爆款剧本框架.md#十待讨论) | 还没解决的问题 |

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
node story.js serve            # 启动网页（默认端口 4173）
npm test                       # 运行测试
```
