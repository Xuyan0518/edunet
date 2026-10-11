import { normalizeEnglishFields } from "@/domain/englishNormalize";
import { record, text } from "@/domain/activityAdapters";
import { finiteNumber } from "@/domain/scoreDisplay";
import { EnglishTask } from "@/features/settings/contracts";
export const canonicalSkills = [
  "editing",
  "reading",
  "grammar",
  "vocab",
  "recitation",
  "essay"
] as const;
export type Skill = typeof canonicalSkills[number];
export type Activity = Record<string, unknown>;
export function snapshot(meta: EnglishTask) {
  return {
    taskId: meta.id,
    key: meta.key,
    displayName: meta.displayName,
    chineseName: meta.chineseName,
    englishName: meta.englishName,
    targetCount: meta.weeklyTargetCount,
    fieldsUsed: [...meta.enabledFields],
    practiceCount: 0,
    score: null,
    maxScore: null,
    problems: "",
    completed: false,
    exercises: []
  };
}
function historicalTasks(values: unknown[]): Activity[] {
  return structuredClone(values).map(value => {
    const task = record(value);
    const count = Number(task.practiceCount || 0);
    if (
      !canonicalSkills.includes(task.key as Skill) &&
      !Array.isArray(task.exercises) &&
      Number.isInteger(count) &&
      count > 0 &&
      count <= 30
    ) {
      return {
        ...task,
        exercises: Array.from({ length: count }, () => ({
          score: task.score ?? null,
          totalScore: task.maxScore ?? 100,
          problems: text(task.problems)
        }))
      };
    }
    return task;
  });
}
export function initializeEnglish(
  activity: Activity,
  config: EnglishTask[]
): Activity {
  const raw = activity.english ?? activity.englishFields;
  return {
    ...structuredClone(activity),
    type: "english",
    english: normalizeEnglishFields(raw),
    ...(typeof raw === "string" ? { legacyEnglishText: raw } : {}),
    englishTasks: Array.isArray(activity.englishTasks)
      ? historicalTasks(activity.englishTasks)
      : Array.isArray(activity.customEnglishTasks)
      ? historicalTasks(activity.customEnglishTasks)
      : config.filter(task => task.enabled).map(snapshot)
  };
}
export function updateEnglishSkill(
  activity: Activity,
  skill: Skill,
  patch: Activity
): Activity {
  const english = normalizeEnglishFields(
    activity.english ?? activity.englishFields
  );
  const block = { ...record(english[skill]), ...patch };
  const practiceCount =
    skill === "reading"
      ? Number(block.articleCount || 0)
      : skill === "editing" || skill === "grammar"
      ? Number(block.exerciseCount || 0)
      : skill === "vocab"
      ? Number(block.vocabularyWordCount || 0) +
        Number(block.vocabularySentenceCount || 0)
      : skill === "essay"
      ? block.completed
        ? 1
        : 0
      : text(block.text).trim()
      ? 1
      : 0;
  const problems = Array.isArray(block.exercises)
    ? block.exercises
        .map(row => text(record(row).problems))
        .filter(Boolean)
        .slice(0, 3)
        .join("；")
    : text(block.text);
  const tasks = Array.isArray(activity.englishTasks)
    ? activity.englishTasks
    : [];
  return {
    ...activity,
    english: { ...english, [skill]: block },
    englishTasks: tasks.map(value => {
      const task = record(value);
      return task.key === skill
        ? {
            ...task,
            practiceCount,
            score: finiteNumber(block.score),
            maxScore: finiteNumber(block.totalScore),
            completed: practiceCount > 0,
            problems
          }
        : task;
    })
  };
}
export function validateEnglish(activity: Activity): string[] {
  const errors: string[] = [];
  const english = normalizeEnglishFields(
    activity.english ?? activity.englishFields
  );
  const count = (value: unknown, max: number, label: string) => {
    const number = finiteNumber(value);
    if (
      number === null ||
      !Number.isInteger(number) ||
      number < 0 ||
      number > max
    )
      errors.push(`${label}: 0–${max}`);
  };
  const pair = (score: unknown, total: unknown, label: string) => {
    const value = finiteNumber(score);
    const max = finiteNumber(total) ?? 100;
    if (
      value !== null &&
      (value < 0 || value > 500 || max <= 0 || max > 500 || value > max)
    )
      errors.push(`${label}: invalid score / total`);
    if (finiteNumber(total) !== null && (max <= 0 || max > 500))
      errors.push(`${label}: total must be 1–500`);
    return value !== null && value < max;
  };
  for (const skill of canonicalSkills) {
    const block = record(english[skill]);
    if (text(block.text).length > 1000)
      errors.push(`${skill}: text exceeds 1000 characters`);
    if (["editing", "reading", "grammar"].includes(skill)) {
      count(
        block[skill === "reading" ? "articleCount" : "exerciseCount"],
        30,
        skill
      );
      const exercises = Array.isArray(block.exercises) ? block.exercises : [];
      let imperfect = exercises.length
        ? false
        : pair(block.score, block.totalScore, skill);
      for (const [index, row] of exercises.entries()) {
        const exercise = record(row);
        const missing = pair(
          exercise.score,
          exercise.totalScore,
          `${skill} ${index + 1}`
        );
        imperfect = imperfect || missing;
        if (missing && !text(exercise.problems).trim())
          errors.push(`${skill} ${index + 1}: describe the lost points`);
        if (text(exercise.problems).length > 1000)
          errors.push(`${skill}: problems exceed 1000 characters`);
      }
      if (
        imperfect &&
        !(Array.isArray(block.lossPointIds) && block.lossPointIds.length) &&
        !text(block.otherLossPointText).trim()
      )
        errors.push(`${skill}: select a loss point or describe another reason`);
    } else if (skill === "vocab") {
      count(block.vocabularyWordCount, 500, "Words");
      count(block.vocabularySentenceCount, 500, "Sentences");
      if (
        Number(block.vocabularyWordCount) +
          Number(block.vocabularySentenceCount) >
        500
      )
        errors.push("Combined vocabulary count must be at most 500");
    } else if (skill === "essay") {
      if (text(block.title).length > 120)
        errors.push("Essay title exceeds 120 characters");
      if (
        pair(block.score, block.totalScore, "Essay") &&
        !text(block.text).trim()
      )
        errors.push("Essay: describe the lost points");
    }
  }
  for (const value of Array.isArray(activity.englishTasks)
    ? activity.englishTasks
    : []) {
    const task = record(value);
    if (canonicalSkills.includes(task.key as Skill)) continue;
    const label = text(task.displayName || task.key);
    const fields = Array.isArray(task.fieldsUsed)
      ? task.fieldsUsed
      : ["practiceCount", "score", "problems"];
    count(task.practiceCount ?? 0, 500, label);
    const exercises = Array.isArray(task.exercises) ? task.exercises : [];
    if (exercises.length > 30) errors.push(`${label}: at most 30 exercises`);
    const entries = fields.includes("practiceCount")
      ? exercises
      : [
          {
            score: task.score,
            totalScore: task.maxScore,
            problems: task.problems
          }
        ];
    for (const raw of entries) {
      const row = record(raw);
      if (
        fields.includes("score") &&
        pair(row.score, row.totalScore, label) &&
        fields.includes("problems") &&
        !text(row.problems).trim()
      )
        errors.push(`${label}: describe the lost points`);
      if (text(row.problems).length > 1000)
        errors.push(`${label}: problems exceed 1000 characters`);
    }
  }
  return errors;
}
