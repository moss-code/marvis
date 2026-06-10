import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  children: string
  className?: string
}

/** 将领队马等输出的 Markdown 渲染为可读格式 */
export function MarkdownBody({ children, className = '' }: Props): React.JSX.Element {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
