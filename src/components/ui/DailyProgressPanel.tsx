import * as React from "react";
import { parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buildApiUrl } from "@/config/api";
import { getAuthHeaders } from "@/utils/auth";
import { useI18n } from "@/context/I18nContext";

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
  studentId?: string;
  date?: string;
  onEntryClick?: (entry: DailyProgressEntry) => void;
}

const DailyProgressPanel: React.FC<DailyProgressPanelProps> = ({ studentId, date, onEntryClick }) => {
  const { t, language } = useI18n();
  const [entries, setEntries] = React.useState<DailyProgressEntry[]>([]);
  const [studentName, setStudentName] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  // Fetch student info once
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

  // Fetch daily progress
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!studentId) {
        setEntries([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        let res: Response;

        if (date) {
          const qs = `studentId=${encodeURIComponent(studentId)}&date=${encodeURIComponent(date)}`;
          res = await fetch(buildApiUrl(`progress/student?${qs}`), {
            headers: getAuthHeaders(),
          });
          if (!res.ok) {
            if (res.status === 404) {
              if (!cancelled) setEntries([]);
              return;
            }
            throw new Error("fetch-date");
          }
          const one: DailyProgressEntry = await res.json();
          if (!cancelled) setEntries(one ? [one] : []);
        } else {
          res = await fetch(buildApiUrl(`progress/list?studentId=${encodeURIComponent(studentId)}`), {
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error("fetch-list");
          const list: DailyProgressEntry[] = await res.json();
          if (!cancelled) setEntries(list);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, date]);

  if (!studentId) return <p className="text-muted-foreground">{t('dailyProgress.none')}</p>;
  if (loading) return <p>{t('dailyProgress.loading')}</p>;
  if (error) return <p className="text-red-600">{t('dailyProgress.error.load')}</p>;
  if (!entries.length) return <p>{t('dailyProgress.none')}</p>;

  const getAttendanceLabel = (attendance: string) => {
    switch (attendance.toLowerCase()) {
      case 'present':
        return t('attendance.present');
      case 'absent':
        return t('attendance.absent');
      case 'late':
        return t('attendance.late');
      default:
        return attendance;
    }
  };

  const getPerformanceLabel = (performance: string) => {
    switch (performance.toLowerCase()) {
      case 'excellent':
        return t('dailyProgressForm.activity.performance.excellent');
      case 'good':
        return t('dailyProgressForm.activity.performance.good');
      case 'needs improvement':
        return t('dailyProgressForm.activity.performance.needsImprovement');
      default:
        return performance;
    }
  };

  const formatDisplayDate = (date: Date) =>
    date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {studentName ? `${studentName} – ${t('dailyProgress.pageTitle')}` : t('dailyProgress.pageTitle')}
      </h2>

      {entries.map((entry) => {
        const d = parseISO(entry.date);
        const clickable = Boolean(onEntryClick);
        return (
          <Card
            key={entry.id ?? entry.date}
            className={clickable ? "cursor-pointer transition-shadow hover:shadow-md" : undefined}
            onClick={clickable ? () => onEntryClick?.(entry) : undefined}
          >
            <CardHeader>
              <CardTitle className="text-lg">
                {formatDisplayDate(d)} · {t('dailyProgress.attendanceLabel')}:{" "}
                <span className="capitalize">{getAttendanceLabel(entry.attendance)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {entry.activities.map((a, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{a.subject || "—"}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {a.performance ? getPerformanceLabel(a.performance) : "—"}
                    </div>
                  </div>
                  <div className="mt-1 text-sm">{a.description || "—"}</div>
                  {a.notes ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t('dailyProgress.notesLabel')} {a.notes}
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
