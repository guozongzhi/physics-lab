import { useId, useState } from 'react';
import { Coins, Trophy, Users } from 'lucide-react';
import RankAvatars, { type EnergyStudent } from './RankAvatars';
import './energy-ladder.css';

export interface EnergyRank {
  id: string;
  name: string;
  coins: number;
  memberCount?: number;
  students?: EnergyStudent[];
}
interface EnergyLadderProps {
  rows: EnergyRank[];
  highlightId?: string | null;
  metric?: string;
  compact?: boolean;
  personal?: boolean;
}
const honors = ['冠军', '亚军', '季军'];
const number = (value: number) => value.toLocaleString('zh-CN');
const podiumNumber = (value: number) => Math.abs(value) >= 10000
  ? new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  : number(value);

function Award({ rank, uid }: { rank: number; uid: string }) {
  const colors = rank === 1 ? ['#fff2b3', '#edb848', '#a86a18'] : rank === 2 ? ['#f5faff', '#abc1db', '#6280a2'] : ['#ffe4c7', '#dca67a', '#9b6040'];
  return <svg viewBox="0 0 88 88" className="energy-ladder-award" aria-hidden="true">
    <defs><linearGradient id={uid} x1="0" y1="0" x2="1" y2="1"><stop stopColor={colors[0]} /><stop offset=".3" stopColor={colors[1]} /><stop offset=".48" stopColor={colors[0]} /><stop offset=".7" stopColor={colors[1]} /><stop offset="1" stopColor={colors[2]} /></linearGradient></defs>
    {rank === 1 ? <>
      <path d="M27 22H14v11c0 13 10 20 23 20M61 22h13v11c0 13-10 20-23 20" fill="none" stroke={colors[2]} strokeWidth="7" />
      <path d="M27 20H14v11c0 13 10 20 23 20M61 20h13v11c0 13-10 20-23 20" fill="none" stroke={colors[1]} strokeWidth="4" />
      <path d="M24 14h40l-4 26c-1 11-8 18-16 18s-15-7-16-18Z" fill={`url(#${uid})`} stroke={colors[0]} strokeWidth=".8" />
      <path d="M30 19h5l3 29c-5-4-6-13-8-29" fill="#fff" opacity=".35" />
      <path d="M40 56h8v14h11v7H29v-7h11Z" fill={`url(#${uid})`} />
      <path d="m44 26 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#fff2c1" />
      <path d="M28 78h32" stroke={colors[2]} strokeWidth="3" strokeLinecap="round" />
    </> : <>
      <path d="M26 8 44 16 62 8 57 38 44 31 31 38Z" fill={rank === 2 ? '#7699c1' : '#b57d57'} />
      <path d="M31 10 44 16 57 10 53 31 44 27 35 31Z" fill={rank === 2 ? '#b8d2ed' : '#f0bc90'} />
      <circle cx="44" cy="53" r="25" fill={colors[2]} />
      <circle cx="44" cy="50" r="25" fill={`url(#${uid})`} stroke={colors[0]} />
      <circle cx="44" cy="50" r="19" fill="none" stroke={colors[0]} strokeOpacity=".75" />
      <text x="44" y="59" textAnchor="middle" fill={colors[2]} fontSize="26" fontWeight="800" fontFamily="inherit">{rank}</text>
    </>}
  </svg>;
}

export default function EnergyLadder({ rows, highlightId, metric = '小组能量', compact = false, personal = false }: EnergyLadderProps) {
  const uid = useId().replace(/:/g, '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => b.coins - a.coins);
  const selected = sorted.find((r) => r.id === selectedId) || sorted.find((r) => r.id === highlightId) || sorted[0];
  const myIndex = sorted.findIndex((r) => r.id === highlightId);
  if (!sorted.length) return <div className="energy-ladder-empty"><Trophy size={28} /><p>暂无排名数据</p></div>;
  return <div className={`energy-ladder${compact ? ' energy-ladder--compact' : ''}`}>
    {myIndex >= 0 && <div className="energy-ladder-standing">
      <span><Trophy size={16} />{personal ? '我的名次' : '我的小组'} <strong>第 {myIndex + 1} 名</strong></span>
      <span>{myIndex === 0 ? '当前位居榜首' : sorted[myIndex - 1].coins === sorted[myIndex].coins ? '与前一名能量相同' : `距前一名 ${number(sorted[myIndex - 1].coins - sorted[myIndex].coins)} ⚡`}</span>
    </div>}
    <div className="energy-ladder-stage">
      <div className="energy-ladder-stage-caption"><span>荣耀领奖台</span><span>{metric}</span></div>
      <div className="energy-ladder-podium" role="group" aria-label={`${metric}前三名领奖台，台阶表示名次`}>
        {sorted.slice(0, 3).map((row, i) => <button type="button" key={row.id}
          className={`energy-ladder-column energy-ladder-place--${i + 1}${row.id === highlightId ? ' is-mine' : ''}${selected.id === row.id ? ' is-selected' : ''}`}
          aria-label={`${honors[i]}，第${i + 1}名，${row.name}，${metric}${number(row.coins)}`}
          aria-pressed={selected.id === row.id} onClick={() => setSelectedId(row.id)}>
          <div className="energy-ladder-contender">
            <div className={`energy-ladder-contender-visual${personal && row.students?.length ? ' is-personal' : ''}`}>
              <Award rank={i + 1} uid={`${uid}-award-${i}`} />
              {!!row.students?.length && <RankAvatars students={row.students} />}
            </div>
            <span className="energy-ladder-contender-name" title={row.name}>{row.name}</span>
            <span className="energy-ladder-contender-score" title={`${number(row.coins)} 能量币`}><span className="energy-ladder-coin" aria-hidden="true">ϟ</span>{podiumNumber(row.coins)}</span>
          </div>
          <div className="energy-ladder-step"><span className="energy-ladder-step-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><span>{honors[i]}</span></div>
        </button>)}
      </div>
      <div className="energy-ladder-detail" aria-live="polite" aria-atomic="true">
        <span className="energy-ladder-detail-name">{selected.name}</span>
        <span>{selected.memberCount !== undefined && <><Users size={12} /> {selected.memberCount} 人 <span className="energy-ladder-divider" /></>}<Coins size={15} aria-hidden="true" /><strong>{number(selected.coins)}</strong></span>
      </div>
    </div>
    <div className="energy-ladder-list-heading"><span>{compact ? (personal ? '个人排名' : '小组排名') : '完整排名'}</span><span>{sorted.length} {personal ? '位研究员' : '个小组'}</span></div>
    <ol className="energy-ladder-list" aria-label={`${metric}${compact ? '排名摘要' : '完整排名'}`}>
      {sorted.map((row, index) => compact && index >= 5 && row.id !== highlightId ? null : <li key={row.id}>
        <button type="button" className={`energy-ladder-row${row.id === highlightId ? ' is-mine' : ''}${row.id === selected.id ? ' is-active' : ''}`} aria-pressed={row.id === selected.id} onClick={() => setSelectedId(row.id)}>
          <span className={`energy-ladder-rank energy-ladder-rank--${Math.min(index + 1, 4)}`} aria-label={honors[index] || `第${index + 1}名`}>{String(index + 1).padStart(2, '0')}</span>
          {!!row.students?.length && <span className="energy-ladder-row-avatars"><RankAvatars students={row.students} /></span>}
          <span className="energy-ladder-row-name">{row.name}{row.id === highlightId && <small>{personal ? '我' : '我的小组'}</small>}</span>
          {row.memberCount !== undefined && !compact && <span className="energy-ladder-members">{row.memberCount} 人</span>}
          <span className="energy-ladder-score">{number(row.coins)}<Coins size={14} aria-hidden="true" /></span>
        </button>
      </li>)}
    </ol>
  </div>;
}
