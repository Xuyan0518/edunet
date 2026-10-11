import { describe, expect, it } from "vitest";
import { readActivity } from "@/domain/activityAdapters";
import { normalizeEnglishFields } from "@/domain/englishNormalize";
import { normalizeEnglishFields as serverEnglish } from "../../server/utils/englishNormalize";
import { parseScoreMeta } from "../../server/utils/scoreGrade";
import { scoreDisplay } from "@/domain/scoreDisplay";
import { readReport, patchReportSection } from "@/domain/reportAdapters";

describe("historical activity reads", () => {
  it("preserves legacy narratives without inventing current required evaluations", () => {
    const old = {
      subject: "Math",
      description: "Fractions",
      performance: "good",
      notes: "Old note",
      extra: { retained: true }
    };
    const view = readActivity(old);
    expect(view.original).toEqual(old);
    expect(view.narratives.map(item => item.key)).toEqual([
      "description",
      "notes"
    ]);
    view.original.extra = null;
    expect(old.extra).toEqual({ retained: true });
  });
  it("retains old English strings and englishFields compatibility", () => {
    expect(
      readActivity({ subject: "English", english: "Read chapter 2" })
        .legacyEnglishText
    ).toBe("Read chapter 2");
    const view = readActivity({
      subject: "英文",
      englishFields: { reading: "Story A" }
    });
    expect(view.english?.reading.text).toBe("Story A");
    expect(view.recordedSkills).toEqual(["reading"]);
  });
  it("preserves recorded task labels, zero scores, disabled field snapshots, targets and embedded papers", () => {
    const old = {
      englishTasks: [
        {
          id: "old",
          key: "custom",
          name: "Original name",
          weeklyTargetCount: 0,
          fieldsUsed: ["score"],
          score: 0,
          totalScore: 10,
          completed: false,
          unknown: { x: 1 }
        }
      ],
      papers: [{ score: 0, total: 100, description: "Paper" }]
    };
    const view = readActivity(old);
    expect(view.tasks[0]).toMatchObject({
      ...old.englishTasks[0],
      label: "Original name"
    });
    expect(view.papers).toEqual(old.papers);
  });
  it.each([
    null,
    {},
    { editing: "Legacy" },
    {
      vocab: {
        text: "words",
        vocabularyWordCount: 5,
        vocabularySentenceCount: 2
      }
    },
    {
      editing: {
        score: 0,
        totalScore: 10,
        exerciseCount: 2,
        exercises: [
          { score: 0, totalScore: 5, problems: "A" },
          { score: 5, totalScore: 5, problems: "" }
        ],
        lossPointIds: ["id"],
        lossPointLabelsSnapshot: ["Old label"],
        otherLossPointText: "Other"
      }
    }
  ])("matches the pure server English normalizer: %j", input => {
    expect(normalizeEnglishFields(input)).toEqual(serverEnglish(input));
  });
});
describe("score compatibility", () => {
  it.each([
    [null, 100],
    ["", 100],
    [0, 100],
    ["37.497/50", undefined],
    [70, undefined],
    [101, undefined],
    [4, 0],
    [45, 100]
  ])("matches backend fallback for %j / %j", (score, total) => {
    expect(scoreDisplay({ score, total })).toEqual(
      parseScoreMeta(score, total)
    );
  });
  it("never invents F9 for a scoreless scheduled exam", () => {
    expect(
      scoreDisplay({ score: null, percentage: null, grade: null })
    ).toMatchObject({ score: null, percentage: null, grade: null });
  });
  it("honors valid returned percentage and grade", () => {
    expect(
      scoreDisplay({ score: 1, total: 2, percentage: 75, grade: "A1" })
    ).toMatchObject({ percentage: 75, grade: "A1" });
  });
});
describe("structured and legacy report reads", () => {
  it("prefers final report and preserves nested extensions when patching a section", () => {
    const final = {
      executiveSummary: { text: "Old", evidence: ["keep"] },
      subjectReports: [{ name: "Math", nested: { keep: true } }],
      future: { x: 2 }
    };
    const view = readReport({
      finalReport: JSON.stringify(final),
      structuredReport: { old: true },
      summary: "Legacy summary"
    });
    expect(view.content).toEqual(final);
    expect(
      patchReportSection(view.content, "executiveSummary", { text: "New" })
    ).toEqual({
      ...final,
      executiveSummary: { text: "New", evidence: ["keep"] }
    });
    expect(final.executiveSummary.text).toBe("Old");
  });
  it("shows malformed text and summary while falling back to parseable structure", () => {
    const view = readReport({
      finalReport: "{bad",
      structuredReport: '{"ok":true}',
      summaryText: "Fallback"
    });
    expect(view).toMatchObject({
      warning: true,
      content: { ok: true },
      summary: "Fallback",
      unparsedText: "{bad"
    });
    expect(() => patchReportSection("{bad", "summary", {})).toThrow();
  });
});

it("uses recorded custom task maxScore, including a zero score", () => {
  expect(scoreDisplay({ score: 0, maxScore: 25 })).toMatchObject({
    score: 0,
    total: 25,
    percentage: 0
  });
});
