/**
 * 挑战奖励计价：按所选题目各自的难度累加。
 *
 * ⚠️ 这与后端 `services.challenge_reward_for` 是**同一公式的两个副本**：
 * 前端这份只用于「创建前的预览」和「离线模式兜底」，**权威值由后端计算**。
 * 学生不能自己填奖励——若信前端传来的值，改个请求体就能自定奖励。
 * 改动单价档位时，两边都要改。
 */
import type { ClassMeta, Question } from '../types';

/** 难度 1/2/3 对应简单/中等/困难；越界值向最近档收拢（与后端一致）。 */
export function challengeRewardFor(questions: Question[], meta: ClassMeta): number {
  const rates: Record<number, number> = {
    1: meta.coinEasy,
    2: meta.coinMedium,
    3: meta.coinHard,
  };
  return questions.reduce((sum, q) => {
    const lv = Math.min(3, Math.max(1, q.difficulty || 1));
    return sum + (rates[lv] ?? 0);
  }, 0);
}
