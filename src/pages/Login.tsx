import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useWebCopy } from '@/i18n/web';
import { ApiError } from '@/services/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function Login({ mode = 'password' }: {
    mode?: 'password' | 'admin' | 'reviewer';
}) {
    const auth = useAuth();
    const { language, setLanguage } = useI18n();
    const c = useWebCopy();
    const location = useLocation();
    const [account, setAccount] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'teacher' | 'parent'>('teacher');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const from = location.state?.from;
    if (auth.isAuthenticated)
        return <Navigate replace to={typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard'}/>;
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setPending(true);
        setError('');
        try {
            const success = mode === 'reviewer' ? await auth.reviewerLogin(account.trim(), password) : await auth.login(account.trim(), password, mode === 'admin' ? 'admin' : role);
            if (!success)
                setError(c('登录信息已提交，但尚无法验证会话。请重试验证。', 'Credentials submitted, but the session could not be verified. Retry verification.'));
        }
        catch (err) {
            const user = err instanceof ApiError ? err.details.user as {
                status?: string;
            } : null;
            setError(user?.status === 'rejected' ? c('账号未获批准，请联系管理员。', 'Account rejected. Contact an administrator.') : err instanceof ApiError && err.details.status === 'pending_approval' ? c('账号正在等待管理员审核。', 'Your account is awaiting approval.') : err instanceof ApiError && err.status === 503 ? c('登录服务尚未配置。请联系管理员。', 'Login is not configured. Contact an administrator.') : c('无法登录。请检查凭据或稍后重试。', 'Unable to sign in. Check your credentials or retry later.'));
        }
        finally {
            setPending(false);
        }
    }
    return <div className="web-login">
    <section className="web-login-art"><GraduationCap size={44}/><p>EDUNET</p><h1>{c('看见成长，\n陪伴未来。', 'See growth.\nNurture tomorrow.')}</h1><p>{c('让每一天的学习，都留下清晰的足迹。', 'A clear picture of every day of learning.')}</p></section>
    <section className="web-login-panel"><Button className="web-language" variant="ghost" onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}>{language === 'zh-CN' ? 'EN' : '中文'}</Button>
      <form className="web-login-card" onSubmit={submit}>
        <p className="web-eyebrow">桐心成长 · EDUNET</p><h1>{mode === 'reviewer' ? c('体验账号登录', 'Reviewer sign-in') : mode === 'admin' ? c('管理员登录', 'Administrator sign-in') : c('欢迎回来', 'Welcome back')}</h1>
        <p className="text-muted-foreground">{c('使用现有账号继续。', 'Continue with your existing account.')}</p>
        {mode === 'password' && <div className="web-field"><Label htmlFor="role">{c('身份', 'Role')}</Label><select id="role" value={role} onChange={event => setRole(event.target.value as typeof role)}><option value="teacher">{c('教师', 'Teacher')}</option><option value="parent">{c('家长', 'Parent')}</option></select></div>}
        <div className="web-field"><Label htmlFor="account">{mode === 'reviewer' ? c('账号', 'Username') : c('邮箱', 'Email')}</Label><Input id="account" type={mode === 'reviewer' ? 'text' : 'email'} autoComplete="username" maxLength={mode === 'reviewer' ? 64 : 100} required value={account} onChange={event => setAccount(event.target.value)}/></div>
        <div className="web-field"><Label htmlFor="password">{c('密码', 'Password')}</Label><Input id="password" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={event => setPassword(event.target.value)}/></div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button className="w-full" disabled={pending || auth.status === 'checking'}>{pending ? c('登录中…', 'Signing in…') : c('登录', 'Sign in')}</Button>
        {auth.status === 'unavailable' && <Button type="button" variant="outline" onClick={() => void auth.retry()}>{c('重新验证会话', 'Retry session verification')}</Button>}
        <div className="web-login-links"><Link to="/login">{c('账号登录', 'Account')}</Link><Link to="/admin/login">{c('管理员', 'Administrator')}</Link><Link to="/login/reviewer">{c('体验账号', 'Reviewer')}</Link></div>
        <p className="text-sm text-muted-foreground">{c('微信账号请继续使用小程序。网页登录接入尚未开放。', 'For WeChat accounts, continue using the mini program. Browser WeChat sign-in is not available yet.')}</p>
      </form>
    </section>
  </div>;
}
