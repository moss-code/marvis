import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { OfficeScene } from '@/scene/OfficeScene'
import { getMockReportPreview } from '@/mock/mockReportPreview'

const PREVIEW_DOC_WIDTH = 920

interface PreviewRect {
  x: number
  y: number
  width: number
  height: number
}

/** 报告白板 HTML 预览：叠在 Pixi 白板内容区，随场景布局同步位置 */
export function WhiteboardPreview({ scene }: { scene: OfficeScene | null }): React.JSX.Element | null {
  const reports = useAppStore((s) => s.reports)
  const reportId = reports[0]?.id ?? null
  const [report, setReport] = useState<{ html: string; title: string } | null>(null)
  const [rect, setRect] = useState<PreviewRect | null>(null)

  useEffect(() => {
    if (!reportId) {
      setReport(null)
      return
    }
    const mock = getMockReportPreview(reportId)
    if (mock) {
      setReport(mock)
      return
    }
    void window.api.getReport(reportId).then((r) => setReport(r ?? null))
  }, [reportId])

  useEffect(() => {
    if (!scene) return
    const update = (): void => setRect(scene.getWhiteboardPreviewRect())
    const offLayout = scene.addLayoutListener(update)
    update()
    window.addEventListener('resize', update)
    return () => {
      offLayout()
      window.removeEventListener('resize', update)
    }
  }, [scene])

  if (!report || !rect || rect.width < 8 || rect.height < 8) return null

  const scale = rect.width / PREVIEW_DOC_WIDTH
  const docHeight = Math.max(rect.height / scale, 240)

  return (
    <div
      className="whiteboard-preview-wrap"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height
      }}
      aria-hidden
    >
      <iframe
        className="whiteboard-preview"
        title={report.title}
        sandbox="allow-scripts"
        srcDoc={report.html}
        style={{
          width: PREVIEW_DOC_WIDTH,
          height: docHeight,
          transform: `scale(${scale})`
        }}
      />
    </div>
  )
}
