import { useState } from 'react';
import { RotateCcw, Code2, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Untrusted student HTML runs in an opaque origin, without application credentials. */
export default function HtmlDemo({ html, title }: { html: string; title: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-blue-200 bg-slate-900/95 overflow-hidden',
        fullscreen && 'fixed inset-4 z-[260] shadow-2xl'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-slate-800/90 border-b border-slate-700/80 text-xs text-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="font-semibold truncate">{title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
            隔离沙箱
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="px-2 py-1 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-100 inline-flex items-center gap-1 transition"
            title="重置仿真运行状态"
          >
            <RotateCcw size={12} />
            重置运行
          </button>
          <button
            type="button"
            onClick={() => setShowSource((s) => !s)}
            className="px-2 py-1 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-100 inline-flex items-center gap-1 transition"
          >
            <Code2 size={12} />
            {showSource ? '返回演示' : '查看源码'}
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1 transition"
          >
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {fullscreen ? '退出全屏' : '全屏演示'}
          </button>
        </div>
      </div>

      {showSource ? (
        <pre
          className={cn(
            'w-full overflow-auto p-4 bg-slate-950 text-emerald-300 font-mono text-xs leading-relaxed m-0',
            fullscreen ? 'flex-1' : 'h-[60vh] min-h-[340px]'
          )}
        >
          {html}
        </pre>
      ) : (
        <iframe
          key={reloadKey}
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${html}`}
          className={cn(
            'w-full bg-white border-0',
            fullscreen ? 'flex-1 min-h-0' : 'h-[65vh] min-h-[360px]'
          )}
        />
      )}
    </div>
  );
}
