import { record } from "./activityAdapters";
export function parseReport(value: unknown) {
  if (typeof value !== "string")
    return { value: value ?? null, rawText: "", warning: false };
  if (!value.trim()) return { value: null, rawText: "", warning: false };
  try {
    return {
      value: JSON.parse(value) as unknown,
      rawText: value,
      warning: false
    };
  } catch {
    return { value: null, rawText: value, warning: true };
  }
}
export function readReport(input: unknown) {
  const row = record(input);
  const final = parseReport(row.finalReport ?? row.finalReportJson);
  const structured = parseReport(
    row.structuredReport ?? row.structuredReportJson
  );
  return {
    original: structuredClone(row),
    content: final.value ?? structured.value,
    summary: String(row.summary ?? row.summaryText ?? ""),
    warning: final.warning || structured.warning || Boolean(row.parseError) || (Array.isArray(row.jsonParseWarnings) && row.jsonParseWarnings.length > 0),
    unparsedText: [
      final.warning && final.rawText,
      structured.warning && structured.rawText
    ]
      .filter(Boolean)
      .join("\n\n")
  };
}
// Explicit section patch: preserve every untouched nested field and unknown extension.
export function patchReportSection(
  input: unknown,
  section: string,
  patch: Record<string, unknown>
) {
  const parsed = parseReport(input);
  if (
    parsed.warning ||
    parsed.value === null ||
    typeof parsed.value !== "object" ||
    Array.isArray(parsed.value)
  )
    throw new Error("Report is not an editable object");
  const next = structuredClone(record(parsed.value));
  next[section] = { ...record(next[section]), ...structuredClone(patch) };
  return next;
}
