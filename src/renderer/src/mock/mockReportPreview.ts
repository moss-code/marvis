/** 动画演示用：mock 报告未入库时的白板预览 HTML */
const MOCK_REPORT_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<style>
  body { margin: 0; padding: 14px 16px; font-family: "Microsoft YaHei", sans-serif; font-size: 13px; color: #4a4036; background: #f4eee3; line-height: 1.55; }
  h2 { margin: 0 0 10px; font-size: 15px; color: #96714a; }
  ul { margin: 0; padding-left: 1.2em; }
  li { margin: 4px 0; }
  .tag { display: inline-block; margin-top: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: rgba(138,155,110,.18); color: #687650; }
</style></head><body>
<h2>营业厅业务表现分析（演示）</h2>
<ul>
  <li>城东厅：宽带新装量领先，投诉率稳定</li>
  <li>城西厅：投诉率连续 3 月上升，需重点关注</li>
  <li>套餐办理量整体环比 +6.2%</li>
</ul>
<span class="tag">演示报告</span>
</body></html>`

export function getMockReportPreview(
  reportId: string
): { title: string; html: string } | null {
  if (reportId !== 'mock-report') return null
  return { title: '营业厅业务表现分析（演示）', html: MOCK_REPORT_HTML }
}
