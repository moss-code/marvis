// 生成预制电信演示数据：assets/demo/电信业务数据.xlsx（3 张表，内置故事线）
import * as XLSX from 'xlsx'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 8 个营业厅，6 个月；城东厅高增长、老城厅持续下滑 */
const HALLS = [
  { name: '城东厅', base: 1.4, trend: 0.022, churn: 0.06, installComplaint: 0.4 },
  { name: '城西厅', base: 1.05, trend: -0.008, churn: 0.09, installComplaint: 1.0 },
  { name: '城南厅', base: 1.1, trend: 0.005, churn: 0.08, installComplaint: 0.9 },
  { name: '城北厅', base: 0.9, trend: 0.018, churn: 0.07, installComplaint: 0.7 },
  { name: '高新区厅', base: 1.25, trend: 0.014, churn: 0.065, installComplaint: 0.55 },
  { name: '老城厅', base: 0.65, trend: -0.028, churn: 0.14, installComplaint: 2.8 },
  { name: '滨江厅', base: 1.0, trend: 0.003, churn: 0.085, installComplaint: 0.95 },
  { name: '中心厅', base: 1.15, trend: 0.006, churn: 0.075, installComplaint: 0.85 }
]

const MONTHS = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12']
const COMPLAINT_TYPES = ['装维服务', '网络质量', '资费争议', '业务办理', '其他']

let seed = 42
function rand() {
  seed = (seed * 9301 + 49297) % 233280
  return seed / 233280
}

function monthDrift(hall, monthIdx) {
  let drift = 1 + hall.trend * monthIdx * 3
  if (hall.name === '城东厅' && monthIdx >= 3) drift *= 1 + 0.04 * (monthIdx - 2)
  if (hall.name === '老城厅') drift *= 1 - 0.025 * monthIdx
  return drift
}

const businessRows = []
const growthRows = []
const complaintRows = []

for (let mi = 0; mi < MONTHS.length; mi++) {
  const month = MONTHS[mi]
  const season = 1 + 0.12 * Math.sin(((mi + 1) / 6) * Math.PI * 2)
  for (const hall of HALLS) {
    const drift = monthDrift(hall, mi)
    const broadband = Math.round(280 * hall.base * drift * season * (0.9 + rand() * 0.2))
    const plans = Math.round(480 * hall.base * drift * season * (0.88 + rand() * 0.24))
    const upgrade5g = Math.round(broadband * (0.35 + rand() * 0.15))
    const newUsers = Math.round(190 * hall.base * drift * (0.85 + rand() * 0.3))
    const churnRate = hall.churn * (hall.name === '老城厅' ? 1 + mi * 0.08 : 1) * (0.9 + rand() * 0.2)
    const churnUsers = Math.round(newUsers * churnRate * (0.85 + rand() * 0.3))
    const netGrowth = newUsers - churnUsers

    businessRows.push({
      营业厅: hall.name,
      月份: month,
      宽带新装: broadband,
      套餐办理: plans,
      '5G升级': upgrade5g
    })

    growthRows.push({
      营业厅: hall.name,
      月份: month,
      新增用户: newUsers,
      流失用户: churnUsers,
      净增: netGrowth
    })

    for (const cat of COMPLAINT_TYPES) {
      const weight =
        cat === '装维服务'
          ? hall.installComplaint
          : cat === '网络质量'
            ? hall.name === '老城厅'
              ? 1.6
              : 0.9
            : 0.5
      const baseVol = Math.round((broadband + plans) * 0.012 * weight * (0.75 + rand() * 0.5))
      if (baseVol < 1 && cat !== '装维服务') continue
      const volume = Math.max(1, baseVol)
      const handleHours = Number((2 + weight * 1.2 + rand() * 3).toFixed(1))
      complaintRows.push({
        营业厅: hall.name,
        月份: month,
        投诉类别: cat,
        投诉量: volume,
        处理时长: handleHours
      })
    }
  }
}

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(businessRows), '营业厅业务月报')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(growthRows), '用户增长')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(complaintRows), '投诉明细')

const outDir = join(root, 'assets', 'demo')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, '电信业务数据.xlsx')
XLSX.writeFile(wb, outFile)
console.log(
  `已生成 ${outFile}（业务 ${businessRows.length} 行，增长 ${growthRows.length} 行，投诉 ${complaintRows.length} 行）`
)
