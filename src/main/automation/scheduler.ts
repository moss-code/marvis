let tickTimer: NodeJS.Timeout | null = null

export function startAutomationScheduler(onTick: () => void): void {
  stopAutomationScheduler()
  const run = (): void => {
    try {
      onTick()
    } catch {
      /* scheduler tick errors logged in executor */
    }
    tickTimer = setTimeout(run, 60_000)
  }
  tickTimer = setTimeout(run, 5_000)
}

export function stopAutomationScheduler(): void {
  if (tickTimer) {
    clearTimeout(tickTimer)
    tickTimer = null
  }
}
