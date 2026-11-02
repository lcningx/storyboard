# storyboard 使用说明（写给 AI）

## 这是什么

`storyboard/` 是连续剧（单集时长不限）的**剧本结构数据 + 只读查看器**。
你负责读写 JSON 数据文件；人只通过网页看结构。网页没有任何编辑功能。

- 数据位置：`projects/<项目 slug>/`
- 字段与规则：见同目录的 [技术方案.md](技术方案.md) 第 5 节（数据模型）和第 6.2 节（检查规则）
- 领域概念（节拍、高光、铺垫、贯穿线、单元、三层结构等）：见 [../精品剧剧本框架.md](../docs/精品剧剧本框架.md)

零依赖，只用 Node.js。所有命令都在 `storyboard/` 目录下运行：

```bash
node story.js <命令> [参数] [--project <slug>] [--json]
```

有多个项目时必须带 `--project`；只有一个项目时会自动选中。

## 工作流程

1. **先看目录**：`node story.js index`
   - 输出每个条目的 `ID  名字  一句话`，按项目、角色、世界、贯穿线、单元、集分组。
   - 不要先读整个 `projects/` 目录，也不要把所有 JSON 一次性读进来。
2. **按需取一小块**：
   - 某个条目：`node story.js show <id>`（集内条目如 `ep01.hl2` 也能查）
   - 某一集：`node story.js ep ep01`
   - 某个时间段：`node story.js ep ep01 --from 3:00 --to 4:30`
   - 只要某几类：`node story.js ep ep01 --only highlights,setups`
   - 某个角色/线/设定出现在哪：`node story.js where char.su-tang`
   - 一个高光的铺垫链：`node story.js chain ep01.hl4`
   - 全季概览：`node story.js timeline`
   - 某一集或某一场的剧本（场次、想要、转折、镜头、台词）：`node story.js script ep01 [ep01.sc2]`
3. **直接编辑对应的 JSON 文件**，不要通过网页改，也不要新建中间文件。
4. **跑检查并修错误**：
   ```bash
   node story.js check          # 整个项目
   node story.js check ep01     # 只看这一集
   node story.js check ep01.hl4 # 只看这个条目
   ```
   - `error` 必须修。如果是写入时的笔误（引用拼错、时间格式错），直接修；如果修复需要改动剧情内容，先问用户。
   - `warn` 和 `info` **不要自己去修**：告诉用户是什么问题、意味着什么，问他要不要处理。不要为了消掉警告而自己编剧情内容。
   - 退出码：0 正常，1 有 error 级问题，2 参数/找不到条目。
5. 打开着的网页会通过 SSE 自动刷新；改坏了 JSON 会在网页顶部显示红色提示，修好即恢复。

其他命令：

- `node story.js new <类型> <slug>`：按模板新建文件
- `node story.js serve [--port 4173]`：启动只读网页，`/` 是项目列表，`/<slug>` 是某个项目（如 `http://<服务器IP>:4173/demo`）
- 所有命令加 `--json` 输出合法 JSON，方便程序处理

## 新建条目

```bash
node story.js new character su-tang
node story.js new world price-tag
node story.js new thread rent
node story.js new unit rain-girl
node story.js new episode 4        # 或 ep04
```

类型与位置、ID 的对应关系：

| 类型 | 目录 | ID | 文件名 |
|---|---|---|---|
| character | `characters/` | `char.<slug>` | `<slug>.json` |
| world | `world/` | `world.<slug>` | `<slug>.json` |
| thread | `threads/` | `thread.<slug>` | `<slug>.json` |
| unit | `units/` | `unit.<slug>` | `<slug>.json` |
| episode | `episodes/` | `epNN` | `epNN.json` |

- `slug` 只含小写字母、数字和 `-`。
- 文件名必须等于 ID 去掉类型前缀；集固定两位数字。
- 集内条目（高光、铺垫、事件）不单独建文件，写在集文件里，ID 为 `epNN.hlN`、`epNN.suN`、`epNN.evN`。

## 改 ID 时

ID 被别处引用，改 ID 必须同时改所有引用，否则 `check` 会报 E001：

```bash
node story.js where char.su-tang   # 先看它在哪些地方被引用
# 改文件名、文件里的 id、以及 where 列出的每个引用
node story.js check
```

节目录、文件名和 ID 三者要一致，否则报 E002。

## 写数据时的约定

- UTF-8，JSON，2 空格缩进；字段名英文，内容中文。
- 时间一律字符串 `"m:ss"`（如 `"0:05"`、`"3:50"`），也允许 `"mm:ss"`。
- 所有顶层条目都有 `id`、`name`、`summary`；`notes` 可选。
- `notes` 是决策记录数组，每条 `{ date, what, why, rejected?, risk? }`。**只追加，不删改旧记录**；决定变了就追加一条新的。格式见技术方案 5.1。
- 引用只写 ID，不复制内容。
- 枚举值用中文；未知枚举值不会让程序崩溃，但 `check` 会报 W113。
- 高光：本集必须**恰好一个** `climax: true`；没有铺垫时写 `noSetupReason`，否则报 W102。
- 铺垫：被高光用 `setups` 引用；跨集长线伏笔标 `longTerm: true`，否则没人引用会报 W103/W114。
- 事件：`kind: "揭示"` 且指向秘密类世界设定时，必须写 `layer`（对应 `layers.no`）。
- 场次（`scenes`，选填）：每场写 `wants`（谁想要什么）、`turn`（怎么转）、`next`（接下一场的理由），场次覆盖全集；镜头写 `t`、`dur`、`size`、`frame`，台词放在镜头的 `lines` 里，`realizes` 标出它落实了本集哪个高光、铺垫或事件。画面用中文写看得见的东西，不写生成提示词。写了场次的集，每个高光和铺垫都要被某个镜头落实（W121）。

完整字段表直接看 [技术方案.md](技术方案.md) 第 5 节，不要凭记忆猜字段。

## 不要做的事

- 不要一次性读取或改写整个 `projects/` 目录。
- 不要修改 `viewer/` 来实现编辑功能——网页按设计只读。
- 不要在 JSON 里复制别的条目内容，只放 ID。
- 不要为了让检查通过而删掉剧情信息；先判断是数据错还是结构真的有问题。
- 不要用颜色控制字符或额外日志污染 CLI 输出。
