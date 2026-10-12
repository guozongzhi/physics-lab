import type { Project, ProjectStatus } from '@/types';
import ProjectCard from './ProjectCard';
import { cn } from '@/lib/utils';
import { FolderKanban } from 'lucide-react';

interface KanbanColumnProps {
  title: string;
  status: ProjectStatus;
  projects: Project[];
  headerGradient: string;
  headerTextClass?: string;
  icon?: React.ReactNode;
  onMoveClick?: (project: Project) => void;
}

export default function KanbanColumn({
  title,
  projects,
  headerGradient,
  headerTextClass = 'text-white',
  icon,
  onMoveClick,
}: KanbanColumnProps) {
  return (
    <div className="kanban-col">
      <div
        className={cn(
          '-mx-3 -mt-3 mb-1 px-4 py-3 rounded-t-xl2 flex items-center justify-between shadow-sm',
          headerGradient
        )}
      >
        <div className="flex items-center gap-2">
          {icon || <FolderKanban size={16} className={headerTextClass} />}
          <h3 className={cn('font-serif font-semibold text-sm', headerTextClass)}>{title}</h3>
        </div>
        <span
          className={cn(
            'text-xs font-bold rounded-full px-2.5 py-0.5',
            headerTextClass.includes('white')
              ? 'bg-white/25 text-white'
              : 'bg-physics-900/10 text-physics-800'
          )}
        >
          {projects.length}
        </span>
      </div>
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto scroll-thin pr-0.5">
        {projects.length === 0 ? (
          <div className="text-center py-10 text-ink-400 text-sm">
            <FolderKanban size={28} className="mx-auto mb-2 opacity-40" />
            暂无项目
          </div>
        ) : (
          projects.map((p) => (
            <ProjectCard key={p.id} project={p} onMoveClick={onMoveClick} />
          ))
        )}
      </div>
    </div>
  );
}
