import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";
import { createMockDb } from "../helpers/mockDb";

const database = createMockDb();
vi.mock("../../server/db", () => ({ db: database }));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../../server/utils/wechatNotify", () => ({
  sendWeChatSubscribeMessage: vi.fn(() => {
    throw new Error("Notifications forbidden");
  })
}));
vi.mock("../../server/services/actionLocks", () => ({
  withActionLock: async (_options: unknown, action: () => Promise<unknown>) =>
    action(),
  isActionLockConflictError: () => false,
  buildActionLockConflictPayload: () => ({ error: "ACTION_LOCKED" })
}));
// Invoke the registered handlers directly: no server listener, socket, provider,
// dotenv file, or real database. The shared setup blocks all outbound network.
type Handler = (req: Request, res: Response) => Promise<unknown>;
let handlers: Record<string, Handler>;
let registeredRoutes: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: Response, next: () => void) => unknown }[] }[];
let teacherUpdateStack: {
  handle: (req: Request, res: Response, next: () => void) => unknown;
}[];
const demo = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-10-01T00:00:00.000Z";
const body = {
  studentId: demo,
  updatedAt,
  date: "2026-10-01",
  attendance: "present",
  activities: [
    {
      subject: "Math",
      taskSummary: "Fractions",
      strengths: "Recall",
      improvements: "Accuracy"
    }
  ],
  weekStarting: "2026-09-27",
  weekEnding: "2026-10-03",
  summary: "Week",
  strengths: [],
  areasToImprove: []
};
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  const { app } = await import("../../server/index");
  type Layer = {
    route?: {
      path: string;
      methods: { put?: boolean; get?: boolean };
      stack: { handle: Handler }[];
    };
  };
  const stack: Layer[] = app._router.stack;
  registeredRoutes = stack.flatMap(layer => layer.route ? [layer.route] : []);
  teacherUpdateStack = stack.find(
    layer =>
      layer.route?.methods.put && layer.route.path === "/api/teachers/:id"
  )!.route!.stack;
  handlers = Object.fromEntries(
    stack
      .filter(
        layer =>
          layer.route?.methods.put ||
          (layer.route?.methods.get &&
            layer.route.path === "/api/reports/:reportId")
      )
      .map(layer => [layer.route!.path, layer.route!.stack.at(-1)!.handle])
  );
});
beforeEach(() => {
  database.reset();
});

async function invoke(
  path: string,
  owner: string,
  submitted = demo,
  reviewer = true
) {
  if (path.includes("progress") && submitted === demo) database.queueSelect([]); // duplicate date lookup
  database.queueSelect([{ id: recordId, studentId: owner, updatedAt }]);
  database.queueSelect([]); // loss catalog / weekly duplicate
  database.queueUpdate([{ id: recordId, studentId: submitted, updatedAt }]);
  const write = vi.spyOn(database, "update");
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    }
  };
  await handlers[path](
    ({
      params: { id: recordId },
      body: { ...body, studentId: submitted },
      user: {
        id: "reviewer",
        role: "teacher",
        isReviewer: reviewer,
        reviewerStudentId: demo
      }
    } as unknown) as Request,
    (res as unknown) as Response
  );
  return { res, write };
}
describe.each(["/api/progress/:id", "/api/feedback/:id"])(
  "%s reviewer ownership",
  path => {
    it("rejects foreign existing rows even when the submitted student is the demo", async () => {
      const { res, write } = await invoke(path, other);
      expect(res.statusCode).toBe(403);
      expect(write).not.toHaveBeenCalled();
    });
    it("rejects moving a demo row to another student", async () => {
      const { res, write } = await invoke(path, demo, other);
      expect(res.statusCode).toBe(403);
      expect(write).not.toHaveBeenCalled();
    });
    it("retains legitimate demo writes", async () => {
      const { res, write } = await invoke(path, demo);
      expect(res.statusCode).toBe(200);
      expect(write).toHaveBeenCalledOnce();
    });
    it("retains ordinary teacher updates", async () => {
      const { res, write } = await invoke(path, other, demo, false);
      expect(res.statusCode).toBe(200);
      expect(write).toHaveBeenCalledOnce();
    });
  }
);

it.each([
  [other, 403],
  [demo, 200]
])(
  "restricts reviewer report detail to the demo student (%s)",
  async (studentId, status) => {
    database.queueSelect([
      {
        id: recordId,
        studentId,
        visibleToParent: false,
        summaryText: "Fixture",
        reportType: "quarterly",
        analyticsJson: "{}",
        finalReportJson: "{}"
      }
    ]);
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json: vi.fn()
    };
    await handlers["/api/reports/:reportId"](
      ({
        params: { reportId: recordId },
        user: {
          id: "reviewer",
          role: "teacher",
          isReviewer: true,
          reviewerStudentId: demo
        }
      } as unknown) as Request,
      (res as unknown) as Response
    );
    expect(res.statusCode).toBe(status);
  }
);

it("requires authentication on the registered teacher update endpoint before any write", async () => {
  const next = vi.fn();
  const write = vi.spyOn(database, "update");
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn()
  };
  expect(teacherUpdateStack).toHaveLength(3);
  await teacherUpdateStack[0].handle(
    { headers: {} } as Request,
    (res as unknown) as Response,
    next
  );
  expect(res.statusCode).toBe(401);
  expect(next).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
it.each(["teacher", "parent", "admin"])(
  "restricts teacher account administration for %s",
  async role => {
    const next = vi.fn();
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json: vi.fn()
    };
    await teacherUpdateStack[1].handle(
      { user: { id: "fixture", role } } as Request,
      (res as unknown) as Response,
      next
    );
    expect(next).toHaveBeenCalledTimes(role === "admin" ? 1 : 0);
    expect(res.statusCode).toBe(role === "admin" ? 200 : 403);
  }
);


it.each([
  ['post', '/api/students/:studentId/exams'],
  ['post', '/api/students/:studentId/papers'],
  ['put', '/api/students/:studentId/papers/batch'],
  ['put', '/api/students/:studentId/topics/:topicId/progress'],
  ['get', '/api/weekly-cycles'],
])('registered %s %s permits admin teaching actions and rejects parents', async (method, path) => {
  const route = registeredRoutes.find(row => row.path === path && row.methods[method]);
  expect(route, path).toBeDefined();
  for (const role of ['admin', 'teacher', 'parent']) {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await route!.stack[1].handle({ user: { role } } as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(role === 'parent' ? 0 : 1);
    if (role === 'parent') expect(res.status).toHaveBeenCalledWith(403);
  }
});

it('registered student XLSX export is admin-only and returns a genuine complete workbook', async () => {
  const route = registeredRoutes.find(row => row.path === '/api/admin/students/:studentId/records-export')!;
  for (const role of ['teacher', 'parent']) {
    const next = vi.fn();
    const denied = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await route.stack[1].handle({ user: { role } } as Request, denied as unknown as Response, next);
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  }
  database.queueSelect([{ id: demo, name: 'QA 中文', grade: 'P3' }]);
  database.queueSelect([{ id: other, name: 'Math', code: 'MATH' }]);
  database.queueSelect([{ id: recordId, date: '2026-10-03', summary: '  spaced   content  ', activities: [{ taskSummary: 'Fractions < & >', strengths: 'Accuracy' }] }]);
  for (let i = 0; i < 6; i++) database.queueSelect([]);
  const response = { setHeader: vi.fn(), send: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  await route.stack.at(-1)!.handle({ params: { studentId: demo }, user: { role: 'admin' } } as unknown as Request, response as unknown as Response, vi.fn());
  expect(response.status).not.toHaveBeenCalled();
  expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const bytes: Buffer = response.send.mock.calls[0][0];
  const files: Record<string, string> = {};
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0); // STORE ZIP, no decompressor needed
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    files[name] = bytes.subarray(start, start + size).toString();
    offset = start + size;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50); // central directory
  expect(files['xl/workbook.xml'].match(/<sheet /g)).toHaveLength(10);
  expect(files['xl/worksheets/sheet3.xml']).toContain('Fractions &lt; &amp; &gt;');
  expect(files['xl/worksheets/sheet3.xml']).not.toContain('[object Object]');
  expect(files['xl/worksheets/sheet10.xml']).toContain('  spaced   content  ');
  expect(files['[Content_Types].xml']).toContain('spreadsheetml.sheet.main+xml');
});
