import * as XLSX from 'xlsx'
import { listDataTables, recreateDataTable } from './index'
import type { TableSchema } from '../../shared/types'

/** 解析 xlsx，每个 sheet 灌入一张 data_ 前缀表（保留中文表头原名，SQL 中需用双引号） */
export function importXlsx(filePath: string): TableSchema[] {
  const wb = XLSX.readFile(filePath)
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
    if (aoa.length < 2) continue
    const header = aoa[0].map((h, i) => (h == null || h === '' ? `列${i + 1}` : String(h).trim()))
    const rows = aoa
      .slice(1)
      .filter((r) => r.some((v) => v != null && v !== ''))
      .map((r) => header.map((_, i) => r[i] ?? null))
    const columns = header.map((name, i) => ({
      name,
      type: rows.every((r) => r[i] == null || typeof r[i] === 'number') ? ('REAL' as const) : ('TEXT' as const)
    }))
    recreateDataTable(`data_${sanitize(sheetName)}`, columns, rows)
  }
  return listDataTables()
}

function sanitize(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_]/gu, '_')
}
