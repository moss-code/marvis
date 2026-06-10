// 生成预制电信演示数据：assets/demo/电信业务数据.xlsx
import * as XLSX from 'xlsx'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const HALLS = [
  { name: '城东营业厅', base: 1.35, trend: 0.012, complaint: 0.8 },
  { name: '城西营业厅', base: 1.0, trend: -0.018, complaint: 1.9 }, // 持续走弱、投诉走高
  { name: '城南营业厅', base: 1.1, trend: 0.004, complaint: 1.0 },
  { name: '城北营业厅', base: 0.85, trend: 0.02, complaint: 0.7 }, // 快速增长
  { name: '高新区营业厅', base: 1.2, trend: 0.015, complaint: 0.6 },
  { name: '老城口营业厅', base: 0.7, trend: -0.006, complaint: 1.4 }
]

let seed = 42
function rand() {
  seed = (seed * 9301 + 49297) % 233280
  return seed / 233280
}

const rows = []
for (let m = 1; m <= 12; m++) {
  const season = 1 + 0.15 * Math.sin(((m - 2) / 12) * Math.PI * 2) // 春秋开学季略高
  for (const hall of HALLS) {
    const drift = 1 + hall.trend * (m - 1) * 4
    const broadband = Math.round(320 * hall.base * drift * season * (0.92 + rand() * 0.16))
    const plans = Math.round(560 * hall.base * drift * season * (0.9 + rand() * 0.2))
    const newUsers = Math.round(210 * hall.base * drift * (0.88 + rand() * 0.24))
    const complaints = Math.round((broadband + plans) * (hall.complaint / 100) * (0.8 + rand() * 0.5))
    rows.push({
      营业厅: hall.name,
      月份: `2025-${String(m).padStart(2, '0')}`,
      '宽带新装(户)': broadband,
      '套餐办理(笔)': plans,
      '新增用户(户)': newUsers,
      '投诉(件)': complaints,
      '投诉率(%)': Number(((complaints / (broadband + plans)) * 100).toFixed(2))
    })
  }
}

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '营业厅业务月报')

const outDir = join(root, 'assets', 'demo')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, '电信业务数据.xlsx')
XLSX.writeFile(wb, outFile)
console.log(`已生成 ${outFile}（${rows.length} 行）`)
