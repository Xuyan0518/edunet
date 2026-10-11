import { expect, it } from "vitest";
import {
  makeTask,
  tasksPayload,
  validateTasks
} from "../../src/features/settings/contracts";
import { normalizeEnglishTaskConfig } from "../../server/utils/englishTasks";
it("preserves stable task IDs, keys and edited names under server normalization", () => {
  const task = {
    ...makeTask("custom", 0, "fixture-id"),
    chineseName: "听力练习",
    englishName: "Listening practice",
    displayName: "自定义任务",
    weeklyTargetCount: 0,
    enabled: false
  };
  const payload = tasksPayload([task]);
  expect(normalizeEnglishTaskConfig(payload.tasks)).toEqual(payload.tasks);
  expect(task.id).toBe("fixture-id");
  expect(task.key).toBe("custom_fixture-id");
});
it("reorders without mutating snapshots or names and retains repeated preset keys", () => {
  const first = makeTask("reading", 0, "r1");
  const second = makeTask("reading", 1, "r2");
  const payload = tasksPayload([second, first]);
  expect(payload.tasks.map(task => task.id)).toEqual(["r2", "r1"]);
  expect(payload.tasks.map(task => task.sortOrder)).toEqual([0, 1]);
  expect(first.sortOrder).toBe(0);
  expect(second.sortOrder).toBe(1);
});
it("checks 30-task, 0–500 target and field boundaries before saving", () => {
  const task = makeTask("vocab", 0, "v1");
  expect(task.weeklyTargetCount).toBe(50);
  expect(validateTasks([{ ...task, weeklyTargetCount: 500 }])).toBe(true);
  for (const weeklyTargetCount of [-1, 501, NaN, 1.5])
    expect(validateTasks([{ ...task, weeklyTargetCount }])).toBe(false);
  expect(validateTasks([{ ...task, enabledFields: [] }])).toBe(false);
  expect(
    validateTasks(
      Array.from({ length: 31 }, (_, i) => makeTask("custom", i, `c${i}`))
    )
  ).toBe(false);
  expect(validateTasks([])).toBe(false);
});
it("uses the current normalization fallback for empty configuration", () => {
  expect(
    normalizeEnglishTaskConfig([]).map(task => [
      task.key,
      task.weeklyTargetCount
    ])
  ).toEqual([
    ["editing", 5],
    ["reading", 5],
    ["grammar", 5],
    ["vocab", 50],
    ["recitation", 5],
    ["essay", 1]
  ]);
});
