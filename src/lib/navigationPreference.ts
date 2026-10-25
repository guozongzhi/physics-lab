export const NAV_COLLAPSED_KEY = 'physicslab.navCollapsed';

export function readNavCollapsed(): boolean {
  try { return localStorage.getItem(NAV_COLLAPSED_KEY) === 'true'; }
  catch { return false; }
}

export function saveNavCollapsed(collapsed: boolean): void {
  try { localStorage.setItem(NAV_COLLAPSED_KEY, String(collapsed)); }
  catch { /* Navigation still works when storage is unavailable. */ }
}
