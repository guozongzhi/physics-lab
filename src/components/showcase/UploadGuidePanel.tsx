import { useState } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Download,
  Video,
  FileText,
  Box,
  Code2,
} from 'lucide-react';
import type { ShowcaseCategory } from '@/types';
import {
  HTML_SIM_TEMPLATE,
  SAMPLE_OBJ_CONTENT,
  inspectShowcaseMedia,
  parseShowcaseMedia,
} from '@/lib/showcaseMedia';

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CATEGORY_GUIDE: Record<
  ShowcaseCategory,
  {
    title: string;
    badge: string;
    steps: string[];
    tips: string[];
  }
> = {
  photo: {
    title: '照片展 & HTML 交互仿真上传规范',
    badge: '支持高清实验图片 + 单文件 HTML 仿真 (≤ 1 MB)',
    steps: [
      '填写作品标题与实验说明，可选关联本组正在开展的科研课题。',
      '上传实验装置/现象照片作为封面，或在下方载入/上传单文件 .html 交互仿真作品。',
      '在弹窗内直接操作预览无误后点击「提交作品审核」，教师通过后全班可见。',
    ],
    tips: [
      'HTML 仿真必须为【单文件自包含 .html/.htm】：请将 CSS 写在 <style> 内、JS 写在 <script> 内。',
      '安全沙箱默认拦截外网请求：请勿引用外部 CDN 脚本（如 <script src="https://...">）或同目录外部文件，建议直接使用原生 Canvas / SVG 绘图。',
    ],
  },
  video: {
    title: '实验视频上传规范（支持最大 100 MB 实拍视频）',
    badge: '支持 .mp4 / .webm / .mov 流式上传 (≤ 100 MB)',
    steps: [
      '点击「上传实验视频」选择本地实拍的 .mp4 / .webm / .mov 视频文件（最大支持 100 MB）。',
      '系统会自动流式上传至服务端独立视频库，并自动抓取视频首帧画面生成默认封面。',
      '在下方播放器测试 0.5x~2.0x 倍速与进度条拖动，确认后提交审核。',
    ],
    tips: [
      '本地视频采用服务端独立文件流存储（支持 HTTP Range 拖动快进），不占用 1 MB 文本配额。',
      '若视频已托管在校园网或公开对象存储，也可直接在输入框粘贴 https://... 视频直链。',
    ],
  },
  paper: {
    title: '学术论文 / 实验研究报告上传规范',
    badge: '支持 Markdown (.md / .txt) 在线排版与表格解析',
    steps: [
      '可一键载入「电磁学 / 力学 / 光学」标准论文模板，或导入本地编写的 .md / .txt 文稿。',
      '使用 "# 一级标题"、"## 二级标题" 组织章节，阅读器会自动提取左侧章节大纲目录。',
      '点击「预览学术排版」检查章节目录与实验数据表格渲染效果，确认后提交。',
    ],
    tips: [
      '实验数据表格请使用标准 Markdown 管道语法（| 实验组次 | 测量值 |），阅读器会自动渲染为带表头的标准表格。',
      '核心物理公式与变量建议使用反引号 `q / m = 2U / (B^2 * R^2)` 高亮标记。',
    ],
  },
  model: {
    title: '3D 物理模型上传规范',
    badge: '支持 Wavefront .obj 与 ASCII .stl 三维网格 (≤ 1 MB)',
    steps: [
      '可直接选择 5 款内置三维物理实验装置（托卡马克、望远镜、双振子、亥姆霍兹线圈、回旋加速器），或上传自定义 .obj / .stl 模型。',
      '在下方 3D 检视器中按住鼠标拖拽 360° 旋转、滚轮缩放或切换「线框网格 / 实体着色」。',
      '确认顶点与三角面片完整显示后提交审核。',
    ],
    tips: [
      '从 SolidWorks / Blender / Fusion 360 导出 .stl 时，请务必选择【ASCII（文本）格式】而非 Binary（二进制）格式；或优先导出为标准 .obj 格式。',
      '建议建模导出时适当精简网格细分度，将单个 .obj / .stl 文件体积控制在 1 MB 以内。',
    ],
  },
  award: {
    title: '获奖与荣誉作品上传规范',
    badge: '收录竞赛获奖证书、优秀装置与获币嘉奖作品',
    steps: [
      '上传获奖证书、实验装置大图，并可同时附带研究论文、3D 模型或 HTML 交互演示。',
      '在描述中注明获奖级别、实验创新点与团队成员分工。',
      '此外，任何分类的作品经教师审批通过并授予能量币（> 0 币）后，也会自动收录至「获奖作品」展区。',
    ],
    tips: [
      '可先切换至视频/论文/模型分类上传对应多媒体内容，再切回「获奖作品」分类提交。',
    ],
  },
};

export default function UploadGuidePanel({
  category,
  htmlContent,
}: {
  category: ShowcaseCategory;
  htmlContent: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const guide = CATEGORY_GUIDE[category] || CATEGORY_GUIDE.photo;
  const inspection = inspectShowcaseMedia(htmlContent);
  const parsed = parseShowcaseMedia(htmlContent);

  return (
    <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-sky-50/60 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
            <HelpCircle size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-ink-900">{guide.title}</span>
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {guide.badge}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold text-ink-600 hover:text-ink-900 inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg hover:bg-amber-100/50 transition"
        >
          {expanded ? (
            <>
              收起指南 <ChevronUp size={14} />
            </>
          ) : (
            <>
              如何正确上传 <ChevronDown size={14} />
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2.5 pt-1 border-t border-amber-200/60 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {guide.steps.map((step, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white/90 border border-amber-100 p-2.5 flex items-start gap-2"
              >
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-ink-700 leading-relaxed">{step}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-sky-50/80 border border-sky-200/80 p-2.5 space-y-1">
            {guide.tips.map((tip, idx) => (
              <p key={idx} className="text-[11.5px] text-sky-900 flex items-start gap-1.5 leading-relaxed">
                <CheckCircle2 size={13} className="text-sky-600 shrink-0 mt-0.5" />
                <span>{tip}</span>
              </p>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                <Video size={11} /> 视频 ≤ 100MB (.mp4/.webm/.mov)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                <FileText size={11} /> 论文 Markdown (.md/.txt)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                <Box size={11} /> 模型 .obj / ASCII .stl
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                <Code2 size={11} /> 单文件内联 .html
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile('physics-sim-template.html', HTML_SIM_TEMPLATE, 'text/html;charset=utf-8')
                }
                className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold inline-flex items-center gap-1 text-[11px] transition"
              >
                <Download size={11} />
                下载 HTML 模板
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile('crystal-octahedron-sample.obj', SAMPLE_OBJ_CONTENT)}
                className="px-2.5 py-1 rounded-lg bg-white border border-cyan-200 text-cyan-800 hover:bg-cyan-50 font-semibold inline-flex items-center gap-1 text-[11px] transition"
              >
                <Download size={11} />
                下载示例 .obj 模型
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 实时内容体检与配额进度条 */}
      {parsed.kind !== 'none' && (
        <div className="pt-2 border-t border-amber-200/60 space-y-2">
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
