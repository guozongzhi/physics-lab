import type { Challenge, Question } from '@/types';

export function challengeQuestions(challenge: Challenge | undefined, questions: Question[], now = Date.now()): Question[] {
  if (!challenge) throw new Error('挑战不存在或已下架，请返回挑战列表。');
  const deadline = new Date(challenge.deadline).getTime();
  if (challenge.status !== 'open' || !Number.isFinite(deadline) || deadline <= now)
    throw new Error('挑战已结束，请选择其他挑战。');
  const selected = challenge.questionIds.map((id) => questions.find((question) => question.id === id));
  if (!selected.length || selected.some((question) => !question || question.topicId !== challenge.topicId || question.safetyCategory))
    throw new Error('挑战题目不完整或与主题不符，请联系教师检查。');
  if (new Set(challenge.questionIds).size !== selected.length)
    throw new Error('挑战存在重复题目，请联系教师检查。');
  return selected as Question[];
}
