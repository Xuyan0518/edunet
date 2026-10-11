import { ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  NotebookPen
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys } from "@/app/queryKeys";
import { can } from "@/app/permissions";
import { studentsApi } from "@/services/studentsApi";
import { StudentSwitcher } from "./StudentSwitcher";
export type StudentSection =
  | "overview"
  | "subjects"
  | "daily-progress"
  | "weekly-feedback"
  | "exams"
  | "papers"
  | "reports"
  | "weekly-plan";
export function StudentWorkspace({
  studentId,
  section,
  actions,
  locked = false
}: {
  studentId: string;
  section: StudentSection;
  actions?: ReactNode;
  locked?: boolean;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const keepActiveVisible = () => {
      const nav = tabs.current;
      const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (nav && active && nav.scrollWidth > nav.clientWidth)
        nav.scrollLeft = Math.max(
          0,
          active.offsetLeft - (nav.clientWidth - active.clientWidth) / 2
        );
    };
    keepActiveVisible();
    window.addEventListener("resize", keepActiveVisible);
    return () => window.removeEventListener("resize", keepActiveVisible);
  }, [section, c]);
  const query = useQuery({
    queryKey: queryKeys.student(user, studentId),
    queryFn: ({ signal }) => studentsApi.get(studentId, signal),
    enabled: !!studentId
  });
  const base = `/students/${encodeURIComponent(studentId)}`;
  const sections = [
    { key: "overview", label: c("概览", "Overview"), icon: LayoutDashboard },
    {
      key: "subjects",
      label: c("科目进度", "Subject progress"),
      icon: BookOpen
    },
    {
      key: "daily-progress",
      label: c("每日记录", "Daily progress"),
      icon: CalendarDays
    },
    {
      key: "weekly-feedback",
      label: c("每周反馈", "Weekly feedback"),
      icon: MessageSquare
    },
    { key: "exams", label: c("考试", "Exams"), icon: GraduationCap },
    {
      key: "papers",
      label: c("测试与练习", "Tests & practices"),
      icon: NotebookPen
    },
    { key: "reports", label: c("学习报告", "Reports"), icon: FileText },
    ...(can(user, "author", studentId)
      ? [
          {
            key: "weekly-plan",
            label: c("学习计划", "Learning plan"),
            icon: ClipboardList
          }
        ]
      : [])
  ];
  return (
    <header className="student-workspace">
      <div className="student-breadcrumb">
        <Link to="/students">
          <ArrowLeft size={15} aria-hidden="true" />
          {user.role === "parent"
            ? c("我的孩子", "My children")
            : c("全部学生", "All students")}
        </Link>
        <span>/</span>
        <span>{sections.find(item => item.key === section)?.label}</span>
      </div>
      <div className="student-heading">
        <div className="student-identity">
          <div className="student-avatar" aria-hidden="true">
            {query.data?.name?.slice(0, 1) || "·"}
          </div>
          <div>
            <p className="web-eyebrow">
              {c("学生学习档案", "STUDENT WORKSPACE")}
            </p>
            <h1>{query.data?.name || c("学生档案", "Student profile")}</h1>
            <p className="text-sm text-muted-foreground">
              {query.data?.grade && `${c("年级", "Grade")} ${query.data.grade}`}{" "}
              · {c("学习记录与成长轨迹", "Learning records and progress")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      <details className="student-switch">
        <summary>{c("切换学生", "Switch student")}</summary>
        <fieldset disabled={locked}>
          <StudentSwitcher
            studentId={studentId}
            section={section === "overview" ? "" : section}
          />
        </fieldset>
      </details>
      <nav
        ref={tabs}
        className="student-tabs"
        aria-label={c("学生档案导航", "Student sections")}
      >
        {sections.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            to={key === "overview" ? base : `${base}/${key}`}
            className={key === section ? "active" : ""}
            aria-current={key === section ? "page" : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
