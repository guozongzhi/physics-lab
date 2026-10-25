import { useLocale } from '@/i18n/useLocale';
import { useId, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Rocket, UserRound } from 'lucide-react';

interface LoginCredentialsProps {
  teacher?: boolean;
  identifier: string;
  password: string;
  onIdentifierChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
  onForgotPassword: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
}

export default function LoginCredentials({ teacher = false, identifier, password, onIdentifierChange,
  onPasswordChange, remember, onRememberChange, onForgotPassword, onSubmit, submitting, error }: LoginCredentialsProps) {
  const { tx } = useLocale();
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form className="login-credentials" onSubmit={(event) => { event.preventDefault(); if (!submitting) onSubmit(); }}>
      <div className="login-field">
        <label className="sr-only" htmlFor={`${id}-username`}>{tx("用户名 / 邮箱")}</label>
        <div className="login-field-control">
          <UserRound size={20} aria-hidden="true" />
          <input id={`${id}-username`} type="text" autoComplete="username" value={identifier}
            placeholder={tx("用户名 / 邮箱")} onChange={(event) => onIdentifierChange(event.target.value)}
            aria-describedby={`${id}-username-hint`} />
        </div>
        <p id={`${id}-username-hint`}>{teacher ? tx("请输入教师或管理员用户名") : tx("请输入注册的用户名或邮箱")}</p>
      </div>
      <div className="login-field">
        <label className="sr-only" htmlFor={`${id}-password`}>{tx("密码")}</label>
        <div className="login-field-control">
          <LockKeyhole size={20} aria-hidden="true" />
          <input id={`${id}-password`} type={showPassword ? 'text' : 'password'} autoComplete="current-password"
            placeholder={tx("密码")} value={password} onChange={(event) => onPasswordChange(event.target.value)}
            aria-describedby={error ? `${id}-error` : `${id}-password-hint`} aria-invalid={Boolean(error)} />
          <button type="button" aria-label={showPassword ? tx("隐藏密码") : tx("显示密码")} aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        <p id={`${id}-password-hint`}>{tx("请输入密码")}</p>
      </div>
      <div className="login-options">
        <label><input type="checkbox" checked={remember} onChange={(event) => onRememberChange(event.target.checked)} />{tx("下次自动登录")}</label>
        <button type="button" onClick={onForgotPassword}>{tx("忘记密码?")}</button>
      </div>
      {error && <p role="alert" id={`${id}-error`} className="login-error">{tx(error)}</p>}
      <button type="submit" className="login-primary" disabled={submitting}>
        <Rocket size={24} aria-hidden="true" />{submitting ? tx("登录中…") : teacher ? tx("登录并进入教师指挥台") : tx("登录并进入指挥中心")}<ArrowRight size={19} aria-hidden="true" />
      </button>
    </form>
  );
}
