import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import {
  generationBody,
  legacyBody,
  editableReport,
  contentPatch,
  overallText,
  overallField,
  ReportRow
} from "../../src/features/reports/contracts";
import {
  generateSavedReport,
  setReportPublication
} from "../../src/features/reports/workflows";
import { buildSummaryFromStructured } from "../../src/features/reports/compat/reportViewModel";
import { buildReportMarkdown } from "../../src/features/reports/compat/reportMarkdown";
import { binBody, binKey, binTypes } from "../../src/features/bin/contracts";
const require = createRequire(import.meta.url);
const mini = require("../../miniprogram/utils/reportViewModel.js");
const markdown = require("../../miniprogram/utils/reportMarkdown.js");
const content = {
  executiveSummary: "Executive",
  teacherComment: "Teacher",
  subjectReports: [
    {
      subjectName: "English",
      summary: "Old",
      evidence: ["Preserve"],
      extension: { value: 1 }
    }
  ],
  keyHighlights: ["Good"],
  keyConcerns: ["Concern"],
  nextStageRecommendations: [
    {
      area: "Practice",
      recommendation: "Read",
      priority: "high",
      extension: true
    }
  ],
  englishSpecialAnalysis: {
    summary: "English",
    teacherSuggestion: "Try",
    extension: { keep: true }
  },
  extension: { nested: ["keep"] }
};
const row: ReportRow = {
  id: "report",
  studentId: "student",
  reportType: "quarterly",
  title: "Title",
  startDate: "2026-01-01",
  endDate: "2026-06-01",
  year: 2026,
  summary: "Summary",
  status: "draft",
  visibleToParent: false,
  updatedAt: "v1",
  finalReport: content
};
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null });
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
describe("report workflows", () => {
  it("keeps legacy AI unsaved and structured AI persisted explicitly", () => {
    expect(
      generationBody("s", "quarterly", 2026, "2026-01-01", "2026-06-01", false)
        .saveReport
    ).toBe(false);
    expect(
      generationBody("s", "yearly", 2026, "unused", "unused", true)
    ).toEqual({ studentId: "s", year: 2026, saveReport: true });
  });
  it("enforces legacy range/text/version without altering publication fields", () => {
    expect(() =>
      legacyBody(
        { id: "x", year: 2026, quarter: 1, summary: "" },
        "quarterly",
        "text",
        "2026-01-01",
        "2026-06-01"
      )
    ).toThrow();
    expect(() =>
      generationBody("s", "quarterly", 2026, "2026-01-01", "2026-12-31", false)
    ).toThrow();
    expect(
      legacyBody(
        { id: "x", updatedAt: "v1", year: 2026, summary: "" },
        "yearly",
        "text",
        "",
        ""
      )
    ).toEqual({ year: 2026, summary: "text", updatedAt: "v1" });
  });
  it("preserves unknown fields, original subject identity and nested recommendation/English data", () => {
    const copy = editableReport(row)!;
    copy[overallField("quarterly")] = "Edited";
    const subjects = copy.subjectReports as typeof content.subjectReports;
    subjects[0].summary = "New";
    const patch = contentPatch(row, copy);
    expect(patch.finalReport).toMatchObject({
      executiveSummary: "Executive",
      teacherComment: "Edited",
      extension: content.extension,
      englishSpecialAnalysis: content.englishSpecialAnalysis,
      nextStageRecommendations: content.nextStageRecommendations
    });
    expect(
      (patch.finalReport.subjectReports as typeof subjects)[0]
    ).toMatchObject({
      subjectName: "English",
      summary: "New",
      evidence: ["Preserve"],
      extension: { value: 1 }
    });
    expect(row.finalReport).toEqual(content);
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("visibleToParent");
  });
  it("matches mini summary and Markdown formatters on preserved content", () => {
    expect(buildSummaryFromStructured("quarterly", content, "")).toBe(
      mini.buildSummaryFromStructured("quarterly", content, "")
    );
    expect(buildReportMarkdown(row)).toBe(markdown.buildReportMarkdown(row));
  });
  it("captures persisted generation ID without creating another report", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ reportId: "saved" }));
    vi.stubGlobal("fetch", fetch);
    expect(await generateSavedReport("s", "yearly", 2026, "", "")).toBe(
      "saved"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("ai/yearly-summary");
  });
  it("retains final-hidden partial publication and skips finalization on an intentional retry", async () => {
    const seen: ReportRow[] = [];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(row))
      .mockResolvedValueOnce(response({ ...row, status: "final" }))
      .mockResolvedValueOnce(response({ ...row, status: "final" }))
      .mockResolvedValueOnce(response({ error: "failed" }, 503));
    vi.stubGlobal("fetch", fetch);
    await expect(
      setReportPublication("report", true, value => seen.push(value))
    ).rejects.toThrow();
    expect(seen.at(-1)).toMatchObject({
      status: "final",
      visibleToParent: false
    });
    const retry = vi
      .fn()
      .mockResolvedValueOnce(response({ ...row, status: "final" }))
      .mockResolvedValueOnce(
        response({ ...row, status: "final", visibleToParent: true })
      )
      .mockResolvedValueOnce(
        response({ ...row, status: "final", visibleToParent: true })
      );
    vi.stubGlobal("fetch", retry);
    await setReportPublication("report", true, () => {});
    expect(
      retry.mock.calls
        .filter(([, init]) => init.method === "PATCH")
        .map(([url]) => url)
    ).toHaveLength(1);
    expect(retry.mock.calls[1][0]).toContain("/visibility");
  });
  it("uses distinct keys and exact bodies for all seven bin types", () => {
    const keys = binTypes.map(recordType => {
      const item = {
        recordType,
        recordId: "same",
        title: "",
        summary: "",
        originalDate: "",
        deletedAt: "",
        deletedByName: "",
        daysRemaining: 1
      };
      expect(binBody(item)).toEqual({ recordType, recordId: "same" });
      return binKey(item);
    });
    expect(new Set(keys).size).toBe(7);
  });
});

it("allows deliberately clearing a teacher comment without restoring executive fallback", () => {
  expect(overallText(row, { ...content, teacherComment: "" })).toBe("");
  expect(overallText(row, { executiveSummary: "Fallback" })).toBe("Fallback");
});
