import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

const createRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('server/middleware/parentStudent', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('allows non-parent users', async () => {
    const { verifyParentStudentAccess } = await import('../../server/middleware/parentStudent');
    const req: any = { user: { role: 'teacher' }, params: {}, body: {}, query: {} };
    const res = createRes();
    const next = vi.fn();

    await verifyParentStudentAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when student does not exist', async () => {
    const { verifyParentStudentAccess } = await import('../../server/middleware/parentStudent');
    mockDb.queueSelect([]);

    const req: any = {
      user: { role: 'parent', id: 'parent-1' },
      params: { studentId: 'stu-1' },
      body: {},
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await verifyParentStudentAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows parent requests when studentId is missing', async () => {
    const { verifyParentStudentAccess } = await import('../../server/middleware/parentStudent');
    const req: any = {
      user: { role: 'parent', id: 'parent-1' },
      params: {},
      body: {},
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await verifyParentStudentAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when student belongs to another parent', async () => {
    const { verifyParentStudentAccess } = await import('../../server/middleware/parentStudent');
    mockDb.queueSelect([{ id: 'stu-1', parentId: 'other-parent' }]);

    const req: any = {
      user: { role: 'parent', id: 'parent-1' },
      params: { studentId: 'stu-1' },
      body: {},
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await verifyParentStudentAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows parent when student belongs to the same parent', async () => {
    const { verifyParentStudentAccess } = await import('../../server/middleware/parentStudent');
    mockDb.queueSelect([{ id: 'stu-1', parentId: 'parent-1' }]);

    const req: any = {
      user: { role: 'parent', id: 'parent-1' },
      params: { studentId: 'stu-1' },
      body: {},
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await verifyParentStudentAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when parent-student lookup throws', async () => {
    const { verifyParentStudentAccess } = await import('../../server/middleware/parentStudent');
    vi.spyOn(mockDb, 'select').mockImplementationOnce(() => {
      throw new Error('db down');
    });

    const req: any = {
      user: { role: 'parent', id: 'parent-1' },
      params: { studentId: 'stu-1' },
      body: {},
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await verifyParentStudentAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('filterParentStudents only tags parent requests', async () => {
    const { filterParentStudents } = await import('../../server/middleware/parentStudent');

    const teacherReq: any = { user: { role: 'teacher', id: 't-1' } };
    const teacherNext = vi.fn();
    await filterParentStudents(teacherReq, {} as any, teacherNext);
    expect(teacherNext).toHaveBeenCalledTimes(1);
    expect(teacherReq.user.parentId).toBeUndefined();

    const parentReq: any = { user: { role: 'parent', id: 'p-1' } };
    const parentNext = vi.fn();
    await filterParentStudents(parentReq, {} as any, parentNext);
    expect(parentReq.user.parentId).toBe('p-1');
    expect(parentNext).toHaveBeenCalledTimes(1);
  });

  it('filterParentStudents falls through on unexpected errors', async () => {
    const { filterParentStudents } = await import('../../server/middleware/parentStudent');

    const req: any = { user: { role: 'parent' } };
    Object.defineProperty(req.user, 'id', {
      get() {
        throw new Error('boom');
      },
    });

    const next = vi.fn();
    await filterParentStudents(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
