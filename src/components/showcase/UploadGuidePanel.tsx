import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, AlertTriangle, Download } from 'lucide-react';
import type { ShowcaseCategory } from '@/types';
import { HTML_SIM_TEMPLATE, SAMPLE_OBJ_CONTENT, inspectShowcaseMedia, parseShowcaseMedia } from '@/lib/showcaseMedia';

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CATEGORY_GUIDE: Record<ShowcaseCategory, string> = {
  photo: '上传照片，或添加交互 HTML。HTML 须为单文件，最大 1 MB，不支持外部资源。',
  video: '支持 MP4、WebM、MOV，最大 100 MB。上传后自动生成封面，也可使用视频直链。',
  paper: '导入 Markdown 或 TXT 文稿，也可使用模板。提交前可预览排版。',
  model: '支持 OBJ、ASCII STL，最大 1 MB；也可选择内置模型。',
  award: '上传获奖证书或作品图片，在简介中注明奖项。',
};

export default function UploadGuidePanel({ category, htmlContent }: {
  category: ShowcaseCategory;
  htmlContent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const inspection = inspectShowcaseMedia(htmlContent);
  const parsed = parseShowcaseMedia(htmlContent);
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 space-y-2">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 text-xs font-medium text-blue-700">
        <HelpCircle size={15} />
        <span>格式说明</span>
        {expanded ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
      </button>
      {expanded && <div className="space-y-3 border-t border-blue-100 pt-2 text-xs leading-5 text-slate-600">
        <p>{CATEGORY_GUIDE[category]}</p>
        {(category === 'photo' || category === 'model') && <button type="button"
          onClick={() => category === 'model'
            ? downloadTextFile('sample.obj', SAMPLE_OBJ_CONTENT)
            : downloadTextFile('physics-sim-template.html', HTML_SIM_TEMPLATE, 'text/html;charset=utf-8')}
          className="inline-flex items-center gap-1 text-blue-700 font-medium">
          <Download size={12} />{category === 'model' ? '下载示例模型' : '下载 HTML 模板'}
        </button>}
      </div>}
      {/* 实时内容体检与配额进度条 */}
      {parsed.kind !== 'none' && (
        <div className="pt-2 border-t border-blue-100 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-ink-700">
              {parsed.kind === 'video' && parsed.videoSrc.startsWith('/api/showcase/video/')
                ? '已绑定服务端独立视频流（不占用 1 MB 文本配额）'
                : `当前内联作品载荷：${(inspection.byteLength / 1024).toFixed(1)} KB / ${(
                    inspection.maxBytes / 1000
                  ).toFixed(0)} KB (${inspection.percent}%)`}
            </span>
            <span
              className={
                inspection.byteLength > inspection.maxBytes
                  ? 'text-red-600 font-bold'
                  : 'text-emerald-700 font-semibold'
              }
            >
              {inspection.byteLength > inspection.maxBytes ? '超出 1 MB 上限' : '格式预检通过'}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full transition-all ${
                inspection.byteLength > inspection.maxBytes
                  ? 'bg-red-500'
                  : inspection.percent > 80
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(2, inspection.percent)}%` }}
            />
          </div>

          {inspection.warnings.map((w, idx) => (
            <div
              key={idx}
              role="status"
              className="rounded-lg bg-amber-100/90 border border-amber-300 px-3 py-2 text-[11.5px] text-amber-900 flex items-start gap-1.5"
            >
              <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
