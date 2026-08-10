import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildApiUrl } from '@/config/api';
import { saveAuthToken } from '@/utils/auth';

type WebAuthState = 'loading' | 'success' | 'error';

const WebAuth: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<WebAuthState>('loading');
  const [message, setMessage] = useState('正在验证网页登录...');
  const token = useMemo(() => params.get('token')?.trim() || '', [params]);

  useEffect(() => {
    let cancelled = false;

    const completeLogin = async () => {
      if (!token) {
        setState('error');
        setMessage('登录链接缺少 token，请重新打开网页入口。');
        return;
      }

      try {
        const res = await fetch(buildApiUrl('profile'), {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await res.json();

        if (!res.ok || !payload?.user) {
          throw new Error(payload?.error || '登录验证失败');
        }

        if (cancelled) return;
        saveAuthToken(token);
        localStorage.setItem('edunet-user', JSON.stringify(payload.user));
        if (payload.user.role === 'admin') {
          localStorage.setItem('adminToken', token);
        }
        setState('success');
        setMessage('登录成功，正在进入网页端...');
        window.history.replaceState({}, document.title, '/web-auth');
        window.setTimeout(() => {
          navigate(payload.user.role === 'admin' ? '/admin/dashboard' : '/dashboard', { replace: true });
        }, 350);
      } catch (error) {
        if (cancelled) return;
        setState('error');
        setMessage(error instanceof Error ? error.message : '登录验证失败，请重新获取网页入口。');
      }
    };

    completeLogin();

    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  const isLoading = state === 'loading';
  const isSuccess = state === 'success';

  return (
    <div className="min-h-screen bg-background px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isSuccess ? (
              <ShieldCheck className="h-6 w-6" />
            ) : (
              <ShieldAlert className="h-6 w-6" />
            )}
          </div>
          <CardTitle>桐心成长网页端</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        {state === 'error' && (
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              返回登录页
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default WebAuth;
