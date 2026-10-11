import { beforeEach, expect, it, vi } from "vitest";
import {
  loadDailyRecord,
  reconcileDaily,
  dailyBody,
  saveDailyStage,
  savePaperStage,
  reconcilePapers,
  DailyRecord
} from "@/features/progress/dailySave";
import {
  dailyDraftKey,
  readDailyDraft,
  writeDailyDraft
} from "@/storage/dailyDrafts";
import { SessionUser } from "@/features/auth/session";
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null }));
const daily: DailyRecord = {
  studentId: "child",
  date: "2026-10-03",
  attendance: "present",
  attendanceStart: "18:00",
  attendanceEnd: "21:00",
  summary: "Day",
  activities: [{ subject: "Math", papers: [{ description: "embedded" }] }]
};
it("captures the daily ID before paper failure and does not repeat its POST", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...daily, id: "saved", updatedAt: "v1" }))
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "CONFLICT" }), { status: 409 })
    );
  vi.stubGlobal("fetch", fetcher);
  const stage = vi.fn();
  const saved = await saveDailyStage({ daily, papers: [] }, stage);
  await expect(
    savePaperStage("child", daily.date, [], "v0", saved, stage)
  ).rejects.toMatchObject({
    stage: { kind: "dailySavedPaperPending", daily: { id: "saved" } }
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(fetcher.mock.calls[0][1].body).activities[0]
  ).not.toHaveProperty("papers");
  expect(fetcher.mock.calls[1][1].method).toBe("PUT");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    date: daily.date,
    papers: [],
    expectedUpdatedAt: "v0"
  });
});
it("labels a lost daily response unknown, with no automatic retry", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("network"));
  vi.stubGlobal("fetch", fetcher);
  const stage = vi.fn();
  await expect(
    saveDailyStage({ daily, papers: [] }, stage)
  ).rejects.toMatchObject({ stage: { kind: "outcomeUnknown", part: "daily" } });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("reconciles paper outcomes with reads only", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("[]"));
  vi.stubGlobal("fetch", fetcher);
  expect(await reconcilePapers("child", daily.date, [], [])).toEqual({
    rows: [],
    matches: true,
    unchanged: true
  });
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
});
it("namespaces manual drafts by account, scope, student and date and surfaces storage errors", () => {
  const user = { id: "u", role: "teacher" } as SessionUser;
  const key = dailyDraftKey(user, "child", daily.date);
  expect(key).not.toBe(
    dailyDraftKey({ ...user, id: "u2" }, "child", daily.date)
  );
  expect(key).not.toBe(dailyDraftKey(user, "other", daily.date));
  const data = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    getItem: (key: string) => data.get(key) || null
  };
  writeDailyDraft(storage, key, {
    studentId: "child",
    date: daily.date,
    serverVersion: null,
    paperVersion: null,
    form: { daily, papers: [] }
  });
  expect(readDailyDraft(storage, key, "child", daily.date)?.form).toEqual({
    daily,
    papers: []
  });
  expect(() => readDailyDraft(storage, key, "other", daily.date)).toThrow();
  expect(() =>
    writeDailyDraft(
      {
        setItem() {
          throw new Error("quota");
        }
      },
      key,
      {
        studentId: "child",
        date: daily.date,
        serverVersion: null,
        paperVersion: null,
        form: { daily, papers: [] }
      }
    )
  ).toThrow("quota");
});

it("retains embedded legacy papers when editing an existing daily record", () => {
  const existing = { ...daily, id: "existing", updatedAt: "v1" };
  expect(dailyBody(existing).activities[0].papers).toEqual(
    daily.activities[0].papers
  );
  expect(dailyBody(existing).updatedAt).toBe("v1");
  expect(existing.activities[0].papers).toEqual([{ description: "embedded" }]);
});

it('treats the real empty-day 404 as an empty editor and a missing reconciliation record', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({error:'No progress found for this student on this date'}), {status:404}))));
  expect(await loadDailyRecord('child', daily.date)).toBeNull();
  expect(await reconcileDaily({daily,papers:[]})).toEqual({row:null,matches:false});
});
it.each([403,500,404])('does not hide other daily load failures (%s)',async status => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Different failure'}),{status})));
  await expect(loadDailyRecord('child',daily.date)).rejects.toMatchObject({status});
});
