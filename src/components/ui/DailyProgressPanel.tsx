import * as React from "react";
import { format, parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buildApiUrl } from "@/config/api";

type Activity = {
  subject: string;
  description: string;
  performance: string;
  notes?: string;
};

type DailyProgressEntry = {
  id: string;
  studentId: string;
  date: string; 
  attendance: "present" | "absent" | "late";
  activities: Activity[];
};

interface DailyProgressPanelProps {
  studentId: string;
  date?: string;
}

const DailyProgressPanel: React.FC<DailyProgressPanelProps> = ({ studentId, date }) => {
  const [entries, setEntries] = React.useState<DailyProgressEntry[]>([]);
  const [studentName, setStudentName] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch student info once
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(buildApiUrl(`students/${studentId}`));
        if (res.ok) {
          const s = await res.json();
          setStudentName(s.name);
        }
      } catch {
        setStudentName("");
      }
    })();
  }, [studentId]);

  // Fetch daily progress
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        let res: Response;

        if (date) {
          const qs = `studentId=${encodeURIComponent(studentId)}&date=${encodeURIComponent(date)}`;
          res = await fetch(buildApiUrl(`progress/student?${qs}`));
          if (!res.ok) {
            if (res.status === 404) {
              if (!cancelled) setEntries([]);
              return;
            }
            throw new Error("Failed to fetch progress for date");
          }
          const one: DailyProgressEntry = await res.json();
          if (!cancelled) setEntries(one ? [one] : []);
        } else {
          res = await fetch(buildApiUrl(`progress/list?studentId=${encodeURIComponent(studentId)}`));
          if (!res.ok) throw new Error("Failed to fetch progress list");
          const list: DailyProgressEntry[] = await res.json();
          if (!cancelled) setEntries(list);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load progress");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, date]);

  if (loading) return <p>Loading daily progress…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!entries.length) return <p>No daily progress found.</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {studentName ? `${studentName} – Daily Progress` : "Daily Progress"}
      </h2>

      {entries.map((entry) => {
        const d = parseISO(entry.date);
        return (
          <Card key={entry.id ?? entry.date}>
            <CardHeader>
              <CardTitle className="text-lg">
                {format(d, "PPP")} · Attendance:{" "}
                <span className="capitalize">{entry.attendance}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {entry.activities.map((a, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{a.subject || "—"}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {a.performance || "—"}
                    </div>
                  </div>
                  <div className="mt-1 text-sm">{a.description || "—"}</div>
                  {a.notes ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Notes: {a.notes}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default DailyProgressPanel;
