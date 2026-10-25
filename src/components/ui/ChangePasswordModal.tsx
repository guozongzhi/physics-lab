/**
 * 修改密码弹窗（学生/教师通用）。
 *
 * 从 ResearchProfile 里整块搬出来做成公共组件，因为首页那条「还在用初始密码」的
 * 提示也要能直接打开它。
 *
 * 改成功后除了提示，还要清掉 authStore 里的 `isDefaultPassword` —— 否则首页
 * 会一直显示「你还在使用初始密码」。
 */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { authApi } from '@/lib/apiService';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import Dialog from '@/components/ui/Dialog';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const pushToast = useUIStore((s) => s.pushToast);
  const markPasswordChanged = useAuthStore((s) => s.markPasswordChanged);

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!oldPwd || !newPwd) {
      setErr('请填写原密码与新密码');
      return;
    }
    if (newPwd.length < 6) {
      setErr('新密码至少 6 位');
      return;
    }
    if (newPwd !== confirmPwd) {
      setErr('两次输入的新密码不一致');
      return;
    }
    // 允许「改成和原密码一样」会让首页提示与服务端状态对不上：
    // 本地以为改好了，下次登录服务端又会说"还在用初始密码"。
    if (newPwd === oldPwd) {
      setErr('新密码不能与原密码相同');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await authApi.changePassword(oldPwd, newPwd);
      markPasswordChanged();
      pushToast('密码已修改，下次请用新密码登录', 'success');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '修改失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <Lock size={18} className="text-mission-500" />
          修改密码
        </span>
      }
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>
            取消
          </button>
          <button className="btn-mission flex-1" onClick={submit} disabled={busy}>
            {busy ? '提交中…' : '确认修改'}
          </button>
        </>
      }
    >
      <p className="text-[12px] text-ink-500 mb-4">修改后请用新密码登录</p>
      <div className="space-y-3">
        <input
          data-dialog-autofocus
          type="password"
          placeholder="原密码"
          className="input"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
        />
        <input
          type="password"
          placeholder="新密码（至少 6 位）"
          className="input"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
        />
        <input
          type="password"
          placeholder="确认新密码"
          className="input"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
        />
        {err && <p className="text-[12px] text-danger-600">{err}</p>}
      </div>
    </Dialog>
  );
}
