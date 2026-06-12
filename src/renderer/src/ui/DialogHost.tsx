import { createPortal } from 'react-dom'
import { useDialogStore } from '@/store/dialogStore'

export function DialogHost(): React.JSX.Element | null {
  const current = useDialogStore((s) => s.current)
  const dismiss = useDialogStore((s) => s.dismiss)

  if (!current) return null

  const isConfirm = current.kind === 'confirm'
  const title = current.title ?? (isConfirm ? '请确认' : '提示')

  return createPortal(
    <div
      className="modal-overlay modal-overlay--portal dialog-host-overlay"
      onClick={() => dismiss(false)}
    >
      <div
        className="modal panel dialog-box"
        role={isConfirm ? 'alertdialog' : 'alert'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header dialog-header">
          <h3 id="app-dialog-title" className="serif modal-title">
            {title}
          </h3>
        </header>
        <div className="modal-body dialog-body">
          <p className="dialog-message">{current.message}</p>
        </div>
        <footer className="modal-footer">
          {isConfirm && (
            <button type="button" className="btn btn-ghost" onClick={() => dismiss(false)}>
              {current.cancelLabel ?? '取消'}
            </button>
          )}
          <button
            type="button"
            className={
              isConfirm && current.danger ? 'btn btn-ghost btn-danger' : 'btn btn-primary'
            }
            onClick={() => dismiss(isConfirm ? true : undefined)}
          >
            {isConfirm ? (current.confirmLabel ?? '确定') : '确定'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
