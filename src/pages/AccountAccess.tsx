import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWebCopy } from '@/i18n/web';
import { requestJson, ApiError } from '@/services/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
type Mode = 'forgot' | 'verify-request' | 'reset' | 'verify';
export default function AccountAccess({ mode }: { mode: Mode }) {
  const c = useWebCopy();
  const [token] = useState(() => window.location.hash.slice(1));
  const [role, setRole] = useState(() => { const selected = new URLSearchParams(window.location.search).get('role'); return selected === 'admin' || selected === 'parent' ? selected : 'teacher'; });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const needsLink = mode === 'reset' || mode === 'verify';
  const validLink = /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'reset' && password !== confirmation) { setError(c('两次输入的密码不一致。', 'Passwords do not match.')); return; }
    setPending(true); setError('');
    try {
      const endpoint = mode === 'forgot' ? 'forgot-password' : mode === 'verify-request' ? 'resend-verification' : mode === 'reset' ? 'reset-password' : 'verify-email';
      const result = await requestJson<{ role?: string }>(`auth/web/${endpoint}`, { method: 'POST', auth: false, body: needsLink ? { token, ...(mode === 'reset' ? { password, confirmation } : {}) } : { role, email } });
      if (result.role) setRole(result.role);
      setDone(true); setPassword(''); setConfirmation('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? c('请求次数过多，请稍后重试。', 'Too many requests. Try again later.') : err instanceof ApiError && err.status === 503 ? c('邮箱服务暂不可用，请稍后重试或联系管理员。', 'Email delivery is unavailable. Try again later or contact your administrator.') : needsLink && err instanceof ApiError && err.status === 400 ? c('链接无效、已过期或已使用，请申请新链接。', 'This link is invalid, expired or already used. Request a new link.') : c('无法完成请求，请稍后重试。', 'Unable to complete this request. Try again later.'));
    } finally { setPending(false); }
  }
  const title = mode === 'forgot' ? c('找回密码', 'Forgot password') : mode === 'reset' ? c('重设密码', 'Reset password') : c('验证邮箱', 'Verify email');
  return <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30"><form className="web-login-card web-card w-full max-w-lg space-y-4" onSubmit={submit}>
    <p className="web-eyebrow">桐心成长 · EDUNET</p><h1 className="text-2xl font-semibold">{title}</h1>
    <p>{mode === 'forgot' || mode === 'verify-request' ? c('选择账号身份并填写邮箱。Google 或微信账号请使用原登录方式。', 'Choose your account role and enter your email. For Google or WeChat accounts, use your original sign-in method.') : mode === 'reset' ? c('新密码至少10个字符。更新后所有旧会话将退出，请重新登录。', 'Use at least 10 characters. All existing sessions will be signed out; sign in again afterward.') : c('确认此邮箱属于您。验证后仍需管理员审核才能使用账号。', 'Confirm that you own this email. Administrator approval is still required to use the account.')}</p>
    {done ? <p role="status" className="rounded bg-muted p-3">{mode === 'reset' ? c('密码已更新，请重新登录。', 'Password updated. Please sign in again.') : mode === 'verify' ? c('邮箱已验证。如账号已获批准，即可登录。', 'Email verified. You can sign in if your account has been approved.') : c('如果此邮箱对应符合条件的账号，您将收到邮件。请检查收件箱及垃圾邮件文件夹。', 'If this email matches an eligible account, you will receive an email. Check your inbox and spam folder.')}</p> : <>
      {!needsLink && <><Label htmlFor="access-role">{c('身份', 'Role')}</Label><select id="access-role" className="w-full border rounded p-2" disabled={pending} value={role} onChange={e => setRole(e.target.value)}><option value="teacher">{c('教师', 'Teacher')}</option><option value="parent">{c('家长', 'Parent')}</option><option value="admin">{c('管理员', 'Administrator')}</option></select><Label htmlFor="access-email">{c('邮箱', 'Email')}</Label><Input id="access-email" type="email" autoComplete="email" required maxLength={100} disabled={pending} value={email} onChange={e => setEmail(e.target.value)} /></>}
      {mode === 'reset' && validLink && <><Label htmlFor="access-password">{c('新密码', 'New password')}</Label><Input id="access-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} value={password} onChange={e => setPassword(e.target.value)} /><Label htmlFor="access-confirm">{c('确认密码', 'Confirm password')}</Label><Input id="access-confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></>}
      {needsLink && !validLink && <p role="alert">{c('请从邮件中的完整链接打开此页面。', 'Open this page using the complete link in your email.')}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button className="w-full" disabled={pending || (needsLink && !validLink)}>{pending ? c('请稍候…', 'Please wait…') : mode === 'verify' ? c('确认验证邮箱', 'Confirm email verification') : mode === 'reset' ? c('更新密码', 'Update password') : c('发送邮件', 'Send email')}</Button>
    </>}
    <div className="flex flex-wrap gap-4"><Link className="underline" to={role === 'admin' ? '/admin/login' : `/login?role=${role}`}>{c('返回登录', 'Back to sign in')}</Link>{mode === 'reset' && <Link className="underline" to={`/forgot-password?role=${role}`}>{c('申请新链接', 'Request a new link')}</Link>}{mode === 'verify' && <Link className="underline" to={`/resend-verification?role=${role}`}>{c('重新发送验证邮件', 'Resend verification email')}</Link>}</div>
  </form></main>;
}
