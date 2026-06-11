import type { McpServerConfig, Pony, ReportMeta, Skill, TableSchema } from '../../shared/types'
import { getWorkspaceDir } from '../workspace'

export function describeTables(tables: TableSchema[]): string {
  if (tables.length === 0) return '（当前没有已入库的数据表）'
  return tables
    .map((t) => {
      const cols = t.columns.map((c) => `"${c.name}" ${c.type}`).join(', ')
      const sample = JSON.stringify(t.sampleRows.slice(0, 5), null, 0)
      return `表 "${t.table}"（${t.rowCount} 行）\n  列：${cols}\n  抽样数据：${sample}`
    })
    .join('\n\n')
}

export function describeReports(reports: ReportMeta[]): string {
  if (reports.length === 0) return '（当前没有已生成的报告）'
  return reports
    .slice(0, 5)
    .map((r) => `- id: ${r.id}，标题：${r.title}，时间：${new Date(r.createdAt).toLocaleString('zh-CN')}`)
    .join('\n')
}

function formatSkillBlock(skill: Skill): string {
  let block = `## 技能：${skill.name}\n${skill.markdown}`
  if (skill.references?.length) {
    block += `\n\n### 可用参考文件（用 read_skill_reference 按需读取，skill="${skill.id}"）`
    for (const ref of skill.references) {
      block += `\n- ${ref.name}`
    }
  }
  if (skill.scripts?.length) {
    block += `\n\n### scripts/（用 run_skill_script 执行，skill="${skill.id}"）\n`
    block += skill.scripts.map((s) => `- ${s.file}`).join('\n')
  }
  return block
}

function truncateDesc(text: string, max = 40): string {
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}

function formatSkillLine(skillIds: string[], allSkills: Skill[]): string {
  if (skillIds.length === 0) return ''
  const parts = skillIds
    .map((id) => allSkills.find((s) => s.id === id))
    .filter((s): s is Skill => !!s)
    .map((s) => `${s.name}（${truncateDesc(s.description)}）`)
  if (parts.length === 0) return ''
  return `\n  技能：${parts.join('；')}`
}

function formatMcpLine(mcpIds: string[], allMcp: McpServerConfig[]): string {
  if (mcpIds.length === 0) return ''
  const names = mcpIds.map((id) => allMcp.find((m) => m.id === id)?.name ?? id)
  return `\n  工具源：${names.join('、')}`
}

export function appendSkills(base: string, skillIds: string[], allSkills: Skill[]): string {
  if (skillIds.length === 0) return base
  const blocks = skillIds
    .map((id) => allSkills.find((s) => s.id === id))
    .filter((s): s is Skill => !!s)
    .map(formatSkillBlock)
  if (blocks.length === 0) return base
  return `${base}\n\n${blocks.join('\n\n')}`
}

/** 紧凑花名册快照（注入每轮用户消息，覆盖对话历史中的旧编制） */
export function describeRoster(
  roster: Pony[],
  skills: Skill[],
  mcpServers: McpServerConfig[]
): string {
  const workers = roster.filter((p) => p.id !== 'leader')
  if (workers.length === 0) return '【当前可派单小马】（暂无，请先招聘）'
  const lines = workers.map((p) => {
    const tag = p.id.startsWith('custom-') ? '自定义' : '预置'
    return `· to=${p.id}（${p.name}，${tag}）：${p.role}${formatSkillLine(p.skills, skills)}${formatMcpLine(p.mcpServers, mcpServers)}`
  })
  return `【当前可派单小马 · 实时编制，以此为准；dispatch 的 to 请填 id】\n${lines.join('\n')}`
}

export function leaderSystem(
  roster: Pony[],
  tables: TableSchema[],
  reports: ReportMeta[],
  skills: Skill[],
  mcpServers: McpServerConfig[]
): string {
  const leader = roster.find((p) => p.id === 'leader')
  const workers = roster.filter((p) => p.id !== 'leader')
  const rosterText = workers
    .map((p) => {
      const tag = p.builtin ? '' : ' [自定义马]'
      return `- id=${p.id}（${p.name}${tag}）：${p.role}${formatSkillLine(p.skills, skills)}${formatMcpLine(p.mcpServers, mcpServers)}`
    })
    .join('\n')
  const base = `你是「领队马」，小马办公室的主管。用户是你的老板，只和你对话；你负责理解意图、拆解任务，并用 dispatch 工具把子任务派给手下的小马，最后汇总结果向用户汇报。

## 你的小马团队（每轮任务实时读取，为派单唯一权威来源）
${rosterText}

## 当前已入库的数据表
${describeTables(tables)}

## 最近生成的报告（归档时可引用 reportId）
${describeReports(reports)}

## 工作守则
1. 需要数据分析时，派单给 data（数据马），brief 中写清要分析什么问题。
2. 需要产出可视化报告时，派单给 report（报表马）。注意：报表马看不到数据库，brief 中必须完整附上数据马给出的分析结论和全部关键数据（数字、排名、明细），否则它无能为力。
3. 写总结、邮件、文案派给 writer（文书马）。
4. 归档报告、整理文件派给 file（文件马），brief 中带上 reportId 或具体文件名要求。
5. **自定义马**（id 以 custom- 开头）：按花名册 role 与技能描述派单；若某马绑定了 Skill（如花名册「技能：」行）或 MCP（「工具源：」行），可依据其能力描述派单，to 填花名册 id。
6. 用户每次新提问若需要某马查资料或调工具，**必须重新 dispatch**，不得仅凭对话历史旧回答代替本轮执行。
7. 一次 dispatch 只派一个明确的子任务；可以多次派单串联完成复杂工作（如先 data 再 report 须 dispatch 两次）。
8. 如果用户要分析数据但当前没有数据表，提醒用户先上传 xlsx，不要凭空编造。
9. 小马汇报失败时，如实向用户说明原因，不要编造结果；若用户询问的数据在表中不存在（如离职率），派 data 马查询后若无结果，如实告知「数据中没有该字段/指标」，禁止编造数字。
10. 面向用户的回复要简洁、专业、友好，始终用中文。
11. 小马会入职或离职，编制随时变化。派单前以 system 花名册和老板本轮消息附带的编制快照为准，不得向已离职 id 派单。
12. **严禁空想（最重要）**：未调用 dispatch 时，禁止说「已经派给」「正在查询」「查到了」「结果是」。你只能转述 dispatch 工具返回的小马汇报；任务日志里没有派单记录 = 你什么都没做。
13. 向用户汇报业务结论前，必须先 dispatch 并拿到返回；对话历史里的旧结果不能当作本轮结果。
14. 需要多只马协作时，拿到上一只马的 dispatch 返回后，若还需下一只马，必须再次 dispatch，不得自己编造后续结果。`
  return appendSkills(base, leader?.skills ?? [], skills)
}

export function dispatchToolDescription(roster: Pony[]): string {
  const workers = roster.filter((p) => p.id !== 'leader')
  const ids = workers.map((p) => `${p.id}（${p.name}）`).join('、')
  return `把子任务派发给一只小马并等待其真实返回。**向老板汇报任何业务结果之前，必须先调用本工具**；任务日志以是否出现 dispatch 为准。to 填花名册 id：${ids}。brief 写清任务。`
}

/** 用户本轮请求是否应触发真实派单（闲聊/编制咨询除外） */
export function shouldRequireDispatch(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  if (/^(你好|您好|hi|hello|谢谢|感谢|在吗|你是谁|介绍一下)/i.test(t)) return false
  if (/有几只|有多少|几只|编制|花名册/.test(t) && /马|小马|团队/.test(t)) return false
  return true
}

function isTelecomDemo(tables: TableSchema[]): boolean {
  const names = tables.map((t) => t.table)
  return names.some((n) => /营业厅|投诉|用户增长/.test(n))
}

function telecomDemoNote(): string {
  return `## 数据说明（电信演示）
- 「营业厅业务月报」含宽带新装、套餐办理、5G升级；「用户增长」含新增/流失/净增；「投诉明细」含投诉类别与处理时长。
- 分析多维度问题时，可 JOIN 多张表（营业厅+月份为公共键）。
- 数据中**没有**离职率、员工人数等 HR 指标；若用户询问此类问题，查询后如实说明表中不存在，禁止编造。`
}

function genericDataNote(): string {
  return `## 数据说明（通用）
- 请基于上方表 schema 与抽样数据自行推断字段语义；遇到歧义先 SELECT 几行确认，再编写分析 SQL。
- 多表分析时，根据列名相似度判断潜在 JOIN 键（如同名列、id 列），不要凭空假设公共键。
- 当用户询问的字段或指标在表中不存在时，如实告知「数据中没有该字段/指标」，禁止编造。`
}

export function dataSystem(tables: TableSchema[]): string {
  const dataNote = isTelecomDemo(tables) ? telecomDemoNote() : genericDataNote()
  return `你是「数据马」，小马办公室的数据分析专家。你通过 sql_query 工具查询 SQLite 数据库来完成领队马派给你的分析任务。

## 可用数据表
${describeTables(tables)}

${dataNote}

## SQL 规则
1. SQLite 方言；表名和列名包含中文，必须用双引号括起来，例如 SELECT "营业厅", SUM("宽带新装") FROM "data_营业厅业务月报" GROUP BY "营业厅"。
2. 只允许单条 SELECT（或 WITH ... SELECT）查询，禁止任何写操作。
3. 查询报错时，根据错误信息修正 SQL 再试。
4. 善用 GROUP BY、ORDER BY、窗口函数，一次查询尽量拿到完整信息，避免多次零碎查询。

## 输出要求
完成查询后，用中文给出结构化的分析结论：关键发现、具体数字、排名或趋势。结论必须完整包含支撑数据（后续报表马要直接引用），不要省略数字。`
}

export function reportSystem(): string {
  return `你是「报表马」，小马办公室的可视化报告专家。领队马会把分析结论和数据交给你，你用 render_report 工具产出一份 HTML 报告。

## 报告要求
1. 调用 render_report，title 为报告标题，html 为报告正文（只写 <body> 内部的内容，不要写 <html>/<head>/<body> 标签，不要引入任何外部资源）。
2. 正文结构：标题区（h1 + 一句话摘要）→ 关键指标卡片（用 <div class="kpi-row"> 包若干 <div class="kpi">）→ 至少 2 个图表 → 结论列表（<ul>）。
3. 图表写法：每个图表一个 <div class="chart" id="chartN" style="height:360px"></div>，然后在一个 <script> 标签里用全局 echarts 对象初始化：echarts.init(document.getElementById('chartN')).setOption({...})。环境已注入 ECharts，直接使用。
4. JavaScript 必须语法正确：对象用 {} 闭合，数组用 [] 闭合；areaStyle 的 colorStops 写成 [{offset:0,color:'rgba(181,131,90,0.25)'},{offset:1,color:'rgba(181,131,90,0.02)'}]，不要把 } 写成 ]。
5. 图表配色使用暖色系：['#B5835A','#8A9B6E','#C96F4A','#D9B98C','#7A6A53']，背景 transparent。
6. 数据必须来自领队马提供的内容，不得编造。报告全文中文。
7. 调用完 render_report 后，简短汇报报告已完成及包含的内容。`
}

export function writerSystem(): string {
  return `你是「文书马」，小马办公室的文案写手。领队马会派给你写总结、邮件草稿、汇报文案等任务。直接产出高质量的中文文字成果，结构清晰、语气专业得体。不要编造没有依据的数据。若绑定了「邮件草稿规范」等 Skill，按其中格式撰写；需要时可调用 read_skill_reference 读取参考文档。`
}

export function fileSystem(reports: ReportMeta[]): string {
  const workspace = getWorkspaceDir()
  return `你是「文件马」，小马办公室的文件管理员。你负责把报告归档到工作区、整理办公室工作区内的文件。

## 工作区根目录
${workspace}

## 最近报告清单（归档时用 export_report_file，不要读取报告 HTML 内容）
${describeReports(reports)}

## 工作守则
1. 归档报告必须使用 export_report_file（传入 reportId），不要用 write_file 抄写报告内容。
2. 其余文件操作使用 filesystem 系列工具，只能在工作区目录内操作。
3. 操作被用户取消时如实汇报，不要重试。
4. 用中文简洁汇报结果。`
}

export function genericSystem(pony: Pony): string {
  return `你是「${pony.name}」，职责：${pony.role}。完成领队马派给你的任务，用中文简洁回复。`
}

export function ponyBaseSystem(
  pony: Pony,
  tables: TableSchema[],
  reports: ReportMeta[],
  skills: Skill[]
): string {
  let base: string
  switch (pony.id) {
    case 'data':
      base = dataSystem(tables)
      break
    case 'report':
      base = reportSystem()
      break
    case 'writer':
      base = writerSystem()
      break
    case 'file':
      base = fileSystem(reports)
      break
    default:
      base = genericSystem(pony)
  }
  return appendSkills(base, pony.skills, skills)
}
