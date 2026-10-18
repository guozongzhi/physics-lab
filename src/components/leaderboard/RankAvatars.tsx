import { useState } from 'react';

export interface EnergyStudent {
  id: string;
  name: string;
  avatar?: string | null;
}

function StudentPortrait({ student }: { student: EnergyStudent }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initial = Array.from(student.name.trim())[0] || '同';
  const hash = Array.from(student.id).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  const hue = (hash * 137.508) % 360;
  return <span className="energy-student-avatar" role="img" aria-label={student.name} title={student.name}
    style={{ background: `hsl(${hue} 36% 46%)` }}>
    <span aria-hidden="true">{initial}</span>
    {student.avatar && student.avatar !== failedSrc && <img src={student.avatar} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(student.avatar || null)} />}
  </span>;
}

export default function RankAvatars({ students }: { students: EnergyStudent[] }) {
  if (!students.length) return null;
  return <span className="energy-student-avatars" role="group" aria-label={`学生：${students.map((student) => student.name).join('、')}`}>
    {students.map((student) => <StudentPortrait key={student.id} student={student} />)}
  </span>;
}
