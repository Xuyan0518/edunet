import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/app/queryKeys";
import { requestJson } from "@/services/http";
import { AsyncState } from "@/components/shared/AsyncState";
import { HistoryControls } from "@/components/shared/HistorySlice";
import { useHistorySlice } from "@/features/progress/useHistorySlice";
import { DailyRecord, loadDailyRecord } from "@/features/progress/dailySave";
import { DailyRecordCard } from "@/features/progress/DailyRecordCard";
export default function DailyProgressPanel({
  studentId = "",
  date,
  onEntryClick
}: {
  studentId?: string;
  date?: string;
  onEntryClick?: (row: DailyRecord) => void;
}) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.student(user, studentId, "daily-history", date || ""),
    enabled: !!studentId,
    queryFn: async ({ signal }) => {
      if (date) {
        const row = await loadDailyRecord(studentId, date, signal);
        return row ? [row] : [];
      }
      return requestJson<DailyRecord[]>(
        `progress/list?studentId=${encodeURIComponent(studentId)}`,
        { signal }
      );
    }
  });
  const history = useHistorySlice(
    query.data || [],
    row => row.date,
    "dailyprogress"
  );
  return (
    <div className="space-y-5">
      <AsyncState
        pending={query.isPending}
        error={query.error}
        empty={query.isSuccess && !query.data.length}
        retry={() => void query.refetch()}
      />
      {!!query.data?.length && (
        <>
          {!date && <HistoryControls state={history} />}
          {history.rows.map(row => (
            <DailyRecordCard
              key={row.id || row.date}
              record={row}
              onOpen={onEntryClick ? () => onEntryClick(row) : undefined}
            />
          ))}
        </>
      )}
    </div>
  );
}
