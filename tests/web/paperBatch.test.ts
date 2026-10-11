import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import { replaceDayPapers } from "../../server/services/paperBatch";
function fixture() {
  const query = vi.fn((sql: string, params: unknown[]) => ({ sql, params }));
  const transaction = vi.fn(async (items: unknown[]) =>
    items.map((_, index) => ({
      rows: index ? [["new-paper"]] : [],
      rowCount: 1,
      fields: []
    }))
  );
  const db = drizzle(({ query, transaction } as unknown) as Parameters<
    typeof drizzle
  >[0]);
  return { db, transaction };
}
const studentId = "11111111-1111-4111-8111-111111111111";
const date = "2026-10-03";
const paper = {
  studentId,
  date,
  typeId: studentId,
  schoolId: studentId,
  strengths: "Recall",
  improvements: "Accuracy",
  score: 0,
  total: 100
};
it("replaces the scoped active paper set in one driver transaction", async () => {
  const { db, transaction } = fixture();
  expect(await replaceDayPapers(db, studentId, date, [paper])).toBe(1);
  expect(transaction).toHaveBeenCalledOnce();
  const statements = transaction.mock.calls[0][0] as {
    sql: string;
    params: unknown[];
  }[];
  expect(statements).toHaveLength(2);
  expect(statements[0].sql).toMatch(/^delete from/);
  expect(statements[0].sql).toContain('"deleted_at" is null');
  expect(statements[0].params).toEqual([studentId, date]);
  expect(statements[1].sql).toMatch(/^insert into/);
});
it("supports an empty complete day set without an invalid empty insert", async () => {
  const { db, transaction } = fixture();
  expect(await replaceDayPapers(db, studentId, date, [])).toBe(0);
  expect(transaction.mock.calls[0][0]).toHaveLength(1);
});
it("surfaces transaction failure without reporting success or retrying deletion", async () => {
  const { db, transaction } = fixture();
  transaction.mockRejectedValueOnce(new Error("insert rejected"));
  await expect(replaceDayPapers(db, studentId, date, [paper])).rejects.toThrow(
    "insert rejected"
  );
  expect(transaction).toHaveBeenCalledOnce();
});
