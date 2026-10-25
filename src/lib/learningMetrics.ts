import type { QuizSession } from '@/types';

/** A topic is complete only after this student has a graded, passed quiz. */
export function topicCompletion(sessions: QuizSession[], userId: string | null, topicIds: string[], serverScoped = false) {
  const completed = new Set(sessions.filter((session) =>
    session.graded && session.passed &&
    (session.userId === userId || (serverScoped && !session.userId)) && topicIds.includes(session.topicId)
  ).map((session) => session.topicId));
  return { completed, percent: topicIds.length ? Math.round(completed.size / topicIds.length * 100) : 0 };
}
