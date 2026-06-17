import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { getMockReportPreview } from '@/mock/mockReportPreview'
import { getCachedReport, setCachedReport } from '@/reportCache'

/** 右侧报告白板：展示最新报告预览，可展开全屏 */
export function ReportDock(): React.JSX.Element {
  const reports = useAppStore((s) => s.reports)
  const openReport = useAppStore((s) => s.openReport)
  const reportId = reports[0]?.id ?? null
  const [report, setReport] = useState<{ html: string; title: string } | null>(() =>
    reportId ? getCachedReport(reportId) : null
  )

  useEffect(() => {
    if (!reportId) {
      setReport(null)
      return
    }
    const cached = getCachedReport(reportId)
    if (cached) {
      setReport(cached)
    }
    const mock = getMockReportPreview(reportId)
    if (mock) {
      setCachedReport(reportId, mock)
      setReport(mock)
      return
    }
    let cancelled = false
    void window.api.getReport(reportId).then((r) => {
      if (cancelled) return
      if (r) {
        setCachedReport(reportId, r)
        setReport(r)
      } else if (!cached) {
        setReport(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [reportId])

  return (
    <section className="workspace-dock report-dock panel">
      <header className="workspace-dock-head">
        <h3 className="serif">报告白板</h3>
        {report && reportId && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openReport(reportId)}>
            全屏查看
          </button>
        )}
      </header>
      <div className="workspace-dock-body report-dock-body">
        {!report ? (
          <p className="report-dock-empty">报告生成后会出现在这里</p>
        ) : (
          <iframe
            className="report-dock-frame"
            sandbox="allow-scripts"
            srcDoc={report.html}
            title={report.title}
          />
        )}
      </div>
    </section>
  )
}
