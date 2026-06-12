import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title?: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  children: React.ReactNode
  extraActions?: React.ReactNode
}

export function ConfirmModal({
  open,
  title = '请确认',
  onCancel,
  onConfirm,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  busy = false,
  children,
  extraActions
}: Props): React.JSX.Element | null {
  if (!open) return null

  return createPortal(
    <div
      className="modal-overlay modal-overlay--portal dialog-host-overlay"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="modal panel dialog-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header dialog-header">
          <h3 id="confirm-modal-title" className="serif modal-title">
            {title}
          </h3>
        </header>
        <div className="modal-body dialog-body">{children}</div>
        <footer className="modal-footer">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          {extraActions}
          <button
            type="button"
            className={danger ? 'btn btn-ghost btn-danger' : 'btn btn-primary'}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
