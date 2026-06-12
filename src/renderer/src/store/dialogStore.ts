import { create } from 'zustand'

export type DialogRequest =
  | {
      id: string
      kind: 'alert'
      title?: string
      message: string
      resolve: () => void
    }
  | {
      id: string
      kind: 'confirm'
      title?: string
      message: string
      confirmLabel?: string
      cancelLabel?: string
      danger?: boolean
      resolve: (ok: boolean) => void
    }

interface DialogOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface DialogState {
  current: DialogRequest | null
  showAlert: (message: string, options?: Pick<DialogOptions, 'title'>) => Promise<void>
  showConfirm: (message: string, options?: DialogOptions) => Promise<boolean>
  dismiss: (confirmed?: boolean) => void
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,

  showAlert: (message, options) =>
    new Promise<void>((resolve) => {
      set({
        current: {
          id: crypto.randomUUID(),
          kind: 'alert',
          title: options?.title,
          message,
          resolve
        }
      })
    }),

  showConfirm: (message, options) =>
    new Promise<boolean>((resolve) => {
      set({
        current: {
          id: crypto.randomUUID(),
          kind: 'confirm',
          title: options?.title,
          message,
          confirmLabel: options?.confirmLabel,
          cancelLabel: options?.cancelLabel,
          danger: options?.danger,
          resolve
        }
      })
    }),

  dismiss: (confirmed) => {
    const { current } = get()
    if (!current) return
    if (current.kind === 'alert') current.resolve()
    else current.resolve(confirmed ?? false)
    set({ current: null })
  }
}))

export function showAppAlert(
  message: string,
  options?: Pick<DialogOptions, 'title'>
): Promise<void> {
  return useDialogStore.getState().showAlert(message, options)
}

export function showAppConfirm(message: string, options?: DialogOptions): Promise<boolean> {
  return useDialogStore.getState().showConfirm(message, options)
}
