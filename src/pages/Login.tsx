import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useWebCopy } from '@/i18n/web';
import { buildApiUrl } from '@/config/api';
import { ApiError, requestJson } from '@/services/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function Login({ mode = 'password' }: {
    mode?: 'password' | 'admin' | 'reviewer' | 'signup';
}) {
    const auth = useAuth();
    const { language, setLanguage } = useI18n();
    const c = useWebCopy();
    const location = useLocation();
    const signup = mode === 'signup';
    const [name, setName] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [created, setCreated] = useState(false);
    const [providers, setProviders] = useState<{ google: boolean; wechat: boolean } | null>(null);
    useEffect(() => { requestJson<{ google: boolean; wechat: boolean }>('auth/web/providers', { auth: false }).then(setProviders).catch(() => setProviders({ google: false, wechat: false })); }, []);
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
        if (signup && password !== confirmation) { setError(c('两次输入的密码不一致。', 'Passwords do not match.')); return; }
        setPending(true);
        setError('');
        try {
            if (signup) {
                await requestJson('auth/web/register', { method: 'POST', auth: false, body: { name, email: account, password, role } });
                setCreated(true); setPassword(''); setConfirmation(''); return;
            }
            const success = mode === 'reviewer' ? await auth.reviewerLogin(account.trim(), password) : await auth.login(account.trim(), password, mode === 'admin' ? 'admin' : role);
            if (!success)
                setError(c('登录信息已提交，但尚无法验证会话。请重试验证。', 'Credentials submitted, but the session could not be verified. Retry verification.'));
        }
        catch (err) {
            const user = err instanceof ApiError ? err.details.user as {
                status?: string;
            } : null;
            setError(signup && err instanceof ApiError && err.status === 409 ? c('此邮箱已有账号，请登录。', 'An account with this email already exists. Please sign in.') : err instanceof ApiError && err.status === 429 ? c('尝试次数过多，请稍后重试。', 'Too many attempts. Please try again later.') : user?.status === 'rejected' ? c('账号未获批准，请联系管理员。', 'Account rejected. Contact an administrator.') : err instanceof ApiError && err.details.status === 'pending_approval' ? c('账号正在等待管理员审核。', 'Your account is awaiting approval.') : err instanceof ApiError && err.status === 503 ? c('登录服务尚未配置。请联系管理员。', 'Login is not configured. Contact an administrator.') : c('无法登录。请检查凭据或稍后重试。', 'Unable to sign in. Check your credentials or retry later.'));
        }
        finally {
            setPending(false);
        }
    }
    return <div className="web-login">
    <section className="web-login-art"><GraduationCap size={44}/><p>EDUNET</p><h1>{c('看见成长，\n陪伴未来。', 'See growth.\nNurture tomorrow.')}</h1><p>{c('让每一天的学习，都留下清晰的足迹。', 'A clear picture of every day of learning.')}</p></section>
    <section className="web-login-panel"><Button className="web-language" variant="ghost" onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}>{language === 'zh-CN' ? 'EN' : '中文'}</Button>
      <form className="web-login-card" onSubmit={submit}>
        <p className="web-eyebrow">桐心成长 · EDUNET</p><h1>{signup ? c('创建账号', 'Create account') : mode === 'reviewer' ? c('体验账号登录', 'Reviewer sign-in') : mode === 'admin' ? c('管理员登录', 'Administrator sign-in') : c('欢迎回来', 'Welcome back')}</h1>
        <p className="text-muted-foreground">{signup ? c('注册后需等待管理员审核。', 'New accounts require administrator approval.') : c('选择登录方式，继续使用桐心成长。', 'Choose how to sign in to Edunet.')}</p>
        {(mode === 'password' || signup) && <div className="web-field"><Label htmlFor="role">{c('身份', 'Role')}</Label><select id="role" value={role} onChange={event => setRole(event.target.value as typeof role)}><option value="teacher">{c('教师', 'Teacher')}</option><option value="parent">{c('家长', 'Parent')}</option></select></div>}
        {(mode === 'password' || signup) && <div className="grid gap-2">
          <Button type="button" variant="outline" disabled={!providers?.google || pending} onClick={() => window.location.assign(buildApiUrl(`auth/web/google/start?role=${role}`))}>{c('使用 Google 继续', 'Continue with Google')}</Button>
          <Button type="button" variant="outline" disabled={!providers?.wechat || pending} onClick={() => window.location.assign(buildApiUrl(`auth/web/wechat/start?role=${role}`))}>{c('微信扫码登录', 'Sign in with WeChat QR')}</Button>
          <p className="text-xs text-muted-foreground">{c('微信将在下一页显示二维码，请使用手机微信扫描。首次登录会创建账号。', 'WeChat displays a QR code on the next page. Scan it with WeChat on your phone. First-time social sign-in creates an account.')}</p>
          {providers && (!providers.google || !providers.wechat) && <p className="text-xs text-muted-foreground">{c('灰色登录方式尚未配置，请联系管理员。', 'Disabled sign-in methods have not been configured. Contact an administrator.')}</p>}
          <p className="text-center text-sm text-muted-foreground">{c('或使用邮箱', 'Or continue with email')}</p>
        </div>}
        {created && <p role="status" className="rounded-md bg-muted p-3">{c('账号已创建！管理员审核通过后即可登录。', 'Account created! You can sign in once an administrator approves it.')} <Link className="underline" to="/login">{c('返回登录', 'Back to sign in')}</Link></p>}
        {signup && <div className="web-field"><Label htmlFor="name">{c('姓名', 'Full name')}</Label><Input id="name" autoComplete="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></div>}
        <div className="web-field"><Label htmlFor="account">{mode === 'reviewer' ? c('账号', 'Username') : c('邮箱', 'Email')}</Label><Input id="account" type={mode === 'reviewer' ? 'text' : 'email'} autoComplete="username" maxLength={mode === 'reviewer' ? 64 : 100} required value={account} onChange={event => setAccount(event.target.value)}/></div>
        <div className="web-field"><Label htmlFor="password">{c('密码', 'Password')}</Label><Input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 10 : undefined} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)}/></div>
        {signup && <><p className="text-xs text-muted-foreground">{c('密码至少需要10个字符。', 'Use at least 10 characters for your password.')}</p><div className="web-field"><Label htmlFor="confirm">{c('确认密码', 'Confirm password')}</Label><Input id="confirm" type="password" autoComplete="new-password" required maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)}/></div></>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button className="w-full" disabled={pending || created || auth.status === 'checking'}>{pending ? c('请稍候…', 'Please wait…') : signup ? c('创建账号', 'Create account') : c('登录', 'Sign in')}</Button>
        {auth.status === 'unavailable' && <Button type="button" variant="outline" onClick={() => void auth.retry()}>{c('重新验证会话', 'Retry session verification')}</Button>}
        <div className="web-login-links"><Link to={signup ? "/login" : "/signup"}>{signup ? c("已有账号？登录", "Already have an account? Sign in") : c("创建账号", "Create account")}</Link><Link to="/login">{c('账号登录', 'Account')}</Link><Link to="/admin/login">{c('管理员', 'Administrator')}</Link><Link to="/login/reviewer">{c('体验账号', 'Reviewer')}</Link></div>
      </form>
    </section>
  </div>;
}
