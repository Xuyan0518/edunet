import * as React from "react";
import { parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buildApiUrl } from "@/config/api";
import { getAuthHeaders } from "@/utils/auth";
import { useI18n } from "@/context/I18nContext";

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
  studentId?: string;
  weekStarting?: string;
  onEntryClick?: (entry: WeeklyFeedbackEntry) => void;
}

const WeeklyFeedbackPanel: React.FC<WeeklyFeedbackPanelProps> = ({ studentId, weekStarting, onEntryClick }) => {
  const { t, language } = useI18n();
  const [entries, setEntries] = React.useState<WeeklyFeedbackEntry[]>([]);
  const [studentName, setStudentName] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  // Fetch student name
  React.useEffect(() => {
    if (!studentId) return;
    (async () => {
      try {
        const res = await fetch(buildApiUrl(`students/${studentId}`), {
          headers: getAuthHeaders(),
        });
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
      setError(false);
      try {
        if (!studentId) {
          if (!cancelled) setEntries([]);
          return;
        }
        if (weekStarting) {
          const qs = `studentId=${encodeURIComponent(studentId)}&weekStarting=${encodeURIComponent(weekStarting)}`;
          const res = await fetch(buildApiUrl(`feedback/one?${qs}`), {
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error("fetch-one");
          const one: WeeklyFeedbackEntry | null = await res.json();
          if (!cancelled) setEntries(one ? [one] : []);
        } else {
          const res = await fetch(buildApiUrl(`feedback/list?studentId=${encodeURIComponent(studentId)}`), {
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error("fetch-list");
          const list: WeeklyFeedbackEntry[] = await res.json();
          if (!cancelled) setEntries(list);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, weekStarting]);

  if (!studentId) return <p className="text-muted-foreground">{t('weeklyFeedback.none')}</p>;
  if (loading) return <p>{t('weeklyFeedback.loading')}</p>;
  if (error) return <p className="text-red-600">{t('weeklyFeedback.error.load')}</p>;
  if (!entries.length) return <p>{t('weeklyFeedback.none')}</p>;

  const formatDisplayDate = (date: Date) =>
    date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {studentName ? `${studentName} – ${t('weeklyFeedback.pageTitle')}` : t('weeklyFeedback.pageTitle')}
      </h2>

      {entries.map((e) => {
        const start = parseISO(e.weekStarting);
        const end = parseISO(e.weekEnding);
        const clickable = Boolean(onEntryClick);
        return (
          <Card
            key={e.id ?? e.weekStarting}
            className={clickable ? "cursor-pointer transition-shadow hover:shadow-md" : undefined}
            onClick={clickable ? () => onEntryClick?.(e) : undefined}
          >
            <CardHeader>
              <CardTitle className="text-lg">
                {formatDisplayDate(start)} -> {formatDisplayDate(end)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <section>
                <h4 className="font-semibold mb-1">{t('weeklyFeedback.summary')}</h4>
                <p className="text-sm">{e.summary || "—"}</p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1">{t('weeklyFeedback.strengths')}</h4>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(e.strengths ?? []).length
                      ? e.strengths.map((s, i) => <li key={i}>{s}</li>)
                      : <li className="list-none text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t('weeklyFeedback.areas')}</h4>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(e.areasToImprove ?? []).length
                      ? e.areasToImprove.map((a, i) => <li key={i}>{a}</li>)
                      : <li className="list-none text-muted-foreground">—</li>}
                  </ul>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1">{t('weeklyFeedback.teacherNotes')}</h4>
                  <p className="text-sm">{e.teacherNotes || "—"}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t('weeklyFeedback.nextWeekFocus')}</h4>
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
