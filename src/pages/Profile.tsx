import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Unlink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerBusy, setProviderBusy] = useState(false);
  const [googleProvider, setGoogleProvider] = useState<{ linked: boolean; email: string | null; canUnlink: boolean }>({
    linked: false,
    email: null,
    canUnlink: false,
  });

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user]);

  const loadProviders = useCallback(async () => {
    setProviderLoading(true);
    try {
      const res = await fetch(buildApiUrl('auth/providers'), { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load sign-in methods.');
      setGoogleProvider(data.google);
    } catch {
      toast({ title: t('toast.title.error'), description: t('profile.google.loadError'), variant: 'destructive' });
    } finally {
      setProviderLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const linkGoogle = async (credential: string) => {
    setProviderBusy(true);
    try {
      const res = await fetch(buildApiUrl('auth/google/link'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not link Google.');
      await loadProviders();
      toast({ title: t('toast.title.success'), description: t('profile.google.linked') });
    } catch (error) {
      toast({
        title: t('toast.title.error'),
        description: error instanceof Error ? error.message : t('profile.google.linkError'),
        variant: 'destructive',
      });
    } finally {
      setProviderBusy(false);
    }
  };

  const unlinkGoogle = async () => {
    setProviderBusy(true);
    try {
      const res = await fetch(buildApiUrl('auth/google/link'), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.error || 'Could not unlink Google.');
      }
      await loadProviders();
      toast({ title: t('toast.title.success'), description: t('profile.google.unlinked') });
    } catch (error) {
      toast({
        title: t('toast.title.error'),
        description: error instanceof Error ? error.message : t('profile.google.unlinkError'),
        variant: 'destructive',
      });
    } finally {
      setProviderBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast({ title: t('toast.title.error'), description: t('profile.toast.missing'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl('profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      if (user) {
        updateUser({ ...user, name: data.user.name, email: data.user.email });
      }

      toast({ title: t('toast.title.success'), description: t('profile.toast.saved') });
    } catch (err) {
      toast({
        title: t('toast.title.error'),
        description: t('profile.toast.error'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('profile.fullName')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('profile.fullName')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('profile.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('profile.role')}</Label>
                <Input value={user?.role ?? ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t('profile.userId')}</Label>
                <Input value={user?.id ?? ''} disabled />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? t('profile.saving') : t('profile.save')}
              </Button>
            </div>
          </form>

          <Separator className="my-8" />

          <section aria-labelledby="sign-in-methods-heading" className="space-y-4">
            <div>
              <h2 id="sign-in-methods-heading" className="text-base font-semibold">{t('profile.google.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('profile.google.description')}</p>
            </div>

            {providerLoading ? (
              <div className="flex h-10 items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('profile.google.loading')}
              </div>
            ) : googleProvider.linked ? (
              <div className="flex flex-col gap-3 border p-4 sm:flex-row sm:items-center">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t('profile.google.connected')}</p>
                  <p className="truncate text-sm text-muted-foreground">{googleProvider.email}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={providerBusy || !googleProvider.canUnlink}>
                      <Unlink className="mr-2 h-4 w-4" />
                      {t('profile.google.unlink')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('profile.google.unlinkTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('profile.google.unlinkDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('profile.google.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void unlinkGoogle()}>{t('profile.google.confirmUnlink')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {!googleProvider.canUnlink && (
                  <span className="text-xs text-muted-foreground">{t('profile.google.lastMethod')}</span>
                )}
              </div>
            ) : (
              <div className="max-w-sm">
                <GoogleSignInButton
                  onCredential={linkGoogle}
                  onError={(message) => toast({ title: t('toast.title.error'), description: message, variant: 'destructive' })}
                  disabled={providerBusy}
                />
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
