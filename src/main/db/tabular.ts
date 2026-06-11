import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import * as XLSX from 'xlsx'
import { listDataTables, recreateDataTable } from './index'
import type { TableSchema } from '../../shared/types'

const MAX_FILE_BYTES = 50 * 1024 * 1024
const DELIMITER_CANDIDATES = ['\t', ',', ';', '|'] as const

/** 统一表格数据导入：xlsx / xls / csv / txt → SQLite data_ 表 */
export function importTabular(filePath: string): TableSchema[] {
  assertFileSize(filePath)
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.xlsx':
    case '.xls':
      importWorkbook(filePath)
      break
    case '.csv':
      importDelimitedText(filePath, ',')
      break
    case '.txt':
      importDelimitedText(filePath, sniffDelimiter(readFileWithEncoding(filePath)))
      break
    default:
      throw new Error('不支持的文件类型，请上传 xlsx / xls / csv / txt')
  }
  return listDataTables()
}

/** @deprecated 兼容旧引用，内部走 importTabular */
export function importXlsx(filePath: string): TableSchema[] {
  return importTabular(filePath)
}

function assertFileSize(filePath: string): void {
  const { size } = statSync(filePath)
  if (size > MAX_FILE_BYTES) {
    throw new Error('文件过大（>50MB），请拆分后上传')
  }
}

function importWorkbook(filePath: string): void {
  const wb = XLSX.readFile(filePath)
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
    if (aoa.length < 2) continue
    aoaToTable(`data_${sanitize(sheetName)}`, aoa)
  }
}

function importDelimitedText(filePath: string, fs: string): void {
  const text = readFileWithEncoding(filePath)
  const wb = XLSX.read(text, { type: 'string', FS: fs })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('文件为空或缺少数据行')
  const ws = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true }) as unknown[][]
  const stem = basename(filePath, extname(filePath))
  aoaToTable(`data_${sanitize(stem)}`, aoa)
}

function aoaToTable(tableName: string, aoa: unknown[][]): void {
  if (aoa.length < 2) throw new Error('文件为空或缺少数据行')
  const header = aoa[0].map((h, i) => (h == null || h === '' ? `列${i + 1}` : String(h).trim()))
  const rows = aoa
    .slice(1)
    .filter((r) => r.some((v) => v != null && v !== ''))
    .map((r) => header.map((_, i) => normalizeCell(r[i])))
  const columns = header.map((name, i) => ({
    name,
    type: rows.every((r) => r[i] == null || typeof r[i] === 'number') ? ('REAL' as const) : ('TEXT' as const)
  }))
  recreateDataTable(tableName, columns, rows)
}

function normalizeCell(value: unknown): unknown {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const s = String(value).trim()
  if (s === '') return null
  const n = Number(s)
  if (s !== '' && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(s)) return n
  return s
}

function sanitize(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_]/gu, '_')
}

function readFileWithEncoding(filePath: string): string {
  const buf = readFileSync(filePath)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3))
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le')
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.alloc(buf.length - 2)
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]
      swapped[i - 1] = buf[i]
    }
    return swapped.toString('utf16le')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buf)
    } catch {
      throw new Error('文件编码无法识别，请另存为 UTF-8 后重试')
    }
  }
}

function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 20)
  if (lines.length === 0) {
    throw new Error('该 txt 文件不像表格数据，请检查是否含明确的分隔符')
  }

  let best: { delim: string; variance: number; median: number } | null = null
  for (const delim of DELIMITER_CANDIDATES) {
    const counts = lines.map((line) => splitLine(line, delim).length)
    const median = medianOf(counts)
    if (median <= 1) continue
    const variance = varianceOf(counts)
    if (!best || variance < best.variance || (variance === best.variance && median > best.median)) {
      best = { delim, variance, median }
    }
  }

  if (!best) {
    throw new Error('该 txt 文件不像表格数据，请检查是否含明确的分隔符')
  }
  return best.delim
}

function splitLine(line: string, delim: string): string[] {
  return line.split(delim)
}

function medianOf(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function varianceOf(nums: number[]): number {
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  return nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length
}
