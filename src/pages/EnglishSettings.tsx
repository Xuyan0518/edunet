import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/app/permissions';
import { useWebCopy } from '@/i18n/web';
import { EnglishTasksEditor } from '@/features/settings/EnglishTasksEditor';
import { StudySettingsEditor } from '@/features/settings/StudySettingsEditor';
import { StudentSwitcher } from '@/components/layout/StudentSwitcher';
export default function EnglishSettings({ globalScope = false }: {
    globalScope?: boolean;
}) {
    const { id } = useParams();
    const { user } = useAuth();
    const c = useWebCopy();
    if (!can(user, globalScope ? 'admin' : 'author', id))
        return <div className="web-state" role="alert">{c('没有访问权限。', 'Access denied.')}</div>;
    return <section className="web-content space-y-6"><h1>{globalScope ? c('全局英文与自习设置', 'Global English and study settings') : c('学生英文项目设置', 'Student English task settings')}</h1>{id && <StudentSwitcher studentId={id}/>}<EnglishTasksEditor key={id || 'global'} studentId={globalScope ? undefined : id}/>{globalScope && <StudySettingsEditor />}</section>;
}
