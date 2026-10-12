import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import {
  applyUserRoles,
  userRoleBatch,
  parentRoleHasBindings
} from "../../server/services/userRoles";
const id = "11111111-1111-4111-8111-111111111111";
const query = vi.fn((sql: string, params: unknown[]) => ({ sql, params }));
const transaction = vi.fn(async (items: unknown[]) =>
  items.map(() => ({ rows: [], rowCount: 1, fields: [] }))
);
const db = drizzle(({ query, transaction } as unknown) as Parameters<
  typeof drizzle
>[0]);
const base = {
  name: "Fixture",
  displayName: "Fixture",
  password: null,
  authProvider: "wechat",
  wechatOpenId: "fixture-id"
};
it("combines all three role transitions in one installed-driver transaction", async () => {
  transaction.mockClear();
  await applyUserRoles(
    db,
    ["teacher"],
    { admin: { id }, parent: { id }, teacher: null },
    base
  );
  expect(transaction).toHaveBeenCalledOnce();
  expect(transaction.mock.calls[0][0]).toHaveLength(3);
  const sql = userRoleBatch(
    db,
    ["teacher"],
    { admin: { id }, parent: { id }, teacher: null },
    base
  ).map(item => item.toSQL().sql);
  expect(sql[0]).toMatch(/^delete from "admins"/);
  expect(sql[1]).toMatch(/^insert into "teacher"/);
  expect(sql[2]).toMatch(/^delete from "parents"/);
});
it("does not report success or retry a rejected role transaction", async () => {
  transaction.mockClear();
  transaction.mockRejectedValueOnce(new Error("foreign key rejection"));
  await expect(
    applyUserRoles(
      db,
      ["teacher"],
      { admin: { id }, parent: { id }, teacher: null },
      base
    )
  ).rejects.toThrow();
  expect(transaction).toHaveBeenCalledOnce();
});
it("preserves credentials and verification when an existing role is retained", () => {
  const queries = userRoleBatch(db,["admin","teacher","parent"],{admin:{id},teacher:{id},parent:{id}},base).map(item=>item.toSQL());
  for(const query of queries){
    expect(query.sql).not.toContain('"password"');
    expect(query.sql).not.toContain('"auth_provider"');
    expect(query.sql).not.toContain('"email_verified"');
  }
});
it.each([
  [1, 0, true],
  [0, 1, true],
  [0, 0, false]
])(
  "protects primary %s and secondary %s bindings",
  async (primary, secondary, expected) => {
    let count = 0;
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            Array(count++ === 0 ? primary : secondary).fill({ id })
        })
      })
    }));
    expect(
      await parentRoleHasBindings(
        ({ select } as unknown) as Parameters<typeof parentRoleHasBindings>[0],
        id
      )
    ).toBe(expected);
    expect(select).toHaveBeenCalledTimes(2);
  }
);
