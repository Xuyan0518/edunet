import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  MessageSquare,
  BookOpen,
  GraduationCap,
  NotebookPen,
  FileText,
  Edit
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys } from "@/app/queryKeys";
import { can } from "@/app/permissions";
import { studentsApi } from "@/services/studentsApi";
import { loadStudentSubjects } from "@/services/studentSubjects";
import { requestJson } from "@/services/http";
import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import { AsyncState } from "@/components/shared/AsyncState";
import { DownloadButton } from "@/components/shared/DownloadButton";
import { Button } from "@/components/ui/button";
import { DailyRecord } from "@/features/progress/dailySave";
import { DailyRecordCard } from "@/features/progress/DailyRecordCard";
import { WeeklyRecord } from "@/features/weekly/contracts";
import { businessToday } from "@/domain/businessDates";
export default function StudentProfile() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const base = `/students/${encodeURIComponent(id)}`;
  const student = useQuery({
    queryKey: queryKeys.student(user, id),
    queryFn: ({ signal }) => studentsApi.get(id, signal)
  });
  const daily = useQuery({
    queryKey: queryKeys.student(user, id, "daily-history"),
    queryFn: ({ signal }) =>
      requestJson<DailyRecord[]>(
        `progress/list?studentId=${encodeURIComponent(id)}`,
        { signal }
      ),
    enabled: student.isSuccess
  });
  const weekly = useQuery({
    queryKey: queryKeys.student(user, id, "weekly-history"),
    queryFn: ({ signal }) =>
      requestJson<WeeklyRecord[]>(
        `feedback/list?studentId=${encodeURIComponent(id)}`,
        { signal }
      ),
    enabled: student.isSuccess
  });
  const subjects = useQuery({
    queryKey: queryKeys.student(user, id, "assigned-subjects"),
    queryFn: ({ signal }) => loadStudentSubjects(id, signal),
    enabled: student.isSuccess
  });
  const latest = [...(daily.data || [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  )[0];
  const lastWeek = [...(weekly.data || [])].sort((a, b) =>
    b.weekStarting.localeCompare(a.weekStarting)
  )[0];
  const sections = [
    {
      path: "daily-progress",
      title: c("每日记录", "Daily progress"),
      description: c(
        "出勤、学习内容与教师评语",
        "Attendance, activities and teacher feedback"
      ),
      icon: CalendarDays,
      count: daily.data?.length
    },
    {
      path: "weekly-feedback",
      title: c("每周反馈", "Weekly feedback"),
      description: c(
        "回顾每一天，明确下一步学习重点",
        "Daily highlights and next steps for the week"
      ),
      icon: MessageSquare,
      count: weekly.data?.length
    },
    {
      path: "subjects",
      title: c("科目进度", "Subject progress"),
      description: c(
        "已选科目与章节完成情况",
        "Assigned subjects and chapter completion"
      ),
      icon: BookOpen,
      count: subjects.data?.length
    },
    {
      path: "exams",
      title: c("考试", "Exams"),
      description: c(
        "考试安排与各科成绩",
        "Scheduled exams and subject scores"
      ),
      icon: GraduationCap
    },
    {
      path: "papers",
      title: c("测试与练习", "Tests & practices"),
      description: c(
        "试卷成绩、优点与改进方向",
        "Practice results, strengths and improvements"
      ),
      icon: NotebookPen
    },
    {
      path: "reports",
      title: c("学习报告", "Learning reports"),
      description: c(
        "学期与年度学习回顾",
        "Semester and yearly learning reviews"
      ),
      icon: FileText
    }
  ];
  return (
    <div className="web-page space-y-7">
      <StudentWorkspace
        studentId={id}
        section="overview"
        actions={
          <>
            {can(user, "manageStudents") && (
              <Button asChild variant="outline">
                <Link to={`${base}/edit`}>
                  <Edit size={15} className="mr-2" />
                  {c("编辑档案", "Edit profile")}
                </Link>
              </Button>
            )}
            {can(user, "author", id) && (
              <Button asChild>
                <Link
                  to={`${base}/daily-progress?tab=form&date=${businessToday()}`}
                >
                  <CalendarDays size={15} className="mr-2" />
                  {c("新增每日记录", "New daily record")}
                </Link>
              </Button>
            )}
          </>
        }
      />
      <AsyncState
        pending={student.isPending}
        error={student.error}
        retry={() => void student.refetch()}
      />
      {student.data && (
        <>
          <div className="section-heading">
            <div>
              <h2>{c("学习概览", "Learning overview")}</h2>
              <p>
                {c(
                  "选择一个学习板块，查看完整记录。",
                  "Choose a section to explore the full learning history."
                )}
              </p>
            </div>
          </div>
          <div className="student-section-grid">
            {sections.map(({ path, title, description, icon: Icon, count }) => (
              <Link
                className="student-section-card"
                to={`${base}/${path}`}
                key={path}
              >
                <div className="flex items-center justify-between">
                  <span className="section-icon">
                    <Icon size={21} />
                  </span>
                  <ArrowUpRight size={17} className="text-muted-foreground" />
                </div>
                <h3>
                  {title}
                  {count !== undefined && (
                    <span className="web-count">{count}</span>
                  )}
                </h3>
                <p>{description}</p>
              </Link>
            ))}
          </div>
          <section className="web-card">
            <div className="section-heading">
              <div>
                <h2>{c("已选科目", "Assigned subjects")}</h2>
                <p>
                  {c(
                    "新增记录使用以下已关联科目。",
                    "These subjects are available when adding learning records."
                  )}
                </p>
              </div>
              <Link to={`${base}/subjects`} className="text-sm underline">
                {c("查看进度", "View progress")}
              </Link>
            </div>
            <AsyncState
              pending={subjects.isPending}
              error={subjects.error}
              retry={() => void subjects.refetch()}
            />
            <div className="flex flex-wrap gap-2">
              {subjects.data?.map(subject => (
                <span className="subject-chip" key={subject.id}>
                  {subject.name}
                </span>
              ))}
            </div>
            {subjects.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {c(
                  "尚未关联科目。请先在科目进度中设置。",
                  "No subjects assigned yet. Set them up in Subject progress."
                )}
              </p>
            )}
          </section>
          <div className="overview-recent-grid">
            <section>
              <div className="section-heading">
                <h2>{c("最近每日记录", "Latest daily record")}</h2>
                <Link
                  to={`${base}/daily-progress`}
                  className="text-sm underline"
                >
                  {c("查看全部", "View all")}
                </Link>
              </div>
              <AsyncState
                pending={daily.isPending}
                error={daily.error}
                empty={daily.isSuccess && !latest}
                retry={() => void daily.refetch()}
              />
              {latest && <DailyRecordCard record={latest} compact />}
            </section>
            <section>
              <div className="section-heading">
                <h2>{c("最近每周反馈", "Latest weekly feedback")}</h2>
                <Link
                  to={`${base}/weekly-feedback`}
                  className="text-sm underline"
                >
                  {c("查看全部", "View all")}
                </Link>
              </div>
              <AsyncState
                pending={weekly.isPending}
                error={weekly.error}
                empty={weekly.isSuccess && !lastWeek}
                retry={() => void weekly.refetch()}
              />
              {lastWeek && (
                <article className="web-card space-y-4">
                  <span className="record-badge">
                    {lastWeek.weekStarting} — {lastWeek.weekEnding}
                  </span>
                  <p className="line-clamp-6 whitespace-pre-wrap leading-relaxed">
                    {lastWeek.summary || c("暂无总结", "No summary yet")}
                  </p>
                  <Button asChild variant="outline">
                    <Link
                      to={`${base}/weekly-feedback?weekStarting=${
                        lastWeek.weekStarting
                      }&tab=${can(user, "author", id) ? "form" : "view"}`}
                    >
                      {c("查看这一周", "Open this week")}
                      <ArrowUpRight size={14} className="ml-2" />
                    </Link>
                  </Button>
                </article>
              )}
            </section>
          </div>
          {(can(user, "manageStudents") ||
            can(user, "admin") ||
            can(user, "bin", id)) && (
            <section className="student-tools">
              <h2>{c("档案工具", "Profile tools")}</h2>
              <div className="flex flex-wrap gap-2">
                {can(user, "manageStudents") && (
                  <Button asChild variant="outline">
                    <Link to={`${base}/parents`}>
                      {c("管理家长关联", "Manage parents")}
                    </Link>
                  </Button>
                )}
                {can(user, "bin", id) && (
                  <Button asChild variant="outline">
                    <Link to={`${base}/bin`}>{c("回收站", "Recycle bin")}</Link>
                  </Button>
                )}
                {can(user, "admin") && (
                  <>
                    <DownloadButton
                      endpoint={`admin/students/${id}/records-export`}
                      label={c("下载全部记录 XLSX", "All student records XLSX")}
                    />
                    <DownloadButton
                      endpoint={`admin/students/${id}/wellbeing-export`}
                      label={c("学习情况 XLS", "Wellbeing XLS")}
                    />
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
