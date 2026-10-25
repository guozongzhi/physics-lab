import { useLocale } from '@/i18n/useLocale';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import MissionShell from '@/components/layout/MissionShell';

export default function AppShell({ requireAuth = true }: { requireAuth?: boolean }) {
  const { tx } = useLocale();
  return (
    <MissionShell requireAuth={requireAuth}>
      <Suspense fallback={<div className="p-6 text-ink-500" role="status">{tx("页面加载中…")}</div>}>
        <Outlet />
      </Suspense>
    </MissionShell>
  );
}
