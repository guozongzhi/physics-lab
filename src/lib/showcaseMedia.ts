export const MAX_SHOWCASE_PAYLOAD_BYTES = 1_000_000;

export const VIDEO_PREFIX = '<!--VIDEO_SRC-->';
export const PAPER_PREFIX = '<!--PAPER_MD-->';
export const MODEL3D_PREFIX_REGEX = /^<!--MODEL_3D:(obj|stl|preset)-->([\s\S]*)$/;

export type Model3DFormat = 'obj' | 'stl' | 'preset';
export type Preset3DId = 'tokamak' | 'telescope' | 'pendulum';

export type ShowcaseMediaPayload =
  | { kind: 'none' }
  | { kind: 'html'; html: string }
  | { kind: 'video'; videoSrc: string }
  | { kind: 'paper'; markdown: string }
  | { kind: 'model3d'; format: Model3DFormat; data: string };

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function captureVideoFrame(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration ? video.duration / 4 : 0);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = Math.min(480, video.videoWidth || 480);
        const h = Math.round(w * ((video.videoHeight || 270) / (video.videoWidth || 480)));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const poster = canvas.toDataURL('image/jpeg', 0.75);
          cleanup();
          resolve(poster);
          return;
        }
      } catch {
        // Fallback if canvas capture is blocked
      }
      cleanup();
      resolve('');
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };
  });
}

export function parseShowcaseMedia(raw?: string | null): ShowcaseMediaPayload {
  if (!raw || !raw.trim()) return { kind: 'none' };
  if (raw.startsWith(VIDEO_PREFIX)) {
    return { kind: 'video', videoSrc: raw.slice(VIDEO_PREFIX.length).trim() };
  }
  if (raw.startsWith(PAPER_PREFIX)) {
    return { kind: 'paper', markdown: raw.slice(PAPER_PREFIX.length) };
  }
  const modelMatch = raw.match(MODEL3D_PREFIX_REGEX);
  if (modelMatch) {
    return {
      kind: 'model3d',
      format: modelMatch[1] as Model3DFormat,
      data: modelMatch[2].trim(),
    };
  }
  return { kind: 'html', html: raw };
}

export function encodeShowcaseMedia(payload: ShowcaseMediaPayload): string {
  switch (payload.kind) {
    case 'none':
      return '';
    case 'video':
      return payload.videoSrc.trim() ? `${VIDEO_PREFIX}${payload.videoSrc.trim()}` : '';
    case 'paper':
      return payload.markdown.trim() ? `${PAPER_PREFIX}${payload.markdown}` : '';
    case 'model3d':
      return payload.data.trim() ? `<!--MODEL_3D:${payload.format}-->${payload.data.trim()}` : '';
    case 'html':
      return payload.html;
  }
}

export function getMediaBadgeLabel(
  rawHtml?: string | null,
  demoKind?: '' | 'optics' | 'motor'
): string | null {
  if (demoKind) return '交互 Demo · 公共展示';
  const parsed = parseShowcaseMedia(rawHtml);
  switch (parsed.kind) {
    case 'video':
      return '实验视频 · 可播放';
    case 'paper':
      return '研究论文 · 全文阅读';
    case 'model3d':
      return '3D 模型 · 360° 检视';
    case 'html':
      return 'HTML 交互演示';
    default:
      return null;
  }
}

export const PAPER_MARKDOWN_TEMPLATE = `# 洛伦兹力与环形磁场约束轨迹探究报告

## 一、研究背景与摘要
本研究围绕带电粒子在非均匀轴对称磁场中的运动轨迹展开实验测量与数值验证。通过调节励磁线圈电流 $I$ 与加速电压 $U$，定量测定电子束偏转半径 $R$ 的变化规律。

## 二、实验原理与核心方程
带电粒子在均匀磁场中垂直入射时，洛伦兹力提供向心力：
- 向心力方程：\`q * v * B = m * v^2 / R\`
- 加速电场动能定理：\`q * U = (1/2) * m * v^2\`
- 比荷推导公式：\`q / m = 2U / (B^2 * R^2)\`

## 三、实验测量数据记录
| 实验组次 | 加速电压 U (V) | 励磁电流 I (A) | 磁感应强度 B (mT) | 轨迹半径 R (cm) | 相对误差 (%) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 第 1 组 | 150.0 | 1.20 | 1.42 | 5.82 | 1.4% |
| 第 2 组 | 200.0 | 1.40 | 1.65 | 5.76 | 1.1% |
| 第 3 组 | 250.0 | 1.60 | 1.89 | 5.64 | 0.9% |

## 四、误差分析与结论
1. **地磁场干扰修正**：通过正反向通电取平均值，消除实验室地磁场垂直分量带来的系统偏差。
2. **核心结论**：在误差允许范围内，实验测得比荷与标准值吻合度达 **98.7%**，验证了磁约束半径与磁感应强度成反比关系。
`;

export const HTML_SIM_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; padding: 16px; }
  .controls { display: flex; gap: 16px; align-items: center; background: #1e293b; padding: 10px 16px; border-radius: 12px; margin-bottom: 12px; font-size: 13px; }
  canvas { background: #020617; border-radius: 14px; border: 1px solid #334155; max-width: 100%; }
  input[type=range] { accent-color: #38bdf8; }
</style>
</head>
<body>
  <div class="controls">
    <label>劲度系数 k: <input id="kSlider" type="range" min="5" max="40" value="18" /></label>
    <label>阻尼 γ: <input id="dSlider" type="range" min="0" max="10" value="1" /></label>
    <button id="resetBtn" style="background:#0284c7;color:#fff;border:0;padding:5px 12px;border-radius:8px;cursor:pointer">重置振幅</button>
    <span id="readout">E = 18.0 J</span>
  </div>
  <canvas id="sim" width="560" height="280"></canvas>
  <script>
    const cvs = document.getElementById('sim');
    const ctx = cvs.getContext('2d');
    const kSlider = document.getElementById('kSlider');
    const dSlider = document.getElementById('dSlider');
    const readout = document.getElementById('readout');
    let x = 140, v = 0, history = [];
    document.getElementById('resetBtn').onclick = () => { x = 150; v = 0; history = []; };
    function step() {
      const k = Number(kSlider.value) * 0.004;
      const damp = Number(dSlider.value) * 0.003;
      const a = -k * x - damp * v;
      v += a; x += v;
      history.push(x); if (history.length > 220) history.shift();
      const energy = (0.5 * Number(kSlider.value) * (x / 100) * (x / 100) + 0.5 * v * v).toFixed(2);
      readout.textContent = '总机械能 E = ' + energy + ' J';
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
      const bx = 280 + x;
      ctx.moveTo(40, 90);
      for (let i = 1; i <= 16; i++) {
        ctx.lineTo(40 + ((bx - 60) / 16) * i, 90 + (i % 2 === 0 ? -12 : 12));
      }
      ctx.lineTo(bx - 20, 90); ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.roundRect(bx - 20, 66, 40, 48, 8); ctx.fill();
      ctx.strokeStyle = '#22c55e'; ctx.beginPath();
      history.forEach((val, idx) => {
        const px = 40 + idx * 2.2, py = 215 + val * 0.32;
        idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
      requestAnimationFrame(step);
    }
    step();
  </script>
</body>
</html>`;

export const PRESET_3D_MODELS: Array<{
  id: Preset3DId;
  name: string;
  subtitle: string;
}> = [
  { id: 'tokamak', name: '托卡马克环形磁约束装置', subtitle: '环形螺线管线圈 + 等离子体真空室三维模型' },
  { id: 'telescope', name: '开普勒/伽利略折射望远镜', subtitle: '物镜筒 + 调焦镜管 + 光学透镜组三维结构' },
  { id: 'pendulum', name: '三维耦合双振子实验架', subtitle: '刚性龙门支架 + 双摆球耦合振动装置' },
];
