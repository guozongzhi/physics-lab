import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

type ClassOption = { id: string; name: string };
type Device = { id: string; name: string; enabled: boolean; allowedClassIds: string[] };
const button = 'rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function DeviceAccessCard({ device, classes, onSaved }: {
  device: Device; classes: ClassOption[]; onSaved: (device: Device) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(device.allowedClassIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const options = [...classes, ...device.allowedClassIds.filter(id => !classes.some(c => c.id === id))
    .map(id => ({ id, name: `已删除班级（${id}）` }))];
  const changed = selected.length !== device.allowedClassIds.length || selected.some(id => !device.allowedClassIds.includes(id));
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const saved = await api.patch<Device>(`/api/nfc/devices/${encodeURIComponent(device.id)}`, { allowedClassIds: selected });
      onSaved(saved); setEditing(false);
      setMessage('授权已保存，下次刷卡生效，无需重新配网或烧录。');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { setSaving(false); }
  };
  return <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-4" aria-label={`设备 ${device.name}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h4 className="break-all font-semibold text-slate-800">{device.name}</h4>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${device.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{device.enabled ? '已启用' : '已停用'}</span>
      </div>
      {!editing && <button className={`${button} bg-white`} disabled={!classes.length} onClick={() => {
        setSelected(device.allowedClassIds); setEditing(true); setError(''); setMessage('');
      }}>修改授权班级</button>}
    </div>
    {!editing ? <div className="mt-3 flex flex-wrap gap-2" aria-label="当前授权班级">
      {device.allowedClassIds.map(id => <span className="max-w-full break-all rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm text-blue-700" key={id}>{options.find(c => c.id === id)?.name || id}</span>)}
    </div> : <div className="mt-4">
      <fieldset disabled={saving} className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-slate-700">允许这台设备查询的班级</legend>
        {options.map(c => <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${selected.includes(c.id) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`} key={c.id}>
          <input type="checkbox" className="mt-0.5 shrink-0 accent-blue-600" checked={selected.includes(c.id)} onChange={e => {
            const checked = e.target.checked;
            setSelected(ids => checked ? [...ids, c.id] : ids.filter(id => id !== c.id));
            setError('');
          }} /><span className="min-w-0 break-all">{c.name}</span>
        </label>)}
      </fieldset>
      {!selected.length && <p role="alert" className="mt-2 text-sm text-amber-700">至少保留一个授权班级。</p>}
      {!device.enabled && <p className="mt-2 text-sm text-slate-500">设备已停用，修改授权后仍保持停用。</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={`${button} !border-blue-600 !bg-blue-600 !text-white`} disabled={saving || !selected.length || !changed} onClick={save}>{saving ? '正在保存…' : '保存班级授权'}</button>
        <button className={button} disabled={saving} onClick={() => { setEditing(false); setError(''); }}>取消</button>
      </div>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
  </article>;
}

export default function NfcDeviceAccess({ classes }: { classes: ClassOption[] }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setDevices(await api.get<Device[]>('/api/nfc/devices')); }
    catch (e) { setError(e instanceof Error ? e.message : '设备列表读取失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="设备班级授权">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-bold text-slate-900">设备班级授权</h3>
        <p className="mt-1 text-sm text-slate-500">选择每台终端可查询的班级，保存后下次刷卡立即生效，无需重新配网。</p>
      </div>
      <button className={button} disabled={loading} onClick={() => void load()}>{loading ? '正在读取…' : '刷新设备'}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="mt-4 text-sm text-slate-500">正在读取设备授权…</p> : <div className="mt-4 space-y-3">
      {devices?.map(device => <DeviceAccessCard key={device.id} device={device} classes={classes} onSaved={saved => setDevices(current => current?.map(d => d.id === saved.id ? saved : d) ?? null)} />)}
      {devices?.length === 0 && <p className="text-sm text-slate-500">暂无可管理的 NFC 设备。绑定班级的教师只能管理仅授权本班的设备。</p>}
    </div>}
  </section>;
}
