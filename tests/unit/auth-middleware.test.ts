import { describe, expect, it, vi, beforeEach } from 'vitest';

const verifyTokenMock = vi.fn();
const verifyUserInDbMock = vi.fn();

vi.mock('../../server/utils/auth', () => ({
  verifyToken: verifyTokenMock,
  verifyUserInDb: verifyUserInDbMock,
}));

const createRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('server/middleware/auth', () => {
  beforeEach(() => {
    verifyTokenMock.mockReset();
    verifyUserInDbMock.mockReset();
  });

  it('authenticate returns 401 when no bearer token', async () => {
    const { authenticate } = await import('../../server/middleware/auth');
    const req: any = { headers: {} };
    const res = createRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticate returns 401 when token invalid', async () => {
    const { authenticate } = await import('../../server/middleware/auth');
    verifyTokenMock.mockReturnValue(null);

    const req: any = { headers: { authorization: 'Bearer bad' } };
    const res = createRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticate returns 401 when db verification fails', async () => {
    const { authenticate } = await import('../../server/middleware/auth');
    verifyTokenMock.mockReturnValue({ id: 'u1', role: 'teacher', name: 'A' });
    verifyUserInDbMock.mockResolvedValue(false);

    const req: any = { headers: { authorization: 'Bearer ok' } };
    const res = createRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticate attaches user and passes next when valid', async () => {
    const { authenticate } = await import('../../server/middleware/auth');
    const user = { id: 'u1', role: 'teacher', name: 'A' };
    verifyTokenMock.mockReturnValue(user);
    verifyUserInDbMock.mockResolvedValue(true);

    const req: any = { headers: { authorization: 'Bearer ok' } };
    const res = createRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('authenticate returns 500 when auth middleware throws unexpectedly', async () => {
    const { authenticate } = await import('../../server/middleware/auth');
    verifyTokenMock.mockReturnValue({ id: 'u1', role: 'teacher', name: 'A' });
    verifyUserInDbMock.mockRejectedValue(new Error('db failed'));

    const req: any = { headers: { authorization: 'Bearer ok' } };
    const res = createRes();
    const next = vi.fn();

    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireRole enforces authentication and role', async () => {
    const { requireRole } = await import('../../server/middleware/auth');
    const guard = requireRole('admin');

    const res1 = createRes();
    const next1 = vi.fn();
    guard({} as any, res1, next1);
    expect(res1.status).toHaveBeenCalledWith(401);
    expect(next1).not.toHaveBeenCalled();

    const res2 = createRes();
    const next2 = vi.fn();
    guard({ user: { role: 'teacher' } } as any, res2, next2);
    expect(res2.status).toHaveBeenCalledWith(403);
    expect(next2).not.toHaveBeenCalled();

    const res3 = createRes();
    const next3 = vi.fn();
    guard({ user: { role: 'admin' } } as any, res3, next3);
    expect(next3).toHaveBeenCalledTimes(1);
  });

  it('requireAdmin/requireTeacher/requireParent enforce role checks', async () => {
    const { requireAdmin, requireTeacher, requireParent } = await import('../../server/middleware/auth');

    const res1 = createRes();
    const next1 = vi.fn();
    requireAdmin({ user: { role: 'teacher' } } as any, res1, next1);
    expect(res1.status).toHaveBeenCalledWith(403);
    expect(next1).not.toHaveBeenCalled();

    const res2 = createRes();
    const next2 = vi.fn();
    requireTeacher({ user: { role: 'teacher' } } as any, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);

    const res3 = createRes();
    const next3 = vi.fn();
    requireTeacher({} as any, res3, next3);
    expect(res3.status).toHaveBeenCalledWith(401);

    const res4 = createRes();
    const next4 = vi.fn();
    requireParent({ user: { role: 'teacher' } } as any, res4, next4);
    expect(res4.status).toHaveBeenCalledWith(403);

    const res5 = createRes();
    const next5 = vi.fn();
    requireParent({ user: { role: 'parent' } } as any, res5, next5);
    expect(next5).toHaveBeenCalledTimes(1);

    const res6 = createRes();
    const next6 = vi.fn();
    requireAdmin({} as any, res6, next6);
    expect(res6.status).toHaveBeenCalledWith(401);
  });
});
