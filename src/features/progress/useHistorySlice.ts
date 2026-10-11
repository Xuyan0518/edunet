import { useSearchParams } from "react-router-dom";
export function useHistorySlice<T>(
  rows: T[],
  dateOf: (row: T) => string,
  scope: string
) {
  const [params, setParams] = useSearchParams();
  const month = params.get(`${scope}Month`) || "";
  const sorted = [...rows].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const months = [...new Set(sorted.map(row => dateOf(row).slice(0, 7)))];
  const filtered = sorted.filter(
    row => !month || dateOf(row).startsWith(month)
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const page = Math.min(
    pages,
    Math.max(1, Number(params.get(`${scope}Page`)) || 1)
  );
  function update(value: string, pageNumber = 1) {
    const next = new URLSearchParams(params);
    if (value) next.set(`${scope}Month`, value);
    else next.delete(`${scope}Month`);
    next.set(`${scope}Page`, String(pageNumber));
    setParams(next, { replace: true });
  }
  return {
    rows: filtered.slice((page - 1) * 10, page * 10),
    month,
    months,
    page,
    pages,
    total: filtered.length,
    update
  };
}
