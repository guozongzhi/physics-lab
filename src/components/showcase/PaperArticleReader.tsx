import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Download, BookOpen, Hash } from 'lucide-react';

export default function PaperArticleReader({
  markdown,
  title,
  author,
}: {
  markdown: string;
  title: string;
  author?: string;
}) {
  const headings = useMemo(() => {
    return markdown
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^#{1,3}\s+/.test(line))
      .map((line) => {
        const match = line.match(/^(#{1,3})\s+(.*)$/);
        return {
          level: match ? match[1].length : 1,
          text: match ? match[2].replace(/[#*`]/g, '').trim() : line,
        };
      });
  }, [markdown]);

  const charCount = useMemo(() => markdown.replace(/\s+/g, '').length, [markdown]);

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title || '研究论文').replace(/[^\w\u4e00-\u9fa5-]/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 text-slate-100 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-indigo-400 shrink-0" />
          <span className="font-semibold truncate">{title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
            学术论文阅览器
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {author && <span className="text-slate-300">作者：{author}</span>}
          <span className="text-slate-400 tabular-nums">{charCount} 字</span>
          <button
            type="button"
            onClick={handleDownloadMd}
            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1 transition"
          >
            <Download size={12} />
            导出论文 (.md)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 max-h-[60vh] overflow-y-auto">
        {headings.length > 0 && (
          <aside className="md:col-span-3 border-b md:border-b-0 md:border-r border-slate-200/80 bg-slate-100/70 p-4">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1">
              <BookOpen size={12} />
              论文章节大纲
            </div>
            <ul className="space-y-1.5 text-xs">
              {headings.map((h, idx) => (
                <li
                  key={idx}
                  style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
                  className="text-slate-700 font-medium truncate flex items-center gap-1"
                >
                  <Hash size={10} className="text-indigo-500 shrink-0" />
                  <span className="truncate">{h.text}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <article
          className={`${
            headings.length > 0 ? 'md:col-span-9' : 'md:col-span-12'
          } p-6 md:p-8 bg-white text-slate-800 text-sm leading-relaxed space-y-3`}
        >
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-xl font-extrabold text-slate-900 pb-2 border-b border-slate-200 mb-3">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-bold text-slate-900 mt-5 mb-2 flex items-center gap-1.5">
                  <span className="w-1 h-4 rounded-full bg-indigo-600 inline-block" />
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-bold text-slate-800 mt-3 mb-1">{children}</h3>
              ),
              p: ({ children }) => <p className="text-slate-700 leading-7 mb-2.5">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-3 text-slate-700">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-3 text-slate-700">{children}</ol>,
              code: ({ children }) => (
                <code className="px-1.5 py-0.5 rounded bg-slate-100 text-indigo-700 font-mono text-xs">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto my-3">
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="pl-3.5 border-l-3 border-indigo-400 bg-indigo-50/50 py-1.5 pr-3 rounded-r-lg text-slate-600 italic my-2">
                  {children}
                </blockquote>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
