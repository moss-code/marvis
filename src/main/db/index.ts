import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  AccessoryId,
  AgentEvent,
  ChatMessage,
  McpServerConfig,
  PaletteId,
  Pony,
  PonyDraft,
  ReportMeta,
  RunMeta,
  Skill,
  TableSchema
} from '../../shared/types'
import { normalizeMcpConfig, normalizeMcpSpec, parseStandardMcpJson } from '../mcp/spec'
import {
  deleteWorkspaceSkill,
  listWorkspaceSkills,
  migrateCustomSkillsFromDb,
  saveWorkspaceSkill
} from '../skills'
import { getWorkspaceDir } from '../workspace'
import { resolveAsarUnpackedPath } from '../envPath'

const require = createRequire(import.meta.url)

const PALETTE_IDS: PaletteId[] = ['linen', 'camel', 'ochre', 'sage', 'terracotta']
const ACCESSORY_IDS: AccessoryId[] = ['glasses', 'bowtie', 'beret', 'brass-tag']
const PRESET_ORDER = ['leader', 'data', 'report', 'file', 'writer']

let db: DatabaseSync

const PRESET_PONIES: Pony[] = [
  {
    id: 'leader',
    name: '领队马',
    role: '理解用户意图、拆解任务、把工作派给合适的小马、汇总结果向用户汇报',
    builtin: true,
    skin: { palette: 'camel', accessories: ['brass-tag'] },
    skills: [],
    mcpServers: []
  },
  {
    id: 'data',
    name: '数据马',
    role: '数据分析专家：基于已入库的数据表编写 SQL 查询并解读结果，产出分析结论',
    builtin: true,
    skin: { palette: 'sage', accessories: ['glasses'] },
    skills: [],
    mcpServers: []
  },
  {
    id: 'report',
    name: '报表马',
    role: '可视化报告专家：把分析结论与数据制作成带 ECharts 图表的 HTML 报告',
    builtin: true,
    skin: { palette: 'terracotta', accessories: ['beret'] },
    skills: [],
    mcpServers: []
  },
  {
    id: 'file',
    name: '文件马',
    role: '文件管理员：负责归档报告、整理工作区文件（能力将在后续版本通过 MCP 开放）',
    builtin: true,
    skin: { palette: 'linen', accessories: ['bowtie'] },
    skills: ['skill-archive'],
    mcpServers: []
  },
  {
    id: 'writer',
    name: '文书马',
    role: '文案写手：撰写工作总结、邮件草稿、汇报文案等文字材料',
    builtin: true,
    skin: { palette: 'ochre', accessories: [] },
    skills: ['skill-email'],
    mcpServers: []
  }
]

const PRESET_SKILLS: Skill[] = [
  {
    id: 'skill-email',
    name: '邮件草稿规范',
    description: '商务邮件主题、称呼、正文与落款格式',
    markdown: `撰写邮件草稿时遵循：
1. 主题行简洁明确，概括事由。
2. 称呼得体（如「尊敬的…」「各位同事」）。
3. 正文分三段：开场说明背景 → 核心信息与数据要点 → 结尾请求或下一步。
4. 落款含署名与日期，语气礼貌专业。`,
    builtin: true,
    updatedAt: 0
  },
  {
    id: 'skill-summary',
    name: '工作总结结构',
    description: '背景、数据要点、结论与下一步的结构化总结',
    markdown: `工作总结按以下结构输出要点列表：
1. **背景**：本期工作范围与目标。
2. **数据要点**：关键指标与发现（有数据则引用具体数字）。
3. **结论**：主要判断与亮点/问题。
4. **下一步**：可执行的建议或计划。`,
    builtin: true,
    updatedAt: 0
  },
  {
    id: 'skill-archive',
    name: '归档命名规范',
    description: '工作区文件按日期与主题归档',
    markdown: `归档文件时：
1. 文件名格式 \`YYYY-MM-DD_主题\`，主题简短无非法字符。
2. 先在工作区下建当月子文件夹（如 \`2026-06\`），再放入文件。
3. 同类报告不覆盖，必要时在主题后加序号。`,
    builtin: true,
    updatedAt: 0
  }
]

export function initDb(): void {
  const file = join(app.getPath('userData'), 'pony-office.db')
  db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS ponies        (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS reports       (id TEXT PRIMARY KEY, title TEXT, html TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS runs          (id TEXT PRIMARY KEY, events_json TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS skills        (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mcp_servers   (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  `)
  const insertPony = db.prepare('INSERT OR IGNORE INTO ponies (id, json) VALUES (?, ?)')
  for (const p of PRESET_PONIES) insertPony.run(p.id, JSON.stringify(p))

  const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (id, json) VALUES (?, ?)')
  for (const s of PRESET_SKILLS) insertSkill.run(s.id, JSON.stringify(s))

  seedFilesystemMcpServer()
  migrateFilePony()
  migrateCustomSkillsToWorkspace()
  migrateRunsTable()
}

function migrateRunsTable(): void {
  for (const ddl of [
    'ALTER TABLE runs ADD COLUMN user_query TEXT',
    'ALTER TABLE runs ADD COLUMN ok INTEGER',
    'ALTER TABLE runs ADD COLUMN duration_ms INTEGER',
    'ALTER TABLE runs ADD COLUMN event_count INTEGER'
  ]) {
    try {
      db.exec(ddl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('duplicate column')) throw err
    }
  }
}

function seedFilesystemMcpServer(): void {
  let fsEntry: string
  try {
    fsEntry = resolveAsarUnpackedPath(
      require.resolve('@modelcontextprotocol/server-filesystem/dist/index.js')
    )
  } catch {
    fsEntry = '@modelcontextprotocol/server-filesystem/dist/index.js'
  }
  const workspace = getWorkspaceDir()
  const preset: McpServerConfig = {
    id: 'filesystem',
    name: 'filesystem',
    builtin: true,
    spec: {
      command: process.execPath,
      args: [fsEntry, workspace],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    }
  }
  db.prepare('INSERT OR IGNORE INTO mcp_servers (id, json) VALUES (?, ?)').run(
    'filesystem',
    JSON.stringify(preset)
  )
  const row = db.prepare('SELECT json FROM mcp_servers WHERE id = ?').get('filesystem') as
    | { json: string }
    | undefined
  if (row) {
    const cfg = normalizeMcpConfig(JSON.parse(row.json) as McpServerConfig)
    const args = cfg.spec.args ?? []
    if (args[1] !== workspace) {
      cfg.spec.args = [args[0] ?? fsEntry, workspace]
      db.prepare('UPDATE mcp_servers SET json = ? WHERE id = ?').run(JSON.stringify(cfg), 'filesystem')
    }
  }
}

function migrateCustomSkillsToWorkspace(): void {
  const rows = db.prepare('SELECT id, json FROM skills').all() as { id: string; json: string }[]
  migrateCustomSkillsFromDb(rows, (id) => {
    db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  })
}

/** 老库 file 马 mcpServers 为空时幂等绑定 filesystem */
function migrateFilePony(): void {
  const row = db.prepare('SELECT json FROM ponies WHERE id = ?').get('file') as
    | { json: string }
    | undefined
  if (!row) return
  const file = JSON.parse(row.json) as Pony
  if (file.mcpServers.length > 0) return
  file.mcpServers = ['filesystem']
  file.role = '文件管理员：归档报告、整理办公室工作区内的文件'
  db.prepare('UPDATE ponies SET json = ? WHERE id = ?').run(JSON.stringify(file), 'file')
}

function getPonyRow(id: string): Pony | null {
  const row = db.prepare('SELECT json FROM ponies WHERE id = ?').get(id) as
    | { json: string }
    | undefined
  return row ? (JSON.parse(row.json) as Pony) : null
}

export function listPonies(): Pony[] {
  const rows = db.prepare('SELECT json FROM ponies').all() as { json: string }[]
  const ponies = rows.map((r) => JSON.parse(r.json) as Pony)
  return ponies.sort((a, b) => {
    const ai = PRESET_ORDER.indexOf(a.id)
    const bi = PRESET_ORDER.indexOf(b.id)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.id.localeCompare(b.id)
  })
}

export function savePony(draft: PonyDraft): Pony {
  const name = draft.name.trim()
  const role = draft.role.trim()
  if (name.length < 1 || name.length > 12) throw new Error('小马名字需 1~12 个字符')
  if (role.length < 1 || role.length > 60) throw new Error('职能描述需 1~60 个字符')
  if (!PALETTE_IDS.includes(draft.skin.palette)) throw new Error('无效的调色板')

  const accessories = [...new Set(draft.skin.accessories.filter((a) => ACCESSORY_IDS.includes(a)))]
  const skin = { palette: draft.skin.palette, accessories }
  const skillIds = new Set(listSkills().map((s) => s.id))
  const mcpIds = new Set(listMcpServers().map((m) => m.id))
  const skills = draft.skills.filter((id) => skillIds.has(id))
  const mcpServers = draft.mcpServers.filter((id) => mcpIds.has(id))

  if (draft.id) {
    const existing = getPonyRow(draft.id)
    if (!existing) throw new Error(`不存在 id 为 ${draft.id} 的小马`)
    const pony: Pony = existing.builtin
      ? { ...existing, skin, skills, mcpServers }
      : { ...existing, name, role, skin, skills, mcpServers }
    db.prepare('UPDATE ponies SET json = ? WHERE id = ?').run(JSON.stringify(pony), pony.id)
    return pony
  }

  const { c } = db.prepare('SELECT COUNT(*) AS c FROM ponies').get() as { c: number }
  if (c >= 6) throw new Error('办公室没有空工位了')

  const id = `custom-${randomUUID().slice(0, 8)}`
  const pony: Pony = { id, name, role, builtin: false, skin, skills, mcpServers }
  db.prepare('INSERT INTO ponies (id, json) VALUES (?, ?)').run(id, JSON.stringify(pony))
  return pony
}

export function deletePony(id: string): void {
  const pony = getPonyRow(id)
  if (!pony) throw new Error(`不存在 id 为 ${id} 的小马`)
  if (pony.builtin) throw new Error('预置小马不可删除')
  db.prepare('DELETE FROM ponies WHERE id = ?').run(id)
}

export function listSkills(): Skill[] {
  const builtin = db
    .prepare('SELECT json FROM skills')
    .all()
    .map((r) => JSON.parse((r as { json: string }).json) as Skill)
  const custom = listWorkspaceSkills()
  const merged = [...builtin, ...custom]
  return merged.sort((a, b) => {
    if (a.builtin !== b.builtin) return a.builtin ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

export function saveSkill(input: {
  id?: string
  name: string
  description: string
  markdown: string
}): Skill {
  const name = input.name.trim()
  const description = input.description.trim()
  if (!name) throw new Error('Skill 名称不能为空')

  if (input.id) {
    const row = db.prepare('SELECT json FROM skills WHERE id = ?').get(input.id) as
      | { json: string }
      | undefined
    if (row) {
      const prev = JSON.parse(row.json) as Skill
      if (!prev.builtin) throw new Error('非内置 Skill 应保存在工作区 skills 目录')
      const skill: Skill = {
        ...prev,
        name,
        description,
        markdown: input.markdown,
        updatedAt: Date.now()
      }
      db.prepare('UPDATE skills SET json = ? WHERE id = ?').run(JSON.stringify(skill), skill.id)
      return skill
    }
    return saveWorkspaceSkill({ id: input.id, name, description, markdown: input.markdown })
  }

  return saveWorkspaceSkill({ name, description, markdown: input.markdown })
}

export function deleteSkill(id: string): void {
  const row = db.prepare('SELECT json FROM skills WHERE id = ?').get(id) as
    | { json: string }
    | undefined
  if (row) {
    const skill = JSON.parse(row.json) as Skill
    if (skill.builtin) throw new Error('预置 Skill 不可删除')
    db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  } else {
    deleteWorkspaceSkill(id)
  }
  for (const p of listPonies()) {
    if (p.skills.includes(id)) {
      const updated = { ...p, skills: p.skills.filter((s) => s !== id) }
      db.prepare('UPDATE ponies SET json = ? WHERE id = ?').run(JSON.stringify(updated), p.id)
    }
  }
}

export function listMcpServers(): McpServerConfig[] {
  const rows = db.prepare('SELECT json FROM mcp_servers').all() as { json: string }[]
  const result: McpServerConfig[] = []
  for (const r of rows) {
    try {
      const raw = JSON.parse(r.json) as McpServerConfig
      const cfg = normalizeMcpConfig(raw)
      result.push(cfg)
      if (!raw.spec) {
        db.prepare('UPDATE mcp_servers SET json = ? WHERE id = ?').run(JSON.stringify(cfg), cfg.id)
      }
    } catch (err) {
      console.error('[mcp] 跳过无效配置:', err)
    }
  }
  return result
}

export function getMcpServer(id: string): McpServerConfig | null {
  const row = db.prepare('SELECT json FROM mcp_servers WHERE id = ?').get(id) as
    | { json: string }
    | undefined
  return row ? normalizeMcpConfig(JSON.parse(row.json) as McpServerConfig) : null
}

export function saveMcpServer(input: {
  id?: string
  name?: string
  spec?: import('../../shared/types').McpServerSpec
  json?: string
  /** @deprecated 旧版表单字段，兼容热更新未重启的主进程 */
  command?: string
  args?: string[]
  env?: Record<string, string>
}): McpServerConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('无效的配置参数')
  }

  let name = typeof input.name === 'string' ? input.name.trim() : ''
  let spec = input.spec

  if (typeof input.json === 'string' && input.json.trim()) {
    const parsed = parseStandardMcpJson(input.json)
    name = parsed.name.trim()
    spec = parsed.spec
  } else if (typeof input.command === 'string' && input.command.trim()) {
    spec = {
      command: input.command.trim(),
      args: input.args ?? [],
      env: input.env ?? {}
    }
    if (!name) name = 'mcp-server'
  }

  if (!spec) throw new Error('请提供标准 MCP 配置（json 或 spec）')
  const normalized = normalizeMcpSpec(spec)
  if (!name) throw new Error('MCP server 名称不能为空')

  if (input.id) {
    const existing = getMcpServer(input.id)
    if (!existing) throw new Error(`不存在 id 为 ${input.id} 的 MCP server`)
    if (existing.builtin) throw new Error('内置 MCP server 不可修改连接配置')
    const cfg: McpServerConfig = { ...existing, name, spec: normalized }
    db.prepare('UPDATE mcp_servers SET json = ? WHERE id = ?').run(JSON.stringify(cfg), cfg.id)
    return cfg
  }

  const cfg: McpServerConfig = {
    id: `mcp-${randomUUID().slice(0, 8)}`,
    name,
    spec: normalized,
    builtin: false
  }
  db.prepare('INSERT INTO mcp_servers (id, json) VALUES (?, ?)').run(cfg.id, JSON.stringify(cfg))
  return cfg
}

export function deleteMcpServer(id: string): void {
  const cfg = getMcpServer(id)
  if (!cfg) return
  if (cfg.builtin) throw new Error('预置 MCP server 不可删除')
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  for (const p of listPonies()) {
    if (p.mcpServers.includes(id)) {
      const updated = { ...p, mcpServers: p.mcpServers.filter((m) => m !== id) }
      db.prepare('UPDATE ponies SET json = ? WHERE id = ?').run(JSON.stringify(updated), p.id)
    }
  }
}

export function saveChatMessage(msg: ChatMessage): void {
  db.prepare('INSERT OR REPLACE INTO chat_messages (id, json, created_at) VALUES (?, ?, ?)').run(
    msg.id,
    JSON.stringify(msg),
    msg.createdAt
  )
}

export function listChatMessages(): ChatMessage[] {
  const rows = db
    .prepare('SELECT json FROM chat_messages ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map((r) => JSON.parse(r.json) as ChatMessage)
}

export function clearChatMessages(): void {
  db.exec('DELETE FROM chat_messages')
}

export function saveReport(id: string, title: string, html: string): void {
  db.prepare('INSERT INTO reports (id, title, html, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    title,
    html,
    Date.now()
  )
}

export function getReport(id: string): { html: string; title: string } | null {
  const row = db.prepare('SELECT title, html FROM reports WHERE id = ?').get(id) as
    | { title: string; html: string }
    | undefined
  return row ?? null
}

export function listReports(): ReportMeta[] {
  const rows = db
    .prepare('SELECT id, title, created_at FROM reports ORDER BY created_at DESC')
    .all() as { id: string; title: string; created_at: number }[]
  return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at }))
}

export function deleteReport(id: string): void {
  db.prepare('DELETE FROM reports WHERE id = ?').run(id)
}

export interface RunSaveMeta {
  userQuery: string
  ok: boolean
  durationMs: number
  eventCount: number
  startedAt: number
}

export function saveRun(id: string, eventsJson: string, meta: RunSaveMeta): void {
  db.prepare(
    `INSERT OR REPLACE INTO runs
      (id, events_json, created_at, user_query, ok, duration_ms, event_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    eventsJson,
    meta.startedAt,
    meta.userQuery.slice(0, 500),
    meta.ok ? 1 : 0,
    meta.durationMs,
    meta.eventCount
  )
}

export function listRuns(): RunMeta[] {
  const rows = db
    .prepare(
      `SELECT id, user_query, ok, duration_ms, event_count, created_at
       FROM runs ORDER BY created_at DESC LIMIT 50`
    )
    .all() as {
    id: string
    user_query: string | null
    ok: number | null
    duration_ms: number | null
    event_count: number | null
    created_at: number
  }[]
  return rows.map((r) => {
    const rawQuery = r.user_query ?? '（早期记录）'
    const userQuery = rawQuery.length > 120 ? rawQuery.slice(0, 120) : rawQuery
    return {
      id: r.id,
      userQuery,
      ok: r.ok === 1,
      startedAt: r.created_at,
      durationMs: r.duration_ms ?? 0,
      eventCount: r.event_count ?? 0
    }
  })
}

export function getRunEvents(id: string): AgentEvent[] | null {
  const row = db.prepare('SELECT events_json FROM runs WHERE id = ?').get(id) as
    | { events_json: string }
    | undefined
  if (!row) return null
  try {
    return JSON.parse(row.events_json) as AgentEvent[]
  } catch {
    return null
  }
}

export function dropDataTable(table: string): void {
  if (!table.startsWith('data_')) throw new Error('只能删除 data_ 前缀的数据表')
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name: string } | undefined
  if (!row) throw new Error(`表 ${table} 不存在`)
  const safeTable = row.name.replaceAll('"', '""')
  db.exec(`DROP TABLE "${safeTable}"`)
}

/** —— 数据表（上传的 xlsx，data_ 前缀） —— */

export function recreateDataTable(
  table: string,
  columns: { name: string; type: 'TEXT' | 'REAL' }[],
  rows: unknown[][]
): void {
  const safeTable = table.replaceAll('"', '""')
  const colDefs = columns.map((c) => `"${c.name.replaceAll('"', '""')}" ${c.type}`)
  db.exec(`DROP TABLE IF EXISTS "${safeTable}"`)
  db.exec(`CREATE TABLE "${safeTable}" (${colDefs.join(', ')})`)
  const stmt = db.prepare(`INSERT INTO "${safeTable}" VALUES (${columns.map(() => '?').join(', ')})`)
  db.exec('BEGIN TRANSACTION')
  try {
    for (const r of rows) {
      stmt.run(...r.map((v) => (v == null ? null : typeof v === 'number' ? v : String(v))))
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function listDataTables(): TableSchema[] {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data_%'")
    .all() as { name: string }[]
  return tables.map(({ name }) => {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string }[]
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number }
    const sampleRows = db.prepare(`SELECT * FROM "${name}" LIMIT 5`).all() as Record<string, unknown>[]
    return {
      table: name,
      columns: cols.map((col) => ({ name: col.name, type: col.type || 'TEXT' })),
      rowCount: c,
      sampleRows
    }
  })
}

/** 只读 SQL 执行（守卫在调用方） */
export function runSelect(sql: string): { rows: Record<string, unknown>[]; rowCount: number } {
  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { rows, rowCount: rows.length }
}
