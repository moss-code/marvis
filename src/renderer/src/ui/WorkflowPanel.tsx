import { useAppStore } from '@/store/appStore'
import { WorkflowView } from '@/ui/WorkflowView'

export function WorkflowPanel(): React.JSX.Element {
  const events = useAppStore((s) => (s.replaying ? s.replayEvents : s.events))

  return <WorkflowView events={events} variant="overlay" />
}
