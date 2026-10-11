import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { can, type Capability } from './permissions';
import { Button } from '@/components/ui/button';
import { useWebCopy } from '@/i18n/web';
export function RouteGuard({ capability }: {
    capability?: Capability;
}) {
    const { status, user, retry, logout } = useAuth();
    const location = useLocation();
    const c = useWebCopy();
    if (status === 'checking')
        return <div className="web-state" role="status">{c('正在验证登录…', 'Checking session…')}</div>;
    if (status === 'unavailable')
        return <div className="web-state" role="alert"><p>{c('暂时无法验证登录。请重试。', 'Session verification is unavailable. Please retry.')}</p><Button onClick={() => void retry()}>{c('重试', 'Retry')}</Button><Button variant="ghost" onClick={logout}>{c('退出登录', 'Sign out')}</Button></div>;
    if (status !== 'authenticated')
        return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace/>;
    if (capability && !can(user, capability))
        return <div className="web-state" role="alert">{c('没有访问权限。', 'Access denied.')}</div>;
    return <Outlet />;
}
