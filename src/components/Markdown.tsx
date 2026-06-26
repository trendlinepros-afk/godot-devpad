import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Shared markdown renderer with GitHub-flavoured markdown and syntax-highlighted
// code blocks. Used by both the chat bubbles and the note preview.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { children, className, ...rest } = props
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = className?.includes('language-')
            return isBlock && match ? (
              <SyntaxHighlighter
                style={oneDark as Record<string, React.CSSProperties>}
                language={match[1]}
                PreTag="div"
                customStyle={{ fontSize: '0.8rem', margin: 0 }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...rest}>
                {children}
              </code>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
