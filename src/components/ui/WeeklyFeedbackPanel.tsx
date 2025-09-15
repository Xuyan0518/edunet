import * as React from "react";
import { format, parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buildApiUrl } from "@/config/api";

type WeeklyFeedbackEntry = {
  id: string;
  studentId: string;
  weekStarting: string;
  weekEnding: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes?: string;
  nextWeekFocus?: string;
};

interface WeeklyFeedbackPanelProps {
  studentId: string;
  weekStarting?: string;
}

const WeeklyFeedbackPanel: React.FC<WeeklyFeedbackPanelProps> = ({ studentId, weekStarting }) => {
  const [entries, setEntries] = React.useState<WeeklyFeedbackEntry[]>([]);
  const [studentName, setStudentName] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch student name
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

  // Fetch feedback
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (weekStarting) {
          const qs = `studentId=${encodeURIComponent(studentId)}&weekStarting=${encodeURIComponent(weekStarting)}`;
          const res = await fetch(buildApiUrl(`feedback/one?${qs}`));
          if (!res.ok) throw new Error("Failed to fetch weekly feedback (one)");
          const one: WeeklyFeedbackEntry | null = await res.json();
          if (!cancelled) setEntries(one ? [one] : []);
        } else {
          const res = await fetch(buildApiUrl(`feedback/list?studentId=${encodeURIComponent(studentId)}`));
          if (!res.ok) throw new Error("Failed to fetch weekly feedback list");
          const list: WeeklyFeedbackEntry[] = await res.json();
          if (!cancelled) setEntries(list);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load feedback");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, weekStarting]);

  if (loading) return <p>Loading weekly feedback…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!entries.length) return <p>No weekly feedback found.</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {studentName ? `${studentName} – Weekly Feedback` : "Weekly Feedback"}
      </h2>

      {entries.map((e) => {
        const start = parseISO(e.weekStarting);
        const end = parseISO(e.weekEnding);
        return (
          <Card key={e.id ?? e.weekStarting}>
            <CardHeader>
              <CardTitle className="text-lg">
                {format(start, "PPP")} → {format(end, "PPP")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <section>
                <h4 className="font-semibold mb-1">Summary</h4>
                <p className="text-sm">{e.summary || "—"}</p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1">Strengths</h4>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(e.strengths ?? []).length
                      ? e.strengths.map((s, i) => <li key={i}>{s}</li>)
                      : <li className="list-none text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Areas to Improve</h4>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(e.areasToImprove ?? []).length
                      ? e.areasToImprove.map((a, i) => <li key={i}>{a}</li>)
                      : <li className="list-none text-muted-foreground">—</li>}
                  </ul>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1">Teacher Notes</h4>
                  <p className="text-sm">{e.teacherNotes || "—"}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Next Week’s Focus</h4>
                  <p className="text-sm">{e.nextWeekFocus || "—"}</p>
                </div>
              </section>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default WeeklyFeedbackPanel;
