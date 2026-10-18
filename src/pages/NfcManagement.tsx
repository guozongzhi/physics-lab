import { useCallback, useEffect, useRef, useState } from 'react';
import { apiEnabled, getToken } from '@/lib/apiClient';

type Student = { id: string; username: string; name: string; classId: string; className: string; groupName: string };
type Card = { cardUid: string; userId: string | null; username: string; studentName: string; classId: string | null; className: string; groupName: string; status: string };
type Registry = { version: string; cards: Card[]; students: Student[]; classes: { id: string; name: string }[] };
type Row = { cardUid: string; userId: string | null };
type Change = Row & { studentName: string; previousUserId: string | null };
type Preview = { version: string; changes: Change[]; rows?: Row[]; waitingStudents?: number };
type Pending = { preview: Preview; rows?: Row[]; file?: File; allowTransfer: boolean };
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const response = await fetch(`${base}/api/nfc/registry${path}`, {
    ...init, headers: { ...init?.headers, Authorization: `Bearer ${token || ''}` },
  });
  if (getToken() !== token) throw new Error('登录账号已切换，请重新打开管理页面');
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.errors
      ? detail.errors.map((e: { row: number; message: string }) => `第 ${e.row} 行：${e.message}`).join('；')
      : Array.isArray(detail) ? '输入格式有误，请检查 UID 长度（8、14 或 20 位十六进制）和文件内容'
      : '请求失败，请检查登录状态或稍后重试');
  }
  return response;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  return (await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
}

export default function NfcManagement() {
  const [data, setData] = useState<Registry | null>(null);
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [newUids, setNewUids] = useState('');
  const [allowTransfer, setAllowTransfer] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<{ uid: string; userId: string } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    if (!apiEnabled) return;
    setData(await (await request('')).json());
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const previewRows = async (rows: Row[]) => {
    const preview = await post<Preview>('/batch', { rows, dryRun: true, expectedVersion: data?.version, allowTransfer });
    setPending({ preview, rows, allowTransfer });
  };
  const importFile = async (file: File) => {
    const response = await request(`/import?dry_run=true&allow_transfer=${allowTransfer}`, { method: 'POST', body: file });
    setPending({ preview: await response.json(), file, allowTransfer });
  };
  const apply = async () => {
    if (!pending) return;
    if (pending.file) {
      await request(`/import?dry_run=false&allow_transfer=${pending.allowTransfer}&expected_version=${pending.preview.version}`, { method: 'POST', body: pending.file });
    } else {
      await post('/batch', { rows: pending.rows, dryRun: false, expectedVersion: pending.preview.version, allowTransfer: pending.allowTransfer });
    }
    const count = pending.preview.changes.length;
    setPending(null); setEditing(null); setNewUids('');
    await load(); setMessage(`已保存 ${count} 张卡的登记信息`);
  };
  const download = async () => {
    const response = await request(`/export${classId ? `?class_id=${encodeURIComponent(classId)}` : ''}`);
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = url; a.download = 'NFC卡片登记.xlsx'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const button = 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800';
  if (!apiEnabled) return <p className="p-6 text-slate-600">NFC 管理需要连接网站后台，请使用正式网站登录。</p>;
  const students = data?.students.filter(s => !classId || s.classId === classId) || [];
  const allCards = data?.cards || [];
  const cards = allCards.filter(c => (!classId || !c.classId || c.classId === classId) &&
    `${c.cardUid} ${c.studentName} ${c.username} ${c.className}`.toLowerCase().includes(search.toLowerCase()));
  const assigned = new Set(allCards.map(c => c.userId).filter(Boolean));
  const waiting = students.filter(s => !assigned.has(s.id));
  return <section className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-bold text-slate-900">NFC 卡片管理</h2>
      <p className="mt-2 text-sm text-slate-500">登记、随机分配、换绑和挂失。导出的 Excel 可修改学生账号后重新导入，姓名及小组按网站信息查询。</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select aria-label="选择班级" className={input} value={classId} disabled={busy} onChange={e => { setClassId(e.target.value); setPending(null); setEditing(null); }}>
          <option value="">全部班级</option>{data?.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={button} disabled={busy || !data} onClick={() => run(download)}>导出 Excel</button>
        <button className={button} disabled={busy || !data} onClick={() => fileInput.current?.click()}>导入 Excel</button>
        <input type="file" accept=".xlsx" ref={fileInput} className="hidden" aria-label="导入 Excel 文件" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (file) run(() => importFile(file));
        }} />
        <button className={button} disabled={busy || !classId || !data} onClick={() => run(async () => {
          const preview = await post<Preview>('/random', { classId });
          setPending({ preview, rows: preview.rows, allowTransfer: false });
        })}>随机分配备用卡</button>
        <button className={button} disabled={busy} onClick={() => run(async () => { setPending(null); await load(); })}>刷新</button>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={allowTransfer} disabled={busy} onChange={e => { setAllowTransfer(e.target.checked); setPending(null); }} />允许将已有归属的卡片换绑给其他学生</label>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      <span>全部登记 <strong>{allCards.length}</strong> 张</span><span>备用卡 <strong>{allCards.filter(c => c.status === '备用卡').length}</strong> 张</span>
      <span>所选班级待领卡 <strong>{waiting.length}</strong> 人</span>
    </div>
    <details className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-medium text-slate-800">登记新卡 UID</summary>
      <textarea aria-label="新卡 UID" className={`${input} mt-3 min-h-24 w-full font-mono`} value={newUids} onChange={e => setNewUids(e.target.value)} placeholder="每行一个 UID，也可用空格或逗号分隔" />
      <button className={button} disabled={busy || !newUids.trim() || !data} onClick={() => run(() => previewRows(newUids.trim().split(/[\s,，]+/).map(uid => ({
        cardUid: uid.toUpperCase(), userId: allCards.find(c => c.cardUid === uid.toUpperCase())?.userId || null,
      }))))}>预览登记</button>
    </details>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="p-4"><input aria-label="搜索卡片或学生" className={`${input} w-full sm:w-80`} placeholder="搜索 UID、学生姓名或账号" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm">
        <thead className="bg-slate-50 text-slate-500"><tr>{['卡片 UID', '学生 / 账号', '班级 / 小组', '状态', '操作'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{cards.map(c => <tr key={c.cardUid}>
          <td className="px-4 py-3 font-mono text-slate-800">{c.cardUid}</td>
          <td className="px-4 py-3">{c.studentName || '未分配'}<div className="text-xs text-slate-400">{c.username}</div></td>
          <td className="px-4 py-3">{c.className || '—'}<div className="text-xs text-slate-400">{c.groupName}</div></td>
          <td className="px-4 py-3">{c.status}</td>
          <td className="px-4 py-3"><div className="flex gap-2">
            <button className={button} disabled={busy} onClick={() => setEditing({ uid: c.cardUid, userId: c.userId || '' })}>{c.userId ? '换绑' : '绑定'}</button>
            {c.userId && <button className={button} disabled={busy} onClick={() => run(() => previewRows([{ cardUid: c.cardUid, userId: null }]))}>挂失 / 解绑</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!data && !error && <p className="p-6 text-slate-500">正在读取登记信息…</p>}
      {data && !cards.length && <p className="p-6 text-slate-500">没有符合条件的卡片，请登记新卡或导入 Excel。</p>}
    </div>
    {waiting.length > 0 && <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">待领卡学生（{waiting.length} 人）</summary><p className="mt-3 text-sm text-slate-600">{waiting.map(s => `${s.name}（${s.username}）`).join('、')}</p></details>}
    {editing && !pending && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div role="dialog" aria-modal="true" aria-label="选择绑定学生" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6">
      <h3 className="font-bold">绑定卡片 {editing.uid}</h3>
      <select aria-label="选择学生" className={`${input} w-full`} value={editing.userId} onChange={e => setEditing({ ...editing, userId: e.target.value })}>
        <option value="">未分配 / 解除绑定</option>{students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.username} · {s.className}</option>)}
      </select>
      <div className="flex gap-3"><button className={button} disabled={busy} onClick={() => run(() => previewRows([{ cardUid: editing.uid, userId: editing.userId || null }]))}>预览更新</button><button className={button} disabled={busy} onClick={() => setEditing(null)}>取消</button></div>
    </div></div>}
    {pending && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div role="dialog" aria-modal="true" aria-label="确认卡片更新" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6">
      <h3 className="text-lg font-bold">确认更新 {pending.preview.changes.length} 张卡</h3>
      <p className="mt-2 text-sm text-slate-500">每名学生最多一张有效卡；分配新卡时，其旧卡自动失效。未列入本次更新的其他卡片保持原状。</p>
      {!!pending.preview.waitingStudents && <p className="mt-2 text-amber-700">本次卡片不足，仍有 {pending.preview.waitingStudents} 名学生待领卡。</p>}
      <div className="my-4 overflow-y-auto text-sm">{pending.preview.changes.map(c => <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 py-2" key={c.cardUid}><span className="font-mono">{c.cardUid}</span><span>{data?.students.find(s => s.id === c.previousUserId)?.name || '未分配'} → {c.studentName || '解除绑定 / 备用'}</span></div>)}</div>
      <div className="flex gap-3"><button className={`${button} !bg-slate-900 !text-white`} disabled={busy} onClick={() => run(apply)}>{busy ? '正在保存…' : '确认保存'}</button><button className={button} disabled={busy} onClick={() => { setPending(null); setEditing(null); }}>取消</button></div>
    </div></div>}
  </section>;
}
