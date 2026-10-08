/**
 * Design Tokens for Modern Deep-Space Bento Architecture
 */

export const DESIGN_TOKENS = {
  transition: {
    fast: "duration-150 ease-out",
    normal: "duration-200 ease-in-out",
    slow: "duration-300 cubic-bezier(0.16, 1, 0.3, 1)",
  },
  radius: {
    sm: "rounded-lg",
    md: "rounded-xl",
    lg: "rounded-2xl",
    xl: "rounded-3xl",
  },
  elevation: {
    flat: "shadow-none",
    subtle: "shadow-sm border border-slate-200/80 dark:border-slate-800/80",
    card: "shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-800/80",
    floating: "shadow-xl border border-slate-200/90 dark:border-slate-700/80 backdrop-blur-xl",
  },
  zIndex: {
    base: "z-0",
    dropdown: "z-20",
    sticky: "z-30",
    overlay: "z-40",
    modal: "z-50",
    toast: "z-60",
  },
} as const;
