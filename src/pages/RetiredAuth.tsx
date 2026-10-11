import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useWebCopy } from '@/i18n/web';
export default function RetiredAuth() {
    const c = useWebCopy();
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => { if (location.search || location.hash)
        navigate(location.pathname, { replace: true }); }, [location, navigate]);
    return <div className="web-state"><h1>{c('请使用现有账号登录', 'Sign in with your existing account')}</h1><p>{c('网页注册、邮件验证、修改密码和旧式登录链接已停止使用。微信账号请在小程序中登录或联系管理员。', 'Web registration, email verification, password changes and legacy login links are retired. For WeChat accounts, use the mini program or contact an administrator.')}</p><Link className="underline" to="/login">{c('返回登录', 'Back to sign-in')}</Link></div>;
}
