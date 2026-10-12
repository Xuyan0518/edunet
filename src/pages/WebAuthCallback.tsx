import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useWebCopy } from '@/i18n/web';
export default function WebAuthCallback() {
  const auth = useAuth();
  const c = useWebCopy();
  const [params] = useSearchParams();
  const [result, setResult] = useState(params.get('result') || 'failed');
  const started = useRef(false);
  useEffect(() => {
    if (result !== 'success' || started.current) return;
    started.current = true;
    void auth.socialLogin().then(ok => { if (!ok) setResult('failed'); }).catch(() => setResult('failed'));
  }, [auth, result]);
  if (auth.isAuthenticated) return <Navigate to="/dashboard" replace/>;
  const messages: Record<string, string> = {
    success: c('正在完成登录…', 'Completing sign-in…'),
    pending_approval: c('账号已创建，正在等待管理员审核。审核通过后请再次登录。', 'Your account is awaiting administrator approval. Sign in again once approved.'),
    rejected: c('账号未获批准，请联系管理员。', 'Your account was rejected. Contact an administrator.'),
    cancelled: c('登录已取消，可以重试。', 'Sign-in was cancelled. You can try again.'),
    account_exists: c('此邮箱已有账号，请使用邮箱和密码登录。', 'An account with this email already exists. Sign in with your email and password.'),
    account_not_found: c('此登录身份尚无管理员权限，请联系管理员。', 'This sign-in identity has no administrator role. Contact your administrator.'),
    failed: c('登录未完成或已过期，请重试。', 'Sign-in failed or expired. Please try again.'),
  };
  return <div className="web-state"><h1>{c('账号登录', 'Account sign-in')}</h1><p role="status">{messages[result] || messages.failed}</p><Link className="underline" to="/login">{c('返回登录', 'Back to sign in')}</Link></div>;
}
