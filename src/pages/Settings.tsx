import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useWebCopy } from '@/i18n/web';
import { Button } from '@/components/ui/button';
export default function Settings() {
    const { user, logout } = useAuth();
    const { language, setLanguage } = useI18n();
    const c = useWebCopy();
    return <section className="web-content"><h1>{c('设置', 'Settings')}</h1><div className="web-card space-y-5"><label className="web-field">{c('语言', 'Language')}<select value={language} onChange={event => setLanguage(event.target.value as typeof language)}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>{user.role === 'parent' && <section><h2>{c('微信订阅通知', 'WeChat subscriptions')}</h2><p>{c('请使用同一微信账号打开桐心成长小程序，在「设置」中选择订阅通知，并完成微信授权。打开此网页不会完成订阅。', 'Open the Edunet mini program with the same WeChat account, open Settings, select subscription notifications and complete the WeChat authorization. Opening this page does not subscribe you.')}</p></section>}<p>{c('退出后，此设备上的学习草稿与已读标记将被清除，语言设置保留。', 'Signing out clears learning drafts and seen markers on this device. Your language preference is retained.')}</p><Button variant="outline" onClick={logout}>{c('退出登录', 'Sign out')}</Button></div></section>;
}
