export const binTypes = [
  "dailyProgress",
  "weeklyReport",
  "studentReport",
  "quarterlySummary",
  "yearlySummary",
  "exam",
  "paper"
] as const;
export type BinType = typeof binTypes[number];
export interface BinItem {
  recordType: BinType;
  recordId: string;
  title: string;
  summary: string;
  originalDate: string;
  deletedAt: string;
  deletedByName: string;
  daysRemaining: number;
}
export interface BinResponse {
  studentId: string;
  retentionDays: number;
  groups: Record<string, BinItem[]>;
}
export const binKey = (row: Pick<BinItem, "recordId" | "recordType">) =>
  `${row.recordType}:${row.recordId}`;
export function binBody(row: BinItem) {
  if (!binTypes.includes(row.recordType) || !row.recordId)
    throw new Error("Invalid bin record");
  return { recordType: row.recordType, recordId: row.recordId };
}
export const binRows = (data: BinResponse) => Object.values(data.groups).flat();
