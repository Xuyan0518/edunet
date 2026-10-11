import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWebCopy } from '@/i18n/web';
import { requestJson } from '@/services/http';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
export default function Profile() {
    const { user, refreshProfile } = useAuth();
    const c = useWebCopy();
    const loaded = user.displayName || user.name;
    const [name, setName] = useState(loaded);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => { setName(loaded); }, [loaded]);
    async function save(event: React.FormEvent) {
        event.preventDefault();
        setPending(true);
        setMessage('');
        let saved = false;
        try {
            await requestJson('profile', { method: 'PUT', body: { displayName: name.trim() } });
            saved = true;
            await refreshProfile();
            setMessage(c('资料已保存。', 'Profile saved.'));
        }
        catch {
            setMessage(saved ? c('资料已保存，但刷新失败。请刷新资料确认。', 'Profile saved, but refresh failed. Refresh to confirm.') : c('无法确认保存结果。请刷新资料后重试。', 'Save could not be confirmed. Refresh before retrying.'));
        }
        finally {
            setPending(false);
        }
    }
    return <section className="web-content"><h1>{c('个人资料', 'Profile')}</h1><form className="web-card web-form" onSubmit={save}><Label htmlFor="displayName">{c('显示名称', 'Display name')}</Label><Input id="displayName" required maxLength={40} value={name} onChange={event => setName(event.target.value)}/><p className="text-muted-foreground">{user.role} · {user.id}</p><div className="flex gap-2"><Button disabled={pending || !name.trim()}>{c('保存', 'Save')}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setName(loaded); setMessage(''); }}>{c('取消', 'Cancel')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => { void refreshProfile().catch(() => setMessage(c('刷新失败。', 'Refresh failed.'))); }}>{c('刷新资料', 'Refresh profile')}</Button></div>{message && <p role="status">{message}</p>}</form></section>;
}
