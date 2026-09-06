import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders assistant message text as formatted Markdown.
 * Supports GitHub-flavored Markdown (tables, strikethrough, task lists).
 *
 * Styling is scoped here via custom component renderers so the output
 * matches FinSync's indigo/gray palette and stays readable inside a
 * chat bubble. Partial/streaming Markdown renders safely — react-markdown
 * tolerates incomplete syntax (e.g. a half-written table) without crashing.
 */
function MessageContent({ content }) {
  return (
    <div className="fs-markdown text-sm leading-relaxed text-gray-800 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings — scaled down to fit inside a chat bubble
          h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold text-gray-900 mt-3 mb-1.5 first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-800 mt-3 mb-1.5 first:mt-0">{children}</h4>,

          // Paragraphs & inline
          p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em:     ({ children }) => <em className="italic">{children}</em>,
          a:      ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline">
              {children}
            </a>
          ),

          // Lists
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,

          // Tables — bordered, striped header, horizontally scrollable on mobile
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-gray-200">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => (
            <th className="text-left font-semibold text-gray-700 px-3 py-2 border-b border-gray-200 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-gray-100 text-gray-700 align-top">
              {children}
            </td>
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-200 pl-3 italic text-gray-600 my-2">
              {children}
            </blockquote>
          ),

          // Code — inline vs block
          code: ({ inline, children }) =>
            inline ? (
              <code className="bg-gray-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
            ) : (
              <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2">
                {children}
              </code>
            ),
          pre: ({ children }) => <pre className="my-2">{children}</pre>,

          // Horizontal rule
          hr: () => <hr className="border-gray-200 my-3" />,
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MessageContent);
