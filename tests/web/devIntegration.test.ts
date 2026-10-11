import { expect, it, vi, afterEach } from 'vitest';
import { requireTeachingAuthor } from '../../server/middleware/auth';
import { sendWeChatSubscribeMessage } from '../../server/utils/wechatNotify';
import { studentRecordSheets, StudentRecords } from '../../server/services/studentRecordsExport';
import type { Request, Response } from 'express';
afterEach(() => vi.unstubAllEnvs());
it.each(['teacher', 'admin', 'parent'])('enforces teaching authorship for %s', role => { const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; requireTeachingAuthor({ user: { role } } as Request, res as unknown as Response, next); expect(next).toHaveBeenCalledTimes(role === 'parent' ? 0 : 1); if (role === 'parent')
    expect(res.status).toHaveBeenCalledWith(403); });
it('disables WeChat sends before any token/network request', async () => { vi.stubEnv('NOTIFICATIONS_ENABLED', 'false'); vi.stubEnv('WECHAT_APP_ID', 'configured'); vi.stubEnv('WECHAT_APP_SECRET', 'configured'); expect(await sendWeChatSubscribeMessage({ toUser: 'synthetic', templateId: 'synthetic', page: '', data: {} })).toMatchObject({ skipped: true }); expect(fetch).not.toHaveBeenCalled(); });
it('exports all record types and keeps long structured data recoverable', () => { const report = { id: 'report', finalReportJson: { text: '中文'.repeat(40000) } }; const records = { student: { id: 's', name: 'QA', grade: 'P3' }, subjects: [], daily: [], weekly: [], exams: [{ id: 'e', score: '0' }], papers: [{ id: 'p', score: 0, total: 100 }], quarterly: [], yearly: [], reports: [report] } as unknown as StudentRecords; const sheets = studentRecordSheets(records); expect(sheets).toHaveLength(10); const parts = sheets.at(-1)!.rows.slice(1).filter(row => row[0] === 'reports'); expect(parts.length).toBeGreaterThan(1); expect(JSON.parse(parts.map(row => row[3]).join(''))).toEqual(report); expect(sheets.find(row => row.name === 'Papers')!.rows[1][5]).toBe(0); });
it('publishes dev test metadata only for an explicitly marked dev server', async () => {
    const { devTestMetadata } = await import('../../server/utils/devTesting');
    expect(devTestMetadata({})).toEqual({});
    expect(devTestMetadata({ DATABASE_URL: 'postgres://test:secret@dev.example/test' })).toEqual({});
    const metadata = devTestMetadata({ DATABASE_URL: 'postgres://test:secret@dev.example/test', EDUNET_DEV_MODE: 'true', NOTIFICATIONS_ENABLED: 'false' });
    expect(metadata).toMatchObject({ devTesting: true, notificationsDisabled: true });
    expect(metadata.databaseKey).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(metadata)).not.toContain('secret');
});
