import { expect, it } from "vitest";
import {
  roleBody,
  reviewDestination,
  ReviewItem
} from "../../src/features/admin/contracts";
import {
  seenKey,
  latestSeenToken,
  isUnseen,
  markSeen
} from "../../src/storage/seen";
import { SessionUser } from "../../src/features/auth/session";
it("routes all four review types to the correct identity and period", () => {
  const base = {
    id: "r",
    studentId: "s",
    weekStarting: "2026-09-27",
    year: 2026,
    quarter: 3
  } as ReviewItem;
  expect(reviewDestination({ ...base, type: "weekly" })).toBe(
    "/weekly-feedback?student=s&weekStarting=2026-09-27"
  );
  expect(reviewDestination({ ...base, type: "report" })).toBe("/reports/r");
  expect(reviewDestination({ ...base, type: "quarterly" })).toContain(
    "legacyQuarter=3"
  );
  expect(reviewDestination({ ...base, type: "yearly" })).toContain(
    "legacyType=yearly"
  );
});
it("preserves authoritative identity grouping and validates roles/name", () => {
  const group = {
    identityKey: "opaque",
    displayName: "Name",
    roles: [
      {
        id: "p",
        role: "parent" as const,
        name: "Name",
        displayName: "Name",
        status: "approved"
      }
    ]
  };
  expect(roleBody(group, ["teacher", "parent"], " New ")).toEqual({
    sourceRole: "parent",
    sourceId: "p",
    roles: ["teacher", "parent"],
    displayName: "New"
  });
  expect(() => roleBody(group, [], "Name")).toThrow();
  expect(() => roleBody(group, ["parent"], " ")).toThrow();
});
it("keeps local markers account, role, reviewer and child scoped", () => {
  const user = { id: "a", role: "parent" } as SessionUser;
  const key = seenKey(user, "child", "weekly");
  expect(key).not.toBe(seenKey({ ...user, id: "b" }, "child", "weekly"));
  expect(key).not.toBe(seenKey(user, "other", "weekly"));
  expect(key).not.toBe(
    seenKey({ ...user, role: "teacher" }, "child", "weekly")
  );
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
  const token = latestSeenToken(
    [{ weekStarting: "2026-09-27" }, { weekStarting: "2026-09-20" }],
    "weekly"
  );
  expect(isUnseen(storage, key, token)).toBe(true);
  markSeen(storage, key, token);
  expect(isUnseen(storage, key, token)).toBe(false);
  expect(isUnseen(storage, key, "2026-10-04")).toBe(true);
});
it("uses row modification metadata for exams/reports and tolerates blocked storage", () => {
  expect(
    latestSeenToken(
      [{ updatedAt: "2026-10-03", examDate: "2026-09-01" }],
      "exams"
    )
  ).toBe("2026-10-03");
  expect(latestSeenToken([{ endDate: "2026-06-30" }], "reports")).toBe(
    "2026-06-30"
  );
  expect(() =>
    markSeen(
      {
        setItem() {
          throw new Error("quota");
        }
      },
      "key",
      "value"
    )
  ).not.toThrow();
});
