import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';
import { useI18n } from '@/context/I18nContext';

const PREFS_KEY = 'edunet-settings';

type SettingsPrefs = {
  emailUpdates: boolean;
  weeklySummary: boolean;
};

const Settings: React.FC = () => {
  const { toast } = useToast();
  const { language, setLanguage, t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefs, setPrefs] = useState<SettingsPrefs>({
    emailUpdates: true,
    weeklySummary: true,
  });

  useEffect(() => {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SettingsPrefs;
        setPrefs(parsed);
      } catch {
        // ignore
      }
    }
  }, []);

  const savePrefs = (next: SettingsPrefs) => {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: t('toast.title.error'), description: t('settings.toast.missing'), variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t('toast.title.error'), description: t('settings.toast.mismatch'), variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: t('toast.title.error'), description: t('settings.toast.short'), variant: 'destructive' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch(buildApiUrl('profile/password'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');

      toast({ title: t('toast.title.success'), description: t('settings.toast.updated') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast({
        title: t('toast.title.error'),
        description: t('settings.toast.error'),
        variant: 'destructive',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.security.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('settings.security.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('settings.security.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('settings.security.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? t('settings.security.updating') : t('settings.security.update')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.preferences.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.preferences.email.title')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.preferences.email.desc')}</p>
            </div>
            <Switch
              checked={prefs.emailUpdates}
              onCheckedChange={(checked) => savePrefs({ ...prefs, emailUpdates: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.preferences.weekly.title')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.preferences.weekly.desc')}</p>
            </div>
            <Switch
              checked={prefs.weeklySummary}
              onCheckedChange={(checked) => savePrefs({ ...prefs, weeklySummary: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('settings.language.desc')}</p>
          <Select value={language} onValueChange={(val) => setLanguage(val as 'en' | 'zh-CN')}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">{t('settings.language.option.zh')}</SelectItem>
              <SelectItem value="en">{t('settings.language.option.en')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
