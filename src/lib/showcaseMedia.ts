import opticsDemoHtml from '@/assets/demos/optics.html?raw';
import motorDemoHtml from '@/assets/demos/motor.html?raw';

export { opticsDemoHtml, motorDemoHtml };

export const MAX_SHOWCASE_PAYLOAD_BYTES = 1_000_000;
/** 实验视频独立文件上传上限：100 MB */
export const MAX_VIDEO_FILE_BYTES = 100 * 1024 * 1024;

export const VIDEO_PREFIX = '<!--VIDEO_SRC-->';
export const PAPER_PREFIX = '<!--PAPER_MD-->';
export const MODEL3D_PREFIX_REGEX = /^<!--MODEL_3D:(obj|stl|preset)-->([\s\S]*)$/;

export type Model3DFormat = 'obj' | 'stl' | 'preset';
export type Preset3DId = 'tokamak' | 'telescope' | 'pendulum' | 'helmholtz' | 'cyclotron';

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
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const timer = window.setTimeout(() => { cleanup(); resolve(''); }, 5000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
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
  { id: 'helmholtz', name: '亥姆霍兹双线圈匀强磁场台', subtitle: '平行同轴双圆环励磁线圈 + 中心霍尔探头底座' },
  { id: 'cyclotron', name: '回旋加速器双 D 形盒电极', subtitle: '双半圆柱真空 D 形盒 + 交变加速狭缝 + 螺旋粒子轨道' },
];

export const DOUBLE_SLIT_HTML_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #090d16; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; padding: 14px; }
  .bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; background: #1e293b; padding: 10px 16px; border-radius: 12px; margin-bottom: 12px; font-size: 12px; }
  canvas { background: #020617; border-radius: 14px; border: 1px solid #334155; max-width: 100%; }
  input[type=range] { accent-color: #38bdf8; vertical-align: middle; }
</style>
</head>
<body>
  <div class="bar">
    <label>波长 λ: <input id="wl" type="range" min="400" max="700" value="532" /> <b id="wlVal">532 nm</b></label>
    <label>双缝间距 d: <input id="slitD" type="range" min="15" max="80" value="40" /> <b id="dVal">0.40 mm</b></label>
    <label>单缝宽度 a: <input id="slitA" type="range" min="4" max="25" value="10" /> <b id="aVal">0.10 mm</b></label>
  </div>
  <canvas id=" view" width="580" height="290"></canvas>
  <script>
    const cvs = document.getElementById(' view');
    const ctx = cvs.getContext('2d');
    const wl = document.getElementById('wl');
    const slitD = document.getElementById('slitD');
    const slitA = document.getElementById('slitA');
    function wlToRgb(w) {
      let r = 0, g = 0, b = 0;
      if (w < 440) { r = -(w - 440) / 60; b = 1; }
      else if (w < 490) { g = (w - 440) / 50; b = 1; }
      else if (w < 510) { g = 1; b = -(w - 510) / 20; }
      else if (w < 580) { r = (w - 510) / 70; g = 1; }
      else if (w < 645) { r = 1; g = -(w - 645) / 65; }
      else { r = 1; }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    function render() {
      const l = Number(wl.value), d = Number(slitD.value), a = Number(slitA.value);
      document.getElementById('wlVal').textContent = l + ' nm';
      document.getElementById('dVal').textContent = (d / 100).toFixed(2) + ' mm';
      document.getElementById('aVal').textContent = (a / 100).toFixed(2) + ' mm';
      const [r, g, b] = wlToRgb(l);
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const mid = cvs.width / 2;
      ctx.beginPath();
      for (let x = 0; x < cvs.width; x++) {
        const u = (x - mid) / (l * 0.28);
        const alpha = u * a * 0.14;
        const beta = u * d * 0.14;
        const diff = Math.abs(alpha) < 1e-5 ? 1 : Math.pow(Math.sin(alpha) / alpha, 2);
        const interf = Math.pow(Math.cos(beta), 2);
        const I = diff * interf;
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (I * 0.95).toFixed(3) + ')';
        ctx.fillRect(x, 18, 1, 92);
        const py = 258 - I * 125;
        x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
      }
      ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('上方：接收屏干涉条纹  |  下方：相对光强分布 I(x)（虚线包络受单缝衍射调制）', 18, 280);
    }
    [wl, slitD, slitA].forEach((el) => el.addEventListener('input', render));
    render();
  </script>
</body>
</html>`;

export const MASS_SPEC_HTML_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #090d16; color: #f8fafc; display: flex; flex-direction: column; align-items: center; padding: 14px; }
  .bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; background: #1e293b; padding: 10px 16px; border-radius: 12px; margin-bottom: 12px; font-size: 12px; }
  canvas { background: #020617; border-radius: 14px; border: 1px solid #334155; max-width: 100%; }
  input[type=range] { accent-color: #38bdf8; vertical-align: middle; }
</style>
</head>
<body>
  <div class="bar">
    <label>入射速度 v₀: <input id="vSlider" type="range" min="2" max="9" step="0.2" value="5" /> <b id="vTxt">5.0</b></label>
    <label>偏转磁场 B₂: <input id="bSlider" type="range" min="1" max="5" step="0.2" value="2.4" /> <b id="bTxt">2.4 T</b></label>
    <label>比荷 q/m: <input id="qmSlider" type="range" min="0.8" max="2.5" step="0.1" value="1.5" /> <b id="qmTxt">1.5</b></label>
  </div>
  <canvas id="ms" width="580" height="290"></canvas>
  <script>
    const cvs = document.getElementById('ms');
    const ctx = cvs.getContext('2d');
    const vSlider = document.getElementById('vSlider');
    const bSlider = document.getElementById('bSlider');
    const qmSlider = document.getElementById('qmSlider');
    function draw() {
      const v = Number(vSlider.value), b = Number(bSlider.value), qm = Number(qmSlider.value);
      document.getElementById('vTxt').textContent = v.toFixed(1) + '×10⁵ m/s';
      document.getElementById('bTxt').textContent = b.toFixed(1) + ' T';
      document.getElementById('qmTxt').textContent = qm.toFixed(1) + '×10⁷ C/kg';
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
      ctx.strokeRect(20, 30, 170, 230);
      ctx.fillStyle = '#38bdf8'; ctx.font = '12px sans-serif';
      ctx.fillText('速度选择器 (E ⊥ B₁)', 45, 52);
      ctx.fillText('偏转匀强磁场 B₂ (垂直纸面向外)', 240, 48);
      const radius = Math.max(28, Math.min(105, (v * 28) / (b * qm * 0.6)));
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(35, 70);
      ctx.lineTo(190, 70);
      ctx.arc(190, 70 + radius, radius, -Math.PI / 2, Math.PI / 2, false);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(190, 70 + 2 * radius, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('感光底片落点直径 D = 2R = ' + (2 * radius * 0.8).toFixed(1) + ' mm', 235, 265);
    }
    [vSlider, bSlider, qmSlider].forEach((el) => el.addEventListener('input', draw));
    draw();
  </script>
</body>
</html>`;

export const GAS_KINETIC_HTML_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #090d16; color: #f8fafc; display: flex; flex-direction: column; align-items: center; padding: 14px; }
  .bar { display: flex; gap: 16px; align-items: center; background: #1e293b; padding: 10px 16px; border-radius: 12px; margin-bottom: 12px; font-size: 12px; }
  canvas { background: #020617; border-radius: 14px; border: 1px solid #334155; max-width: 100%; }
  input[type=range] { accent-color: #38bdf8; vertical-align: middle; }
</style>
</head>
<body>
  <div class="bar">
    <label>热力学温度 T: <input id="tSlider" type="range" min="150" max="900" value="350" /> <b id="tTxt">350 K</b></label>
    <label>气缸容积 V: <input id="vSlider" type="range" min="180" max="340" value="280" /> <b id="vTxt">280 L</b></label>
    <span id="pTxt" style="color:#38bdf8;font-weight:bold">压强 P = 125 kPa</span>
  </div>
  <canvas id="gas" width="580" height="280"></canvas>
  <script>
    const cvs = document.getElementById('gas'), ctx = cvs.getContext('2d');
    const tSlider = document.getElementById('tSlider'), vSlider = document.getElementById('vSlider');
    const pts = Array.from({ length: 48 }, (_, i) => ({
      x: 40 + (i % 8) * 24, y: 40 + Math.floor(i / 8) * 32,
      vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4
    }));
    function loop() {
      const T = Number(tSlider.value), W = Number(vSlider.value);
      document.getElementById('tTxt').textContent = T + ' K';
      document.getElementById('vTxt').textContent = W + ' cm³';
      document.getElementById('pTxt').textContent = '器壁压强 P ≈ ' + Math.round((T * 100) / W) + ' kPa';
      const scale = Math.sqrt(T / 300) * 2.2;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, W, 240);
      const bins = [0, 0, 0, 0, 0, 0];
      pts.forEach((p) => {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tx = (p.vx / sp) * scale * (0.6 + ( pts.indexOf(p) % 5 ) * 0.22);
        const ty = (p.vy / sp) * scale * (0.6 + ( pts.indexOf(p) % 5 ) * 0.22);
        p.x += tx; p.y += ty;
        if (p.x < 26) { p.x = 26; p.vx = Math.abs(p.vx); }
        if (p.x > 14 + W) { p.x = 14 + W; p.vx = -Math.abs(p.vx); }
        if (p.y < 26 || p.y > 254) p.vy = -p.vy;
        const vMag = Math.hypot(tx, ty);
        bins[Math.min(5, Math.floor(vMag))]++;
        ctx.fillStyle = vMag > 3.2 ? '#f97316' : '#38bdf8';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif';
      ctx.fillText('麦克斯韦速率分布实时统计 N(v)', 380, 42);
      bins.forEach((cnt, idx) => {
        const bh = cnt * 7;
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(380 + idx * 28, 240 - bh, 20, bh);
      });
      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>`;

export interface HtmlSimTemplateItem {
  id: 'optics-demo' | 'motor-demo' | 'oscillator' | 'double-slit' | 'mass-spec' | 'gas-kinetic';
  name: string;
  tag: string;
  description: string;
  html: string;
}

export const HTML_SIM_TEMPLATES: HtmlSimTemplateItem[] = [
  {
    id: 'optics-demo',
    name: '追踪一束光的旅程',
    tag: '光学 · 折射与色散',
    description: '调节入射角和折射率，观察折射、色散及光速变化。',
    html: opticsDemoHtml,
  },
  {
    id: 'motor-demo',
    name: '让线圈开始转动',
    tag: '电磁学 · 直流电机',
    description: '调节电流和磁场，控制线圈启停、转角与旋转方向。',
    html: motorDemoHtml,
  },
  {
    id: 'oscillator',
    name: '弹簧振子阻尼与机械能演化',
    tag: '力学 · 简谐振动',
    description: '调节劲度系数 k 与阻尼系数 γ，实时绘制弹簧振子位移-时间图像与总机械能读数。',
    html: HTML_SIM_TEMPLATE,
  },
  {
    id: 'double-slit',
    name: '杨氏双缝干涉与衍射光强曲线',
    tag: '光学 · 波动光学',
    description: '调节激光波长 λ (400~700nm)、双缝间距 d 与单缝宽度 a，实时渲染彩色干涉条纹与光强分布。',
    html: DOUBLE_SLIT_HTML_TEMPLATE,
  },
  {
    id: 'mass-spec',
    name: '速度选择器与质谱仪偏转轨迹',
    tag: '电磁学 · 洛伦兹力',
    description: '调节入射速度、匀强磁场 B₂ 与粒子比荷 q/m，动态绘制带电粒子圆弧轨迹与底片落点直径。',
    html: MASS_SPEC_HTML_TEMPLATE,
  },
  {
    id: 'gas-kinetic',
    name: '理想气体分子热运动与速率分布',
    tag: '热学 · 分子动理论',
    description: '调节热力学温度 T 与活塞体积 V，实时模拟分子弹性碰撞并统计麦克斯韦速率分布直方图。',
    html: GAS_KINETIC_HTML_TEMPLATE,
  },
];

export interface PaperTemplateItem {
  id: 'electromagnetism' | 'mechanics' | 'optics';
  name: string;
  tag: string;
  markdown: string;
}

export const PAPER_TEMPLATES: PaperTemplateItem[] = [
  {
    id: 'electromagnetism',
    name: '洛伦兹力与环形磁场比荷测定',
    tag: '电磁学论文模板',
    markdown: PAPER_MARKDOWN_TEMPLATE,
  },
  {
    id: 'mechanics',
    name: '大角度单摆非线性周期修正探究',
    tag: '力学论文模板',
    markdown: `# 大角度非线性单摆周期修正与空气阻尼测定报告

## 一、研究背景与问题提出
教材中单摆周期公式 \`T₀ = 2π * sqrt(L / g)\` 仅在摆角 \`θ < 5°\` 的小角度线性近似下成立。本课题利用光电门计时系统测定摆角在 \`5° ~ 60°\` 范围内的实际周期，验证椭圆积分二级近似修正公式。

## 二、理论修正模型
当最大摆角为 \`θ₀\`（弧度）时，单摆周期的幂级数展开式为：
- 零级近似（小角度）：\`T₀ = 2π * sqrt(L / g)\`
- 二阶非线性修正：\`T(θ₀) ≈ T₀ * (1 + (1/16) * θ₀² + (11/3072) * θ₀⁴)\`

## 三、光电门实测数据对比（摆长 L = 1.000 m）
| 初始摆角 θ₀ (°) | 50 次全振动耗时 (s) | 实测周期 T (s) | 线性理论值 T₀ (s) | 二阶修正值 T_corr (s) | 修正后相对偏差 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 5.0° | 100.38 | 2.0076 | 2.0064 | 2.0074 | 0.01% |
| 25.0° | 101.55 | 2.0310 | 2.0064 | 2.0303 | 0.03% |
| 45.0° | 104.32 | 2.0864 | 2.0064 | 2.0858 | 0.03% |

## 四、实验结论
当摆角达到 \`45°\` 时，传统公式误差高达 **3.98%**，而引入 \`1 + θ₀²/16\` 二阶修正项后相对偏差收敛至 **0.03%** 以内。
`,
  },
  {
    id: 'optics',
    name: '双缝干涉测定激光波长与不确定度',
    tag: '光学论文模板',
    markdown: `# 杨氏双缝干涉测定半导体激光波长与不确定度分析

## 一、实验目的与原理
利用相干激光束通过间距为 \`d\` 的双缝，在距离为 \`L\` 的测微目镜屏上形成等间距明暗干涉条纹。相邻明纹间距公式为：
- 波长计算式：\`λ = (d / L) * Δx\`
- 逐差法求平均条纹间距：\`Δx = [(x₆ - x₁) + (x₇ - x₂) + ... + (x₁₀ - x₅)] / 25\`

## 二、测微目镜读数记录表（d = 0.250 mm, L = 1200.0 mm）
| 条纹序数 i | 位置读数 x_i (mm) | 条纹序数 i+5 | 位置读数 x_{i+5} (mm) | 差值 x_{i+5} - x_i (mm) | 单组平均 Δx (mm) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 第 1 条 | 2.142 | 第 6 条 | 17.318 | 15.176 | 3.035 |
| 第 2 条 | 5.179 | 第 7 条 | 20.359 | 15.180 | 3.036 |
| 第 3 条 | 8.211 | 第 8 条 | 23.386 | 15.175 | 3.035 |

## 三、合成标准不确定度结论
测得平均条纹间距 \`Δx = 3.035 mm\`，计算得激光波长 \`λ = 632.3 ± 1.8 nm\`，与氦氖/红光标准波长高度一致。
`,
  },
];

export const SAMPLE_OBJ_CONTENT = `# 标准八面体双棱镜三维模型示例 (.obj)
v 0.0 1.4 0.0
v 1.0 0.0 0.0
v 0.0 0.0 1.0
v -1.0 0.0 0.0
v 0.0 0.0 -1.0
v 0.0 -1.4 0.0
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
f 6 3 2
f 6 4 3
f 6 5 4
f 6 2 5
`;

export interface MediaInspectionResult {
  byteLength: number;
  maxBytes: number;
  percent: number;
  warnings: string[];
}

export function inspectShowcaseMedia(rawHtml?: string | null): MediaInspectionResult {
  const raw = rawHtml || '';
  const byteLength = utf8ByteLength(raw);
  const warnings: string[] = [];
  const parsed = parseShowcaseMedia(raw);

  if (parsed.kind === 'html') {
    if (/<script[^>]+src\s*=\s*["']https?:\/\//i.test(parsed.html)) {
      warnings.push(
        '检测到外部脚本 <script src="http...">：安全沙箱禁止加载外网 CDN 脚本，请将 JS 代码直接内联写在 <script> 标签内。'
      );
    }
    if (/<link[^>]+href\s*=\s*["']https?:\/\//i.test(parsed.html)) {
      warnings.push(
        '检测到外部样式表 <link href="http...">：安全沙箱会拦截外部样式，请改用内联 <style> 标签。'
      );
    }
    if (/\bfetch\s*\(|\bXMLHttpRequest\b/.test(parsed.html)) {
      warnings.push(
        '检测到网络请求调用 (fetch / XMLHttpRequest)：沙箱 CSP 禁用外部网络接口，请使用页面内数值计算或内置数据。'
      );
    }
  } else if (parsed.kind === 'model3d') {
    if (parsed.format === 'stl' && !/^solid\b/i.test(parsed.data.trim())) {
      warnings.push(
        '当前 .stl 文件似乎不是以 "solid" 开头的 ASCII 文本格式。若模型无法显示，请在 SolidWorks / Blender 导出时选择 ASCII STL 格式或改用 .obj 格式。'
      );
    }
    if (parsed.format === 'obj' && (!/\bv\s+[-0-9.]+/i.test(parsed.data) || !/\bf\s+\d+/i.test(parsed.data))) {
      warnings.push(
        '当前 .obj 文件未检测到完整的顶点 (v x y z) 或面索引 (f i j k)，请确认文件为标准 Wavefront OBJ 文本网格。'
      );
    }
  } else if (parsed.kind === 'paper') {
    if (!/^#{1,3}\s+/m.test(parsed.markdown)) {
      warnings.push(
        '提示：在正文中使用 "# 一级标题" 或 "## 二级标题" 可自动生成左侧章节导航目录。'
      );
    }
  }

  return {
    byteLength,
    maxBytes: MAX_SHOWCASE_PAYLOAD_BYTES,
    percent: Math.min(100, Math.round((byteLength / MAX_SHOWCASE_PAYLOAD_BYTES) * 1000) / 10),
    warnings,
  };
}

