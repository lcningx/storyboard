# 怎么读写数据

数据在 `storyboard/projects/<slug>/`，格式见 [技术方案.md](../../../../storyboard/技术方案.md) 第 5 节。下面的命令都在仓库根目录下运行。

## 读：只取需要的那一块

| 想知道 | 命令 |
|---|---|
| 项目里有什么 | `node storyboard/story.js index --project <slug>` |
| 某个条目的全部内容 | `node storyboard/story.js show <id> --project <slug>` |
| 某集的某一段 | `node storyboard/story.js ep 3 --from 1:30 --to 3:00 --project <slug>` |
| 某集只看高光和铺垫 | `node storyboard/story.js ep 3 --only highlights,setups --project <slug>` |
| 某个角色、线、设定出现在哪 | `node storyboard/story.js where <id> --project <slug>` |
| 高光靠哪些铺垫撑着 | `node storyboard/story.js chain <高光ID> --project <slug>` |
| 全季概览，或某集按时间排好的条目 | `node storyboard/story.js timeline [<集ID>] --project <slug>` |
| 有什么问题 | `node storyboard/story.js check [<集ID或条目ID>] --project <slug>` |

- `projects/` 下有多个项目（示例项目 `demo` 一直都在），所以**每条命令都带 `--project`**。
- 不要用 `cat`、`ls -R` 之类把整个项目读一遍。
- 要改一个文件之前，先用 Read 读这个文件，只读这一个。

## 评论

评论存在 `projects/<slug>/comments.json`，**不要手改**，只用命令：

| 想做 | 命令 |
|---|---|
| 列出没处理完的评论 | `node storyboard/story.js comments --status 未完成 --project <slug>` |
| 某一集或某个条目上的评论 | `node storyboard/story.js comments --target ep01 --project <slug>` |
| 看一条评论的原文和对话 | `node storyboard/story.js comment c3 --project <slug>` |
| 回复（用户在网页上能看到） | `node storyboard/story.js comment reply c3 <内容> --project <slug>` |
| 结案 | `node storyboard/story.js comment resolve c3 --as 采纳\|拒绝\|解决 --note <改了什么、为什么> --project <slug>` |
| 自己发起一条 | `node storyboard/story.js comment add ep01.sh9#1 <内容> --project <slug>` |

- 评论的目标是条目 ID；指向某一句台词时写 `镜头ID#第几句`。
- 改镜头 ID 或删条目前，先看有没有没处理完的评论指着它；指空了 `check` 会报 W124。
- 处理流程见 SKILL.md 的"处理评论"。

## 变更单

讨论有了结论以后、写入之前，先给用户看变更单：

```
【待确认的变更】
新增  char.lin-xia   林夏（核心）
      能力：……  限制：……  变强方式：B、C
修改  ep01.hl2       时间 1:35 → 1:50
修改  ep01.hl4       铺垫加上 ep01.su6
删除  ep01.su3       「他会来接我」
      影响：ep01.hl4 引用了它，会同时从 ep01.hl4 的铺垫里去掉
确认后写入？
```

- 每一行：操作（新增、修改、删除）、ID、一句话说明。
- **新增**：写出关键内容，让用户看得出写进去的是什么。字段很多时（比如一整张角色卡），挑重要的列出来，其余的说明"其余字段按讨论内容填写"。
- **修改**：写出改前和改后。
- **删除**，或者修改了 ID、时间这类会影响别处的东西：先跑 `where`，把所有受影响的地方写在"影响"里。
- 用户同意以后，只写变更单上的内容。

## 写入

### 新建项目

`new` 命令不建项目，手动建：

1. 和用户确认项目的 slug（小写字母、数字和 `-`，比如 `night-shop`）。
2. 用 Write 创建 `storyboard/projects/<slug>/project.json`，至少包含 `id`、`name`、`summary`、`skeleton`（还没定就写 `[]`）。
3. 其他子目录不用手动建，`new` 会自动创建。

### 新增条目

1. `node storyboard/story.js new <类型> <slug> --project <slug>`，类型是 character、world、thread、unit、episode。它会马上生成一个必填字段为空的文件，所以**只在用户确认以后再跑**。
2. 用 Edit 把讨论好的内容填进去，同一轮里填完。没填完的文件会让 `check` 报错。
3. 单元角色要把 `layer` 改成 `"单元"`，并填上 `unit` 和 `fate`。
4. 新增一集时，记得把它加进所属单元的 `episodes`。

### 集内条目（高光、铺垫、事件）

它们写在集文件里，没有 `new` 命令。用 Edit 往对应的数组里加。

- ID 接着已有的编号往下排：已有 `ep02.hl1` 到 `ep02.hl4`，新的就是 `ep02.hl5`。删掉的编号不要回收。
- 数组按时间排列，新条目插在对的位置。
- 一集必须恰好有一个 `climax: true` 的高光。

### 修改

用 Edit 只改相关的字段，不要整个文件重写。

### 删除

1. 先跑 `where <id>`，找出所有引用它的地方（变更单上已经列出来了）。
2. 删除条目：整个文件就删文件；集内条目就从数组里删掉。
3. 去掉所有引用它的地方。

### 改 ID

1. 跑 `where <旧ID>` 找出所有引用。
2. 改条目本身的 `id`；如果是独立文件，文件名也要一起改。
3. 把所有引用改成新 ID。

## 决策记录（notes）

每次按变更单写入时，**同一轮里**给每个改动过的条目的 `notes` 追加一条记录。用户确认变更单，就等于确认了这些记录，不需要再单独问。

```json
"notes": [
  {
    "date": "2026-10-31",
    "what": "限制改为：只在店门之内有效",
    "why": "逼出每集都要把对方引进店，直接成了骨架里的“压”",
    "rejected": "每次标价要付出记忆：扣血条式的限制，不逼人做选择",
    "risk": "店外的戏会比较被动"
  }
]
```

| 字段 | 必填 | 写什么 |
|---|---|---|
| `date` | 是 | 今天的日期，`"YYYY-MM-DD"` |
| `what` | 是 | 定了什么，一句话。修改就写"A 改为 B"；删除见下 |
| `why` | 是 | 为什么。用户只说了"就这样"、没给理由时，写"用户决定"，不要替他编理由 |
| `rejected` | 否 | 讨论中考虑过、被否掉的方案，以及原因 |
| `risk` | 否 | 你提过、用户仍决定接受的风险 |
| `comment` | 否 | 这次改动来自哪条评论，比如 `"c3"` |

规则：

- **只追加，不删改**：旧记录是历史。决定变了，就追加一条新的，`what` 写清楚"推翻了某天的什么决定"。
- **记在被改的条目上**：改的是高光，就记在这个高光上，不要记在集上。一次改动涉及几个条目时，每个条目各记一条，内容只写和这个条目有关的部分。
- **删除条目时**：条目没了，记录跟着没了。如果删除的理由值得保留，记到受影响最大的那个相关条目上（比如删了一个铺垫，就记在原来引用它的高光上）。
- **只记真实讨论过的内容**：理由、被否掉的方案、风险都必须来自这次对话，不能事后补想。
- **集内条目**的 `notes` 写在条目对象里，和 `setups`、`refs` 并列。
- 写完在汇报里提一句记了哪几条，用户在网页的详情面板里能看到全文。

## 写完以后

1. 跑 `check --project <slug>`。
2. **错误级问题（E 开头）**：如果是你刚才写入时的笔误（引用拼错、时间格式错了），直接修，不改动任何内容。如果修复需要改动内容，出一张新的变更单。
3. **警告级问题（W 开头）**：告诉用户，说明意思，问他要不要处理。不要自己编内容去消除警告。
4. 用一两句话汇报：写了什么，现在有哪些问题。

## 写内容时的约定

- 字段名用英文，内容用中文。
- `name` 是几个字的短名；`summary` 是一句话。
- 时间写成 `"m:ss"`，比如 `"3:05"`。
- 台词放在字符串里时用中文引号“”，不要用英文双引号，否则要转义。
- 各字段的含义和枚举值，查 [技术方案.md](../../../../storyboard/技术方案.md) 第 5 节，不要凭记忆。

## 工具不能用时

如果 `node storyboard/story.js` 报错或不存在，告诉用户。可以先按技术方案第 5 节的格式直接读写 JSON 文件，但写完以后要自己检查：JSON 是否合法、引用的 ID 是否都存在、时间是否在本集时长之内。
