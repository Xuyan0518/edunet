import { Link } from "react-router-dom";
import { studentsApi } from "@/services/studentsApi";
import { adminParentIds } from "@/features/studentSave";
import { fetchApiResponse } from "@/services/http";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ClipboardList,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Users
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/config/api";

type AccessUser = {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
};

type DailyProgressRecord = {
  id: string;
  studentId: string;
  date: string;
  attendance: string;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  summary?: string | null;
  activities: unknown[];
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type WeeklyFeedbackRecord = {
  id: string;
  studentId: string;
  weekStarting: string;
  weekEnding: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes?: string | null;
  nextWeekFocus?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type QuarterlySummaryRecord = {
  id: string;
  studentId: string;
  year: number;
  quarter: number;
  summary: string;
  startDate?: string | null;
  endDate?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type YearlySummaryRecord = {
  id: string;
  studentId: string;
  year: number;
  summary: string;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type StudentReportRecord = {
  id: string;
  studentId: string;
  reportType: "quarterly" | "yearly" | string;
  title?: string | null;
  startDate: string;
  endDate: string;
  year?: number | null;
  summaryText: string;
  status: string;
  visibleToParent: boolean;
  updatedAt?: string | null;
};

type ManagedStudent = {
  id: string;
  name: string;
  grade: string;
  parentId?: string | null;
  parentIds?: string[];
  parent?: AccessUser | null;
  dailyProgress: DailyProgressRecord[];
  weeklyFeedback: WeeklyFeedbackRecord[];
  quarterlySummaries: QuarterlySummaryRecord[];
  yearlySummaries: YearlySummaryRecord[];
  reports: StudentReportRecord[];
  stats: {
    dailyCount: number;
    weeklyCount: number;
    quarterlyCount: number;
    yearlyCount: number;
    reportCount: number;
    latestDailyDate?: string | null;
    latestWeeklyStart?: string | null;
    latestReportTitle?: string | null;
    missingDailyToday: boolean;
    missingCurrentWeekly: boolean;
  };
};

type AdminPayload = {
  generatedAt: string;
  today: string;
  currentYear: number;
  currentCycle: { startDate: string; endDate: string; notes?: string | null };
  metrics: Record<string, number>;
  access: {
    parents: AccessUser[];
    teachers: AccessUser[];
    pendingParents: AccessUser[];
    pendingTeachers: AccessUser[];
  };
  students: ManagedStudent[];
};

const getAdminHeaders = (): HeadersInit => {
  const token =
    localStorage.getItem("edunet-token") || localStorage.getItem("adminToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

const shortDate = (value?: string | null) =>
  value ? String(value).slice(0, 10) : "No record";

const csvEscape = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCsv = (
  filename: string,
  rows: Array<Record<string, unknown>>
) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentForm, setStudentForm] = useState({
    name: "",
    grade: "",
    parentId: ""
  });
  const { toast } = useToast();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApiResponse(
        buildApiUrl("admin/student-management"),
        {
          headers: getAdminHeaders()
        }
      );
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload?.error || "Failed to load admin dashboard");
      setData(payload);
      setSelectedId(current => current || payload.students?.[0]?.id || "");
    } catch (error) {
      toast({
        title: "Failed to load admin data",
        description:
          error instanceof Error
            ? error.message
            : "Please sign in as an admin again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const grades = useMemo(() => {
    const allGrades = new Set(
      (data?.students || []).map(student => student.grade).filter(Boolean)
    );
    return Array.from(allGrades).sort();
  }, [data]);

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.students || []).filter(student => {
      const matchesQuery =
        !normalized ||
        [
          student.name,
          student.grade,
          student.parent?.name,
          student.parent?.email
        ]
          .filter(Boolean)
          .some(value =>
            String(value)
              .toLowerCase()
              .includes(normalized)
          );
      const matchesGrade =
        gradeFilter === "all" || student.grade === gradeFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "missingDaily" && student.stats.missingDailyToday) ||
        (statusFilter === "missingWeekly" &&
          student.stats.missingCurrentWeekly) ||
        (statusFilter === "noParent" && !student.parentId);
      return matchesQuery && matchesGrade && matchesStatus;
    });
  }, [data, gradeFilter, query, statusFilter]);

  const selectedStudent = useMemo(
    () =>
      (data?.students || []).find(student => student.id === selectedId) ||
      filteredStudents[0] ||
      null,
    [data, filteredStudents, selectedId]
  );

  useEffect(() => {
    if (!selectedStudent) return;
    setStudentForm({
      name: selectedStudent.name,
      grade: selectedStudent.grade,
      parentId: selectedStudent.parentId || ""
    });
  }, [data?.currentYear, selectedStudent]);

  const saveStudent = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const currentStudent = await studentsApi.get(selectedStudent.id);
      const res = await fetchApiResponse(
        buildApiUrl(`students/${selectedStudent.id}`),
        {
          method: "PUT",
          headers: getAdminHeaders(),
          body: JSON.stringify({
            name: studentForm.name,
            grade: studentForm.grade,
            parentIds: adminParentIds(
              currentStudent,
              selectedStudent.parentId,
              studentForm.parentId
            )
          })
        }
      );
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Student profile saved" });
      fetchDashboard();
    } catch (error) {
      toast({ title: "Failed to save student", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const exportStudents = () => {
    downloadCsv(
      "admin-students.csv",
      filteredStudents.map(student => ({
        studentId: student.id,
        name: student.name,
        grade: student.grade,
        parent: student.parent?.name || "",
        parentEmail: student.parent?.email || "",
        dailyRecords: student.stats.dailyCount,
        weeklyRecords: student.stats.weeklyCount,
        termRecords: student.stats.quarterlyCount,
        yearlyRecords: student.stats.yearlyCount,
        reports: student.stats.reportCount,
        latestDailyDate: student.stats.latestDailyDate || "",
        latestWeeklyStart: student.stats.latestWeeklyStart || "",
        missingDailyToday: student.stats.missingDailyToday ? "yes" : "no",
        missingCurrentWeekly: student.stats.missingCurrentWeekly ? "yes" : "no"
      }))
    );
  };

  const exportSelectedRecords = () => {
    if (!selectedStudent) return;
    const rows = [
      ...selectedStudent.dailyProgress.map(record => ({
        type: "daily",
        date: shortDate(record.date),
        rangeEnd: "",
        title: record.attendance,
        summary: record.summary || ""
      })),
      ...selectedStudent.weeklyFeedback.map(record => ({
        type: "weekly",
        date: shortDate(record.weekStarting),
        rangeEnd: shortDate(record.weekEnding),
        title: record.nextWeekFocus || "",
        summary: record.summary
      })),
      ...selectedStudent.quarterlySummaries.map(record => ({
        type: "term",
        date: `${record.year} Q${record.quarter}`,
        rangeEnd: "",
        title: "",
        summary: record.summary
      })),
      ...selectedStudent.yearlySummaries.map(record => ({
        type: "yearly",
        date: String(record.year),
        rangeEnd: "",
        title: "",
        summary: record.summary
      })),
      ...selectedStudent.reports.map(record => ({
        type: record.reportType,
        date: shortDate(record.startDate),
        rangeEnd: shortDate(record.endDate),
        title: record.title || "",
        summary: record.summaryText
      }))
    ];
    downloadCsv(`${selectedStudent.name}-records.csv`, rows);
  };

  const metricItems = [
    { label: "Students", value: data?.metrics.totalStudents || 0, icon: Users },
    {
      label: "Missing daily",
      value: data?.metrics.missingDailyToday || 0,
      icon: ClipboardList
    },
    {
      label: "Missing weekly",
      value: data?.metrics.missingCurrentWeekly || 0,
      icon: FileText
    },
    {
      label: "Pending access",
      value:
        (data?.metrics.pendingParents || 0) +
        (data?.metrics.pendingTeachers || 0),
      icon: ShieldCheck
    }
  ];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
        <div className="mx-auto max-w-7xl text-sm text-slate-600">
          Loading admin data...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-amber-700">
              Admin operations
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">
              Student Data Management
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Current week {data?.currentCycle.startDate} to{" "}
              {data?.currentCycle.endDate}. Last refreshed{" "}
              {data ? new Date(data.generatedAt).toLocaleString() : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={fetchDashboard}
              disabled={loading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportStudents}>
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Export Students
            </Button>
            <Button onClick={exportSelectedRecords} disabled={!selectedStudent}>
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Export Selected
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6">
        <section className="grid gap-3 md:grid-cols-4">
          {metricItems.map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-md border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <Icon className="h-4 w-4 text-amber-700" />
                </div>
                <div className="mt-3 text-3xl font-semibold">{item.value}</div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(420px,0.95fr)_1.4fr]">
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search student, grade, parent"
                  className="h-9"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={gradeFilter}
                  onChange={event => setGradeFilter(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All grades</option>
                  {grades.map(grade => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All status</option>
                  <option value="missingDaily">Missing daily</option>
                  <option value="missingWeekly">Missing weekly</option>
                  <option value="noParent">No parent</option>
                </select>
              </div>
            </div>
            <div className="max-h-[690px] overflow-auto">
              {filteredStudents.map(student => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setSelectedId(student.id)}
                  className={`grid w-full gap-2 border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${
                    selectedStudent?.id === student.id ? "bg-amber-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-sm text-slate-500">
                        {student.grade} ·{" "}
                        {student.parent?.name || "No parent linked"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {student.stats.missingDailyToday && (
                        <Badge variant="outline">Daily</Badge>
                      )}
                      {student.stats.missingCurrentWeekly && (
                        <Badge variant="outline">Weekly</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs text-slate-500">
                    <span>{student.stats.dailyCount} daily</span>
                    <span>{student.stats.weeklyCount} weekly</span>
                    <span>{student.stats.quarterlyCount} term</span>
                    <span>{student.stats.yearlyCount} year</span>
                  </div>
                </button>
              ))}
              {!filteredStudents.length && (
                <div className="p-6 text-sm text-slate-500">
                  No students match the current filters.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            {!selectedStudent ? (
              <div className="p-6 text-sm text-slate-500">
                Select a student to inspect records.
              </div>
            ) : (
              <Tabs defaultValue="summary" className="w-full">
                <div className="border-b border-slate-200 px-4 pt-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">
                        {selectedStudent.name}
                      </h2>
                      <p className="text-sm text-slate-500">
                        {selectedStudent.grade} ·{" "}
                        {selectedStudent.parent?.name || "No parent linked"} ·
                        latest daily{" "}
                        {shortDate(selectedStudent.stats.latestDailyDate)}
                      </p>
                    </div>
                    <TabsList className="grid grid-cols-5">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="daily">Daily</TabsTrigger>
                      <TabsTrigger value="weekly">Weekly</TabsTrigger>
                      <TabsTrigger value="reports">Reports</TabsTrigger>
                      <TabsTrigger value="access">Access</TabsTrigger>
                    </TabsList>
                  </div>
                </div>

                <TabsContent value="summary" className="m-0 grid gap-5 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 p-4">
                      <div className="text-sm text-slate-500">Latest daily</div>
                      <div className="mt-2 text-xl font-semibold">
                        {shortDate(selectedStudent.stats.latestDailyDate)}
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 p-4">
                      <div className="text-sm text-slate-500">
                        Latest weekly
                      </div>
                      <div className="mt-2 text-xl font-semibold">
                        {shortDate(selectedStudent.stats.latestWeeklyStart)}
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 p-4">
                      <div className="text-sm text-slate-500">Reports</div>
                      <div className="mt-2 text-xl font-semibold">
                        {selectedStudent.stats.reportCount}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Name</Label>
                      <Input
                        value={studentForm.name}
                        onChange={event =>
                          setStudentForm(form => ({
                            ...form,
                            name: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Grade</Label>
                      <Input
                        value={studentForm.grade}
                        onChange={event =>
                          setStudentForm(form => ({
                            ...form,
                            grade: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Primary parent (other bindings retained)</Label>
                      <select
                        value={studentForm.parentId}
                        onChange={event =>
                          setStudentForm(form => ({
                            ...form,
                            parentId: event.target.value
                          }))
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">
                          Remove previous primary binding
                        </option>
                        {(data?.access.parents || []).map(parent => (
                          <option key={parent.id} value={parent.id}>
                            {parent.name}{" "}
                            {parent.email ? `(${parent.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Button onClick={saveStudent} disabled={saving}>
                      Save Student Profile
                    </Button>
                  </div>

                  <Button asChild variant="outline">
                    <Link
                      to={`/students/${selectedStudent.id}/reports?view=legacy`}
                    >
                      Open summary editor
                    </Link>
                  </Button>
                </TabsContent>

                <TabsContent value="daily" className="m-0 grid gap-4 p-4">
                  <Button asChild variant="outline">
                    <Link
                      to={
                        selectedStudent.dailyProgress[0]
                          ? `/students/${selectedStudent.id}/daily/${shortDate(
                              selectedStudent.dailyProgress[0].date
                            )}`
                          : `/daily-progress?student=${selectedStudent.id}`
                      }
                    >
                      Open daily workspace
                    </Link>
                  </Button>
                  <RecordList
                    records={selectedStudent.dailyProgress.map(record => ({
                      id: record.id,
                      primary: shortDate(record.date),
                      secondary: `${record.attendance} · ${record.summary ||
                        "No summary"}`
                    }))}
                  />
                </TabsContent>

                <TabsContent value="weekly" className="m-0 grid gap-4 p-4">
                  <Button asChild variant="outline">
                    <Link
                      to={
                        selectedStudent.weeklyFeedback[0]
                          ? `/students/${selectedStudent.id}/weekly/${shortDate(
                              selectedStudent.weeklyFeedback[0].weekStarting
                            )}`
                          : `/weekly-feedback?student=${selectedStudent.id}`
                      }
                    >
                      Open weekly workspace
                    </Link>
                  </Button>
                  <RecordList
                    records={selectedStudent.weeklyFeedback.map(record => ({
                      id: record.id,
                      primary: `${shortDate(record.weekStarting)} - ${shortDate(
                        record.weekEnding
                      )}`,
                      secondary: record.summary
                    }))}
                  />
                </TabsContent>

                <TabsContent value="reports" className="m-0 grid gap-4 p-4">
                  <Button asChild variant="outline">
                    <Link to={`/students/${selectedStudent.id}/reports`}>
                      Open reports workspace
                    </Link>
                  </Button>
                  <RecordList
                    records={[
                      ...selectedStudent.quarterlySummaries.map(record => ({
                        id: record.id,
                        primary: `${record.year} Q${record.quarter}`,
                        secondary: record.summary
                      })),
                      ...selectedStudent.yearlySummaries.map(record => ({
                        id: record.id,
                        primary: `${record.year} yearly`,
                        secondary: record.summary
                      })),
                      ...selectedStudent.reports.map(record => ({
                        id: record.id,
                        primary: `${record.title || record.reportType} · ${
                          record.status
                        }`,
                        secondary: `${shortDate(
                          record.startDate
                        )} - ${shortDate(record.endDate)} · ${
                          record.summaryText
                        }`
                      }))
                    ]}
                  />
                </TabsContent>

                <TabsContent value="access" className="m-0 grid gap-4 p-4">
                  <Button asChild>
                    <Link to="/admin/users">Open account approvals</Link>
                  </Button>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

const RecordList = ({
  records
}: {
  records: Array<{ id: string; primary: string; secondary: string }>;
}) => (
  <div className="overflow-hidden rounded-md border border-slate-200">
    {records.length ? (
      records.map(record => (
        <div
          key={record.id}
          className="border-b border-slate-100 p-3 last:border-b-0"
        >
          <div className="text-sm font-medium">{record.primary}</div>
          <div className="mt-1 line-clamp-2 text-sm text-slate-500">
            {record.secondary}
          </div>
        </div>
      ))
    ) : (
      <div className="p-4 text-sm text-slate-500">No records available.</div>
    )}
  </div>
);

export default AdminDashboard;
