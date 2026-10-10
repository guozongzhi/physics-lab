import React from "react";
import { Users, FolderKanban, CheckCircle2, FileCheck, Snowflake } from "lucide-react";
import { StatWidget } from "@/design-system/components/StatWidget";

interface TeachingKPISectionProps {
  totalStudents: number;
  totalGroups: number;
  activeProjects: number;
  doneProjects: number;
  frozenProjects: number;
  pendingQuestions: number;
  onNavigate: (path: string) => void;
}

export const TeachingKPISection: React.FC<TeachingKPISectionProps> = ({
  totalStudents,
  totalGroups,
  activeProjects,
  doneProjects,
  frozenProjects,
  pendingQuestions,
  onNavigate,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      <StatWidget
        title="学生总数"
        value={totalStudents}
        subtitle="名在册研究员"
        icon={<Users size={16} />}
        variant="interactive"
        onClick={() => onNavigate("/teacher/roster")}
      />
      <StatWidget
        title="课题小组"
        value={totalGroups}
        subtitle="个编制团队"
        icon={<FolderKanban size={16} />}
        variant="interactive"
        onClick={() => onNavigate("/teacher/groups")}
      />
      <StatWidget
        title="研发中项目"
        value={activeProjects}
        subtitle="项正在攻坚"
        icon={<FolderKanban size={16} />}
        variant="interactive"
        onClick={() => onNavigate("/projects")}
      />
      <StatWidget
        title="结题验收"
        value={doneProjects}
        subtitle="项已完成"
        icon={<CheckCircle2 size={16} className="text-growth-500" />}
        variant="interactive"
        onClick={() => onNavigate("/projects")}
      />
      <StatWidget
        title="冻结预警"
        value={frozenProjects}
        subtitle={frozenProjects > 0 ? "需老师干预" : "无异常冻结"}
        icon={<Snowflake size={16} className={frozenProjects > 0 ? "text-alert-500" : "text-slate-400"} />}
        variant={frozenProjects > 0 ? "energy" : "default"}
        onClick={() => onNavigate("/projects")}
      />
      <StatWidget
        title="待审题目"
        value={pendingQuestions}
        subtitle={pendingQuestions > 0 ? "学生提交待批" : "题库已清空"}
        icon={<FileCheck size={16} className={pendingQuestions > 0 ? "text-mission-500" : "text-slate-400"} />}
        variant={pendingQuestions > 0 ? "accent" : "default"}
        onClick={() => onNavigate("/teacher/question-bank")}
      />
    </div>
  );
};
