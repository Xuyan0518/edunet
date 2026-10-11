import { Button } from '@/components/ui/button';
import { ApiError } from '@/services/http';
import { useWebCopy } from '@/i18n/web';
export function AsyncState({ pending, error, empty, retry }: {
    pending?: boolean;
    error?: unknown;
    empty?: boolean;
    retry?: () => void;
}) {
    const c = useWebCopy();
    if (!pending && !error && !empty)
        return null;
    return <div className="web-state" role={error ? 'alert' : 'status'}>
    <p>{pending ? c('加载中…', 'Loading…') : error ? (error instanceof ApiError && error.status === 403 ? c('没有访问权限。', 'Access denied.') : c('暂时无法加载。请重试。', 'Unable to load. Please retry.')) : c('暂无记录。', 'No records yet.')}</p>
    {error && retry && <Button variant="outline" onClick={retry}>{c('重试', 'Retry')}</Button>}
  </div>;
}
