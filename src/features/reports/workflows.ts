import { requestJson } from "@/services/http";
import { ReportRow, ReportType, generationBody } from "./contracts";
export async function generateSavedReport(
  studentId: string,
  type: ReportType,
  year: number,
  start: string,
  end: string
) {
  const result = await requestJson<{
    reportId?: string;
    savedReport?: ReportRow;
  }>(`ai/${type}-summary`, {
    method: "POST",
    body: generationBody(studentId, type, year, start, end, true)
  });
  const id = result.reportId || result.savedReport?.id;
  if (!id) throw new Error("Saved report identity was not returned");
  return id;
}
// Always reread before each intentional publish attempt. A confirmed final state skips step one.
export async function setReportPublication(
  id: string,
  visible: boolean,
  onRead: (row: ReportRow) => void
) {
  const path = `reports/${encodeURIComponent(id)}`;
  let row = await requestJson<ReportRow>(path);
  onRead(row);
  if (visible && row.status !== "final") {
    await requestJson(path, { method: "PATCH", body: { status: "final" } });
    row = await requestJson<ReportRow>(path);
    onRead(row);
    if (row.status !== "final") throw new Error("Final status not confirmed");
  }
  if (row.visibleToParent !== visible)
    await requestJson(`${path}/visibility`, {
      method: "PATCH",
      body: { visibleToParent: visible }
    });
  row = await requestJson<ReportRow>(path);
  onRead(row);
  if (row.visibleToParent !== visible)
    throw new Error("Visibility not confirmed");
  return row;
}
