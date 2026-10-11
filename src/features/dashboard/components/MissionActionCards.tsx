import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import { BookOpen, FlaskConical, ShieldCheck, Swords, ArrowRight, Zap } from "lucide-react";

interface MissionActionCardsProps {
  onNavigate: (path: string) => void;
  theoryProgress: number;
  projectCount: number;
  safetyPassed: boolean;
  challengeCount: number;
}

export const MissionActionCards: React.FC<MissionActionCardsProps> = ({
  onNavigate,
  theoryProgress,
  projectCount,
  safetyPassed,
  challengeCount,
}) => {
  const cards = [
    {
      title: "知识星系探索",
      desc: "系统掌握电磁、力学与热学理论知识体系",
      icon: BookOpen,
      variant: "mission" as const,
      badgeText: `${theoryProgress}% 掌握`,
      badgeVariant: "mission" as const,
      rewardText: "+50 ⚡",
      path: "/theory/topics",
    },
    {
      title: "物理科研项目",
      desc: "组队开展前沿物理实验研发与课题立项",
      icon: FlaskConical,
      variant: "accent" as const,
      badgeText: `${projectCount} 个活跃`,
      badgeVariant: "nova" as const,
      rewardText: "+200 ⚡",
      path: "/projects",
    },
    {
      title: "实验安全准入",
      desc: "通过实验室仪器安全操作考核并获取准入资质",
      icon: ShieldCheck,
      variant: "growth" as const,
      badgeText: safetyPassed ? "已获资质" : "待考核",
      badgeVariant: safetyPassed ? ("growth" as const) : ("alert" as const),
      rewardText: "+100 ⚡",
      path: "/safety-lab",
    },
    {
      title: "科研小组对抗",
      desc: "跨组发布学术挑战、参与攻防抢夺悬赏",
      icon: Swords,
      variant: "energy" as const,
      badgeText: `${challengeCount} 场对抗`,
      badgeVariant: "energy" as const,
      rewardText: "+150 ⚡",
      path: "/theory/challenges",
    },
  ];

  return (
    <div className="mission-action-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <BentoCard
            key={c.title}
            variant="interactive"
            padding="md"
            onClick={() => onNavigate(c.path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onNavigate(c.path);
              }
            }}
            role="link"
            tabIndex={0}
            aria-label={`进入${c.title}`}
            className="flex flex-col justify-between group"
          >
            <div>
              <div className="mission-action-top flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:scale-105 transition-transform">
                  <Icon size={20} />
                </div>
                <Badge variant={c.badgeVariant} size="sm">
                  {c.badgeText}
                </Badge>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-mission-600 dark:group-hover:text-mission-400 transition-colors">
                {c.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                {c.desc}
              </p>
            </div>

            <div className="mission-action-foot mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="font-semibold text-energy-600 dark:text-energy-400 flex items-center gap-1">
                <Zap size={12} /> {c.rewardText}
              </span>
              <span className="text-slate-400 group-hover:text-mission-500 flex items-center gap-1 group-hover:translate-x-0.5 transition-all">
                进入 <ArrowRight size={13} />
              </span>
            </div>
          </BentoCard>
        );
      })}
    </div>
  );
};
