import { expect, it } from "vitest";
import {
  initializeEnglish,
  updateEnglishSkill,
  validateEnglish
} from "@/features/progress/englishActivity";
import { makeTask } from "@/features/settings/contracts";
import { record } from "@/domain/activityAdapters";
import { validateLossPointsRequired } from "../../server/utils/englishValidation";
it("preserves old English strings and historical snapshots without applying current names", () => {
  const old = {
    subject: "English",
    english: "Old narrative",
    englishTasks: [
      {
        taskId: "old",
        key: "reading",
        displayName: "Old name",
        targetCount: 2,
        fieldsUsed: ["problems"]
      }
    ],
    unknown: { x: 1 }
  };
  const result = initializeEnglish(old, [
    { ...makeTask("reading", 0, "new"), displayName: "New name" }
  ]);
  expect(result.legacyEnglishText).toBe("Old narrative");
  expect(result.englishTasks).toEqual(old.englishTasks);
  expect(result.unknown).toEqual({ x: 1 });
});
it("snapshots enabled config only and retains names/fields when canonical work changes", () => {
  const task = {
    ...makeTask("reading", 0, "r"),
    displayName: "Recorded label",
    weeklyTargetCount: 3
  };
  const value = initializeEnglish({ subject: "English" }, [
    task,
    { ...makeTask("essay", 1, "e"), enabled: false }
  ]);
  const result = updateEnglishSkill(value, "reading", {
    articleCount: 1,
    exercises: [{ score: 0, totalScore: 10, problems: "Inference" }],
    otherLossPointText: "Inference"
  });
  expect(result.englishTasks).toMatchObject([
    {
      taskId: "r",
      displayName: "Recorded label",
      targetCount: 3,
      practiceCount: 1,
      fieldsUsed: task.enabledFields
    }
  ]);
  expect(validateEnglish(result)).toEqual([]);
  expect(validateLossPointsRequired([result]).ok).toBe(true);
});
it("requires exercise problems and loss reasons for imperfect canonical work, but not full or ungraded scores", () => {
  const base = initializeEnglish({ subject: "English" }, [
    makeTask("editing", 0, "e")
  ]);
  const bad = updateEnglishSkill(base, "editing", {
    exerciseCount: 1,
    exercises: [{ score: 0, totalScore: 10, problems: "" }]
  });
  expect(validateEnglish(bad).length).toBe(2);
  expect(validateLossPointsRequired([bad]).ok).toBe(false);
  for (const score of [10, null])
    expect(
      validateEnglish(
        updateEnglishSkill(base, "editing", {
          exerciseCount: 1,
          exercises: [{ score, totalScore: 10, problems: "" }]
        })
      )
    ).toEqual([]);
});
it("validates essay explanation separately from the server’s three-skill loss requirement", () => {
  const bad = updateEnglishSkill(
    initializeEnglish({ subject: "English" }, []),
    "essay",
    { score: 1, totalScore: 10, text: "" }
  );
  expect(validateEnglish(bad)).toContain("Essay: describe the lost points");
  expect(validateLossPointsRequired([bad]).ok).toBe(true);
});
it("respects custom task fields and rejects an unexplained imperfect exercise", () => {
  const task = makeTask("custom", 0, "c");
  const activity = initializeEnglish({ subject: "English" }, [task]);
  const snapshot = record((activity.englishTasks as unknown[])[0]);
  activity.englishTasks = [
    {
      ...snapshot,
      practiceCount: 1,
      exercises: [{ score: 1, totalScore: 10, problems: "" }]
    }
  ];
  expect(
    validateEnglish(activity).some(error => error.includes("lost points"))
  ).toBe(true);
  activity.englishTasks = [
    {
      ...snapshot,
      fieldsUsed: ["practiceCount"],
      practiceCount: 1,
      exercises: [{ score: 1, totalScore: 10, problems: "" }]
    }
  ];
  expect(validateEnglish(activity)).toEqual([]);
});

it("retains historical custom counts, scores and labels when hydrating exercise rows", () => {
  const raw = {
    subject: "English",
    englishTasks: [
      {
        key: "custom",
        displayName: "Old label",
        practiceCount: 2,
        score: 0,
        maxScore: 20,
        problems: "Old problem",
        targetCount: 7
      }
    ]
  };
  const result = initializeEnglish(raw, []);
  expect((result.englishTasks as Record<string, unknown>[])[0]).toMatchObject({
    practiceCount: 2,
    displayName: "Old label",
    targetCount: 7,
    exercises: [
      { score: 0, totalScore: 20, problems: "Old problem" },
      { score: 0, totalScore: 20, problems: "Old problem" }
    ]
  });
  expect(raw.englishTasks[0]).not.toHaveProperty("exercises");
});
