import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useWebCopy } from '@/i18n/web';
export default function RetiredAuth() {
    const c = useWebCopy();
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => { if (location.search || location.hash)
        navigate(location.pathname, { replace: true }); }, [location, navigate]);
    return <div className="web-state"><h1>{c('请使用现有账号登录', 'Sign in with your existing account')}</h1><p>{c('此验证链接已停止使用。请返回登录页面。', 'This verification link is no longer supported. Please return to sign-in.')}</p><Link className="underline" to="/login">{c('返回登录', 'Back to sign-in')}</Link></div>;
}
