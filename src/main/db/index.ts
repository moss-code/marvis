import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import type { ChatMessage, Pony, ReportMeta, TableSchema } from '../../shared/types'

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
    skills: [],
    mcpServers: []
  },
  {
    id: 'writer',
    name: '文书马',
    role: '文案写手：撰写工作总结、邮件草稿、汇报文案等文字材料',
    builtin: true,
    skin: { palette: 'ochre', accessories: [] },
    skills: [],
    mcpServers: []
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
  `)
  const insert = db.prepare('INSERT OR IGNORE INTO ponies (id, json) VALUES (?, ?)')
  for (const p of PRESET_PONIES) insert.run(p.id, JSON.stringify(p))
}

export function listPonies(): Pony[] {
  const rows = db.prepare('SELECT json FROM ponies').all() as { json: string }[]
  const ponies = rows.map((r) => JSON.parse(r.json) as Pony)
  const order = ['leader', 'data', 'report', 'file', 'writer']
  return ponies.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
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

export function saveRun(id: string, eventsJson: string): void {
  db.prepare('INSERT OR REPLACE INTO runs (id, events_json, created_at) VALUES (?, ?, ?)').run(
    id,
    eventsJson,
    Date.now()
  )
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
