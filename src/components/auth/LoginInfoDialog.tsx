import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, FlaskConical, Pause, Play, Trophy, Users, X } from 'lucide-react';

const steps = [
  { title: '理论探索', icon: BookOpen, text: '从真实问题出发，在知识星系中学习物理概念，结合 AI 自学和练习巩固知识。' },
  { title: '小组协作', icon: Users, text: '加入研究小组，和同伴交流想法、分配任务，共同推进研究计划。' },
  { title: '实验项目', icon: FlaskConical, text: '通过安全准入后开展实验，记录研究过程、验证假设，让物理知识连接真实世界。' },
  { title: '成果展示', icon: Trophy, text: '整理实验结果，展示研究成果。通过学习与项目获得能量币，见证每一次进步。' },
];
export type LoginInfoTopic = '探索' | '项目' | '社区' | '帮助' | '产品介绍';
const topicText = {
  '探索': '登录后进入知识星系，沿 11 步学习路径完成理论探索、AI 自学与测验。',
  '项目': '登录后在课题中心发现研究项目。完成安全准入，与小组共同开展实验并提交成果。',
  '社区': '登录后通过小组通讯与同伴交流。组长可分配任务，全组共同推进研究进度。',
  '帮助': '学生请使用教师分配的用户名和初始密码登录；演示账号使用编号（例如 u-01），不是姓名。忘记密码请联系老师；教师与管理员请联系系统管理员重置密码。',
};

export default function LoginInfoDialog({ topic, onClose, onEnter }: { topic: LoginInfoTopic | null; onClose: () => void; onEnter: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (topic && !dialog.current?.open) dialog.current?.showModal();
    if (!topic && dialog.current?.open) dialog.current.close();
  }, [topic]);
  useEffect(() => {
    if (topic !== '产品介绍' || !playing) return;
    const timer = window.setInterval(() => setStep((value) => (value + 1) % steps.length), 15000);
    return () => window.clearInterval(timer);
  }, [topic, playing]);
  const active = steps[step];
  const Icon = active.icon;
  return (
    <dialog ref={dialog} className="login-info-dialog" aria-labelledby="login-info-title" onCancel={onClose} onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="login-info-content">
        <button type="button" className="login-dialog-close" aria-label="关闭介绍" onClick={onClose}><X size={22} /></button>
        <h2 id="login-info-title">{topic}</h2>
        {topic === '产品介绍' ? <>
          <div className="login-intro-slide" key={step}><Icon size={48} /><span>0{step + 1} / 04</span><h3>{active.title}</h3><p>{active.text}</p></div>
          <div className="login-intro-controls">
            <button type="button" aria-label="上一段" onClick={() => setStep((value) => (value + 3) % 4)}><ChevronLeft size={20} /></button>
            <button type="button" aria-label={playing ? '暂停介绍' : '播放介绍'} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
            <button type="button" aria-label="下一段" onClick={() => setStep((value) => (value + 1) % 4)}><ChevronRight size={20} /></button>
          </div>
        </> : topic && <p>{topicText[topic]}</p>}
        <button type="button" className="login-primary" onClick={() => { dialog.current?.close(); onEnter(); }}>开始探索<ArrowRight size={18} /></button>
      </div>
    </dialog>
  );
}
