import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useWebCopy } from '@/i18n/web';
import { requestJson, ApiError } from '@/services/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function ChangePassword() {
  const auth = useAuth(), c = useWebCopy(), navigate = useNavigate();
  const [currentPassword, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  if (!auth.user?.hasPassword || auth.user.isReviewer) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError(c('两次输入的密码不一致。', 'Passwords do not match.')); return; }
    setPending(true); setError('');
    try {
      await requestJson('profile/password', { method: 'PUT', body: { currentPassword, password, confirmation } });
      const destination = auth.user?.role === 'admin' ? '/admin/login' : '/login';
      auth.logout(); navigate(`${destination}?password=changed`, { replace: true });
    } catch (err) { setError(err instanceof ApiError && err.status === 400 ? c('当前密码不正确，请检查后重试。', 'Current password is incorrect. Check it and try again.') : err instanceof ApiError && err.status === 429 ? c('尝试次数过多，请稍后重试。', 'Too many attempts. Try again later.') : c('无法确认更新结果，请重新登录后再试。', 'Unable to confirm the update. Sign in again before retrying.')); }
    finally { setPending(false); }
  }
  return <form className="web-card web-form mt-6" onSubmit={submit}><h2>{c('修改密码', 'Change password')}</h2><p>{c('更新后所有旧会话将退出。', 'All existing sessions will be signed out after the change.')}</p><Label htmlFor="current-password">{c('当前密码', 'Current password')}</Label><Input id="current-password" type="password" autoComplete="current-password" required maxLength={128} disabled={pending} value={currentPassword} onChange={e => setCurrent(e.target.value)} /><Label htmlFor="new-password">{c('新密码（至少10个字符）', 'New password (at least 10 characters)')}</Label><Input id="new-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} value={password} onChange={e => setPassword(e.target.value)} /><Label htmlFor="confirm-password">{c('确认新密码', 'Confirm new password')}</Label><Input id="confirm-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} value={confirmation} onChange={e => setConfirmation(e.target.value)} />{error && <p role="alert" className="text-destructive">{error}</p>}<Button disabled={pending}>{pending ? c('请稍候…', 'Please wait…') : c('更新密码', 'Update password')}</Button></form>;
}
