import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TableSchema } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  tables: TableSchema[]
  activeTableNames: string[]
  onConfirm: (names: string[]) => void
}

export function DataPicker({
  open,
  onClose,
  tables,
  activeTableNames,
  onConfirm
}: Props): React.JSX.Element | null {
  const [selected, setSelected] = useState<string[]>(activeTableNames)

  useEffect(() => {
    if (open) setSelected(activeTableNames)
  }, [open, activeTableNames])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const toggle = (table: string): void => {
    setSelected((prev) =>
      prev.includes(table) ? prev.filter((t) => t !== table) : [...prev, table]
    )
  }

  const selectAll = (): void => {
    setSelected(tables.map((t) => t.table))
  }

  const selectNone = (): void => {
    setSelected([])
  }

  return createPortal(
    <div className="modal-overlay modal-overlay--portal" onClick={onClose}>
      <div
        className="modal panel data-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="data-picker-title" className="modal-title serif">
            选择数据资源
          </h2>
          <button type="button" className="btn btn-ghost btn-sm modal-close" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="modal-body data-picker-body">
          <p className="form-hint data-picker-hint">
            勾选后作为本轮分析的数据上下文；未勾选的表仍保留在库中，可在设置里管理。
          </p>
          {tables.length === 0 ? (
            <p className="form-hint">暂无数据表，请先上传文件。</p>
          ) : (
            <>
              <div className="data-picker-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>
                  全选
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={selectNone}>
                  全不选
                </button>
                <span className="data-picker-count">
                  已选 {selected.length} / {tables.length}
                </span>
              </div>
              <ul className="data-picker-list">
                {tables.map((t) => (
                  <li key={t.table}>
                    <label className="data-picker-item">
                      <input
                        type="checkbox"
                        checked={selected.includes(t.table)}
                        onChange={() => toggle(t.table)}
                      />
                      <span className="data-picker-label">
                        <span className="data-picker-name">{t.table.replace(/^data_/, '')}</span>
                        <span className="data-picker-meta">
                          {t.rowCount} 行 · {t.columns.length} 列
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={tables.length === 0}
            onClick={() => {
              onConfirm(selected)
              onClose()
            }}
          >
            确定
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
