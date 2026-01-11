import AuthGuard from '@/app/components/AuthGuard';
import Navigation from '@/app/components/Navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { promises as fs } from 'fs';
import path from 'path';

function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (props) => <h1 className="text-3xl font-bold text-gray-900 mb-4" {...props} />,
        h2: (props) => <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-3" {...props} />,
        h3: (props) => <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-2" {...props} />,
        p: (props) => <p className="text-gray-700 leading-7 mb-3" {...props} />,
        ul: (props) => <ul className="list-disc pl-6 text-gray-700 mb-3 space-y-1" {...props} />,
        ol: (props) => <ol className="list-decimal pl-6 text-gray-700 mb-3 space-y-1" {...props} />,
        li: (props) => <li className="leading-7" {...props} />,
        a: (props) => <a className="text-blue-600 hover:text-blue-800 underline" {...props} />,
        hr: (props) => <hr className="my-6 border-gray-200" {...props} />,
        code: ({ className, children, ...props }) => {
          const isBlock = Boolean(className);
          if (isBlock) {
            return (
              <code className={`text-sm ${className || ''}`} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-800 text-sm" {...props}>
              {children}
            </code>
          );
        },
        pre: (props) => (
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm mb-4" {...props} />
        ),
        blockquote: (props) => (
          <blockquote className="border-l-4 border-gray-300 pl-4 text-gray-700 italic my-4" {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default async function HelpPage() {
  const mdPath = path.join(process.cwd(), 'app', 'help', 'help.md');
  const content = await fs.readFile(mdPath, 'utf8');

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="p-4 md:p-8">
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
            <Markdown content={content} />
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

