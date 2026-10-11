import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Lightbulb, Zap } from 'lucide-react';
import { motorTorque, refractionAngle } from './physics';

type Kind = 'optics' | 'motor';
const colors = ['#fb7185', '#fb923c', '#fde047', '#4ade80', '#38bdf8', '#a78bfa'];

function Control({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return <label className="block space-y-2 text-sm text-slate-200">
    <span className="flex justify-between gap-3"><span>{label}</span><b className="text-cyan-300 tabular-nums">{value}{unit}</b></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
  </label>;
}

export default function PhysicsDemo({ kind }: { kind: Kind }) {
  const optics = kind === 'optics';
  const [incident, setIncident] = useState(45);
  const [index, setIndex] = useState(1.5);
  const [dispersion, setDispersion] = useState(true);
  const [current, setCurrent] = useState(2);
  const [field, setField] = useState(0.5);
  const [reverse, setReverse] = useState(false);
  const [running, setRunning] = useState(false);
  const [angle, setAngle] = useState(90);
  const [normal, setNormal] = useState(true);
  const torque = motorTorque(current, field, angle);
  const refracted = refractionAngle(incident, index);

  useEffect(() => {
    if (!running || optics || current === 0 || field === 0) return;
    let frame = 0;
    let previous = 0;
    const animate = (now: number) => {
      if (previous) {
        const delta = Math.min(now - previous, 50);
        setAngle(a => (a + (reverse ? -1 : 1) * delta * current * field * 0.12 + 360) % 360);
      }
      previous = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [running, optics, current, field, reverse]);

  const reset = () => {
    setIncident(45); setIndex(1.5); setDispersion(true); setNormal(true);
    setCurrent(2); setField(0.5); setReverse(false); setRunning(false); setAngle(90);
  };

  return <section className="bg-slate-950 text-white p-5 sm:p-8 rounded-t-[24px]">
    <div className="flex items-center gap-2 text-cyan-300 text-xs tracking-widest mb-3">
      {optics ? <Lightbulb size={16} /> : <Zap size={16} />} INTERACTIVE PHYSICS LAB
    </div>
    <h3 className="text-xl sm:text-2xl font-bold pr-10">{optics ? '追踪一束光的旅程' : '让线圈开始转动'}</h3>
    <p className="text-slate-400 text-sm mt-2">admin · 平台公共演示 · {optics ? '折射 / 色散 / 斯涅尔定律' : '磁场 / 电流 / 换向器'}</p>
    <div className="grid md:grid-cols-[1fr_260px] gap-5 mt-6">
      <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-blue-950 overflow-hidden">
        {optics ? <svg viewBox="0 0 600 360" role="img" aria-label="光学折射与色散动态示意" className="w-full">
          <defs><linearGradient id="optical-medium" x2="1" y2="1"><stop stopColor="#164e63" stopOpacity=".7" /><stop offset="1" stopColor="#1e3a8a" stopOpacity=".3" /></linearGradient></defs>
          <rect y="180" width="600" height="180" fill="url(#optical-medium)" />
          <path d="M0 180H600" stroke="#67e8f9" strokeWidth="2" />
          {normal && <path d="M300 25V340" stroke="#94a3b8" strokeDasharray="7 7" />}
          <text x="22" y="32" fill="#cbd5e1" fontSize="14">空气 n₁ = 1.00</text>
          <text x="22" y="330" fill="#67e8f9" fontSize="14">透明介质 n₂ = {index.toFixed(2)}</text>
          <path d={`M${300 - 165 * Math.sin(incident * Math.PI / 180)} ${180 - 165 * Math.cos(incident * Math.PI / 180)} L300 180`} stroke="white" strokeWidth="4" />
          <path d={`M300 180 L${300 + 160 * Math.sin(incident * Math.PI / 180)} ${180 - 160 * Math.cos(incident * Math.PI / 180)}`} stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 5" />
          {(dispersion ? colors : ['#ffffff']).map((color, i) => {
            const n = dispersion ? index + (i - 2.5) * 0.025 : index;
            const r = refractionAngle(incident, n) * Math.PI / 180;
            return <path key={color} d={`M300 180 L${300 + 180 * Math.sin(r)} ${180 + 180 * Math.cos(r)}`} stroke={color} strokeWidth={dispersion ? 2.5 : 4} />;
          })}
          <circle cx="300" cy="180" r="5" fill="#fef9c3" />
          <text x="325" y="140" fill="white" fontSize="14">入射 {incident}°</text>
          <text x="320" y="245" fill="#67e8f9" fontSize="14">折射 {refracted.toFixed(1)}°</text>
          <text x="360" y="45" fill="#94a3b8" fontSize="12">虚线：反射光</text>
        </svg> : <svg viewBox="0 0 600 360" role="img" aria-label="直流电机线圈动态示意" className="w-full">
          <defs><linearGradient id="coil-copper"><stop stopColor="#fb923c" /><stop offset=".5" stopColor="#fde68a" /><stop offset="1" stopColor="#ea580c" /></linearGradient></defs>
          <rect x="35" y="95" width="100" height="170" rx="18" fill="#be123c" /><text x="73" y="195" fill="white" fontSize="36" fontWeight="bold">N</text>
          <rect x="465" y="95" width="100" height="170" rx="18" fill="#1d4ed8" /><text x="503" y="195" fill="white" fontSize="36" fontWeight="bold">S</text>
          {[115,180,245].map(y => <g key={y} opacity={field > 0 ? .7 : .15}><path d={`M150 ${y}H450 l-12 -6 m12 6 l-12 6`} stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 4" /></g>)}
          <path d="M300 45V300" stroke="#64748b" strokeWidth="8" />
          <g transform={`translate(300 180) scale(${Math.sin(angle * Math.PI / 180)} 1)`}>
            {[0,1,2,3,4].map(i => <rect key={i} x={-105 + i * 5} y={-65 + i * 4} width={210 - i * 10} height={130 - i * 8} rx="18" fill="none" stroke="url(#coil-copper)" strokeWidth="3" />)}
          </g>
          <circle cx="300" cy="180" r="12" fill="#cbd5e1" />
          <path d="M250 310H215V340H385V310H350" fill="none" stroke="#fbbf24" strokeWidth="3" />
          <rect x="280" y="290" width="18" height="32" rx="5" fill="#fb923c" /><rect x="302" y="290" width="18" height="32" rx="5" fill="#fbbf24" />
          <text x="25" y="30" fill="#94a3b8" fontSize="13">正视图 · 理想换向器模型</text>
          <text x="330" y="305" fill="#fde68a" fontSize="12">换向器 / 电刷</text>
          <text x="225" y="75" fill="#67e8f9" fontSize="14">{reverse ? '反向电流 ↶' : '正向电流 ↷'}</text>
        </svg>}
        <div className="grid grid-cols-3 border-t border-slate-700 text-center p-4 gap-2 text-xs text-slate-400">
          {optics ? <><div>入射角<b className="block text-lg text-white">{incident}°</b></div><div>折射角<output aria-label="折射角读数" className="block text-lg text-cyan-300">{refracted.toFixed(1)}°</output></div><div>光速 v/c<b className="block text-lg text-white">{(1 / index).toFixed(2)}</b></div></> : <><div>转角<output aria-label="电机转角读数" className="block text-lg text-white">{angle.toFixed(0)}°</output></div><div>瞬时力矩<output aria-label="力矩读数" className="block text-lg text-cyan-300">{torque.toFixed(3)} N·m</output></div><div>状态<b className="block text-sm text-white mt-1">{current === 0 || field === 0 ? '无驱动力' : running ? '运行中' : '已暂停'}</b></div></>}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-700 p-5 space-y-5 bg-slate-900">
        <h4 className="font-bold text-sm">实验控制台</h4>
        {optics ? <>
          <Control label="入射角" value={incident} min={0} max={75} unit="°" onChange={setIncident} />
          <Control label="介质折射率" value={index} min={1.1} max={2} step={0.05} onChange={setIndex} />
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={dispersion} onChange={e => setDispersion(e.target.checked)} />显示色散光谱</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={normal} onChange={e => setNormal(e.target.checked)} />显示法线</label>
        </> : <>
          <Control label="电流" value={current} min={0} max={5} step={0.5} unit=" A" onChange={setCurrent} />
          <Control label="磁感应强度" value={field} min={0} max={1} step={0.1} unit=" T" onChange={setField} />
          <Control label="线圈转角 θ" value={Math.round(angle)} min={0} max={359} unit="°" onChange={v => { setRunning(false); setAngle(v); }} />
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={reverse} onChange={e => setReverse(e.target.checked)} />反转电流方向</label>
          <button onClick={() => setRunning(r => !r)} className="w-full rounded-xl bg-cyan-400 text-slate-950 py-2.5 font-bold flex justify-center gap-2">{running ? <Pause size={18} /> : <Play size={18} />}{running ? '暂停演示' : '开始演示'}</button>
        </>}
        <button onClick={reset} className="flex items-center justify-center gap-2 w-full border border-slate-600 rounded-xl py-2 text-sm"><RotateCcw size={15} />恢复默认参数</button>
      </div>
    </div>
    <div className="grid sm:grid-cols-3 gap-3 mt-5 text-sm">
      {(optics ? [
        ['01 · 原理', 'n₁ sin i = n₂ sin r；光从空气进入折射率更高的介质时，向法线偏折。'],
        ['02 · 试一试', '增大入射角，再提高折射率，观察折射角如何变化；垂直入射时不偏折。'],
        ['03 · 色散', '不同颜色对应不同折射率，紫光偏折更明显。光谱间距为示意，不是具体玻璃的测量结果。'],
      ] : [
        ['01 · 原理', 'τ = NIAB |sin θ|。θ 为线圈法线与磁场夹角；20 匝、面积 0.01 m²。'],
        ['02 · 试一试', '把电流或磁场调为 0，观察驱动力消失；反转电流，观察旋转方向改变。'],
        ['03 · 换向器', '每半圈切换线圈电流，使驱动力保持同向。动画转速仅供演示，未求解惯性、摩擦或反电动势。'],
      ]).map(([title, body]) => <div key={title} className="rounded-xl bg-white/5 border border-white/10 p-4"><h4 className="text-cyan-300 font-semibold mb-2">{title}</h4><p className="text-slate-300 leading-relaxed text-xs">{body}</p></div>)}
    </div>
    <p className="text-[11px] text-slate-500 mt-4">教学模拟，非真实实验数据；仅用于观察物理关系。{optics && '色散采用示意折射率偏移，反射光未按菲涅耳公式计算强度。'}</p>
  </section>;
}
