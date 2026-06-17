import { app, BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getReport } from './db'
import { normalizeReportBody, repairStoredReportHtml } from './reportSanitize'

let echartsJs: string | null = null

function getEchartsRuntime(): string {
  if (echartsJs == null) {
    echartsJs = readFileSync(
      join(app.getAppPath(), 'node_modules/echarts/dist/echarts.min.js'),
      'utf-8'
    )
  }
  return echartsJs
}

/** 自检用：ECharts runtime 体积 */
export function getEchartsRuntimeSize(): number {
  return getEchartsRuntime().length
}

/** 把模型产出的报告正文包装成完整 HTML 文档：暖色主题 + 内联 ECharts runtime */
export function buildReportHtml(title: string, body: string): string {
  const content = normalizeReportBody(body)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 36px 44px;
    background: #F4EEE3;
    color: #4A4036;
    font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
    line-height: 1.7;
  }
  h1 { font-family: Georgia, 'Songti SC', serif; font-size: 26px; color: #3E3428;
       border-bottom: 2px solid #B5835A; padding-bottom: 12px; }
  h2 { font-family: Georgia, 'Songti SC', serif; font-size: 19px; color: #5A4C3D; margin-top: 28px; }
  .kpi-row { display: flex; gap: 16px; flex-wrap: wrap; margin: 20px 0; }
  .kpi { flex: 1; min-width: 140px; background: #FBF7EF; border: 1px solid #D9CBB5;
         border-radius: 12px; padding: 14px 18px; box-shadow: 0 2px 8px rgba(90,76,61,.08); }
  .kpi b, .kpi strong { display: block; font-size: 22px; color: #B5835A; }
  .chart { background: #FBF7EF; border: 1px solid #D9CBB5; border-radius: 12px;
           padding: 8px; margin: 16px 0; box-shadow: 0 2px 8px rgba(90,76,61,.08); }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; background: #FBF7EF; }
  th, td { border: 1px solid #D9CBB5; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #EBDFC9; }
  ul { padding-left: 22px; }
</style>
<script>${getEchartsRuntime()}</script>
</head>
<body>
${content}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isCompleteReportDocument(html: string): boolean {
  return /<!DOCTYPE\s+html/i.test(html) || /<html[\s>]/i.test(html)
}

/** 已入库的完整 HTML：只修复 body 内脚本，避免重复注入 ECharts runtime */
function sanitizeStoredReportHtml(html: string): string {
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/i)
  if (!bodyMatch) return html
  const repairedBody = normalizeReportBody(bodyMatch[1])
  return html.replace(/<body>[\s\S]*<\/body>/i, `<body>\n${repairedBody}\n</body>`)
}

/** 读取报告并在展示前修复旧版 JS 笔误 */
export function loadReportForView(id: string): { html: string; title: string } | null {
  const report = getReport(id)
  if (!report) return null
  if (isCompleteReportDocument(report.html)) {
    return { title: report.title, html: sanitizeStoredReportHtml(report.html) }
  }
  const body = repairStoredReportHtml(report.title, report.html)
  return { title: report.title, html: buildReportHtml(report.title, body) }
}

/** 隐藏窗口加载报告 → printToPDF → 保存对话框 */
export async function exportReportPdf(reportId: string): Promise<{ savedPath: string } | null> {
  const report = loadReportForView(reportId)
  if (!report) throw new Error('报告不存在')

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出报告 PDF',
    defaultPath: join(app.getPath('downloads'), `${report.title || '报告'}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return null

  const tmpFile = join(mkdtempSync(join(tmpdir(), 'pony-report-')), 'report.html')
  writeFileSync(tmpFile, report.html, 'utf-8')

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await win.loadFile(tmpFile)
    // 等 ECharts 完成首帧渲染
    await new Promise((r) => setTimeout(r, 900))
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    writeFileSync(filePath, pdf)
    return { savedPath: filePath }
  } finally {
    win.destroy()
  }
}
