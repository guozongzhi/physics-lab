import type { Project } from '@/types';
import { useGroupStore } from '@/store/groupStore';
import { useNavigate } from 'react-router-dom';
import ProgressRing from '@/components/ui/ProgressRing';
import CoinBadge from '@/components/ui/CoinBadge';
import AvatarStack from '@/components/ui/AvatarStack';
import { ArrowRightLeft, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
  onMoveClick?: (project: Project) => void;
}

const statusColorMap: Record<string, string> = {
  electric: 'chip-physics',
  thermal: 'chip-energy',
  optical: 'chip-lab',
  mechanical: 'chip-ink',
  radiation: 'chip-risk',
  chemical: 'chip-risk',
  combined: 'chip-energy',
};

export default function ProjectCard({ project, onMoveClick }: ProjectCardProps) {
  const navigate = useNavigate();
  const getGroupById = useGroupStore((s) => s.getGroupById);
  const getGroupUsers = useGroupStore((s) => s.getGroupUsers);
  const group = getGroupById(project.ownerGroupId);
  const members = getGroupUsers(project.ownerGroupId);
  const isFrozen = project.status === 'frozen';

  const categories = Array.from(new Set(project.equipmentList.map((e) => e.category))).slice(0, 3);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-nav]')) return;
    navigate(`/projects/${project.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'card-base card-hover cursor-pointer relative overflow-hidden',
        isFrozen && 'ring-2 ring-risk-300'
      )}
    >
      {isFrozen && (
        <div className="absolute top-0 right-0 bg-grad-risk text-white text-[11px] font-bold px-2 py-1 rounded-bl-xl2 flex items-center gap-1 z-10">
          <Snowflake size={12} />
          冻结
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif font-semibold text-physics-800 text-base leading-snug pr-6">
            {project.title}
          </h3>
          {onMoveClick && (
            <button
              data-no-nav
              onClick={(e) => {
                e.stopPropagation();
                onMoveClick(project);
              }}
              className="flex-shrink-0 text-ink-400 hover:text-physics-500 hover:bg-physics-50 p-1.5 rounded-lg transition"
              title="移动到列"
            >
              <ArrowRightLeft size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <AvatarStack users={members.slice(0, 4)} size={24} max={3} />
          <ProgressRing value={project.progress} size={40} strokeWidth={4} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <span
              key={cat}
              className={cn('text-[10.5px]', statusColorMap[cat] || 'chip-ink')}
            >
              {cat}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px] text-ink-500">{group?.name || '未分配'}</span>
          <CoinBadge value={project.rewardCoins} size="sm" />
        </div>
      </div>
    </div>
  );
}
