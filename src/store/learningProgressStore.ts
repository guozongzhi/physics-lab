import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LearningProgressState {
  visits: Record<string, Record<string, boolean>>;
  masteredNodes: Record<string, Record<string, boolean>>;
  toggleMastered: (userId: string, nodeId: string) => void;
  markVisited: (userId: string, step: 'ai_learn' | 'knowledge_organize') => void;
}

// Browsing progress is a device-local checklist; assessment results remain in the API.
export const useLearningProgressStore = create<LearningProgressState>()(persist(
  (set) => ({
    visits: {},
    masteredNodes: {},
    toggleMastered: (userId, nodeId) => set((state) => ({
      masteredNodes: { ...state.masteredNodes, [userId]: { ...state.masteredNodes[userId], [nodeId]: !state.masteredNodes[userId]?.[nodeId] } },
    })),
    markVisited: (userId, step) => set((state) => {
      if (state.visits[userId]?.[step]) return state;
      return { visits: { ...state.visits, [userId]: { ...state.visits[userId], [step]: true } } };
    }),
  }),
  { name: 'plab_learning_visits' }
));
