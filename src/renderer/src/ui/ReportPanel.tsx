import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'

function formatReportTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 报告面板：白板上的报告全屏查看，可切换历史报告，支持导出 PDF */
export function ReportPanel(): React.JSX.Element | null {
  const { openReportId, openReport, reports } = useAppStore()
  const [report, setReport] = useState<{ html: string; title: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportedTo, setExportedTo] = useState<string | null>(null)

  const currentIndex = openReportId ? reports.findIndex((r) => r.id === openReportId) : -1
  const hasNewer = currentIndex > 0
  const hasOlder = currentIndex >= 0 && currentIndex < reports.length - 1

  useEffect(() => {
    setReport(null)
    setExportedTo(null)
    if (openReportId) {
      void window.api.getReport(openReportId).then(setReport)
    }
  }, [openReportId])

  if (!openReportId) return null

  const exportPdf = async (): Promise<void> => {
    setExporting(true)
    try {
      const res = await window.api.exportPdf(openReportId)
      if (res) setExportedTo(res.savedPath)
    } finally {
      setExporting(false)
    }
  }

  const switchReport = (id: string): void => {
    if (id && id !== openReportId) openReport(id)
  }

  return (
    <div className="report-overlay" onClick={() => openReport(null)}>
      <div className="report-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="report-header">
          <span className="serif report-title">{report?.title ?? '加载报告…'}</span>
          <div className="report-actions">
            {exportedTo && <span className="export-hint">已保存：{exportedTo}</span>}
            <button className="btn btn-ghost" onClick={() => void exportPdf()} disabled={exporting || !report}>
              {exporting ? '导出中…' : '导出 PDF'}
            </button>
            <button className="btn btn-primary" onClick={() => openReport(null)}>
              关闭
            </button>
          </div>
        </div>
        {reports.length > 1 && (
          <div className="report-picker">
            <button
              className="btn btn-ghost report-nav"
              disabled={!hasOlder}
              title="上一份（更早）"
              onClick={() => hasOlder && switchReport(reports[currentIndex + 1].id)}
            >
              ‹ 上一份
            </button>
            <select
              className="report-select"
              value={openReportId}
              onChange={(e) => switchReport(e.target.value)}
            >
              {reports.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {i === 0 ? '最新 · ' : ''}
                  {r.title}（{formatReportTime(r.createdAt)}）
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost report-nav"
              disabled={!hasNewer}
              title="下一份（更新）"
              onClick={() => hasNewer && switchReport(reports[currentIndex - 1].id)}
            >
              下一份 ›
            </button>
          </div>
        )}
        {report ? (
          <iframe className="report-frame" sandbox="allow-scripts" srcDoc={report.html} title={report.title} />
        ) : (
          <div className="report-loading">报告加载中…</div>
        )}
      </div>
    </div>
  )
}
