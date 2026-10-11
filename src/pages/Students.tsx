import { useState } from "react";
import { StudentDeleteDialog } from "@/features/StudentDeleteDialog";
import { Student } from "@/services/studentsApi";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { studentsApi } from "@/services/studentsApi";
import { queryKeys } from "@/app/queryKeys";
import { can } from "@/app/permissions";
import { useWebCopy } from "@/i18n/web";
import { AsyncState } from "@/components/shared/AsyncState";
import { Input } from "@/components/ui/input";
export default function Students({
  management = false
}: {
  management?: boolean;
}) {
  const [deleting, setDeleting] = useState<Student>();
  const { user } = useAuth();
  const c = useWebCopy();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const grade = params.get("grade") || "";
  const query = useQuery({
    queryKey: queryKeys.students(user),
    queryFn: ({ signal }) => studentsApi.list(signal)
  });
  const students = query.data || [];
  const filtered = students.filter(
    student =>
      (!grade || student.grade === grade) &&
      `${student.name} ${student.grade}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  return (
    <section className="web-content">
      <div className="web-heading">
        <div>
          <p className="web-eyebrow">EDUNET / STUDENTS</p>
          <h1>
            {user.role === "parent"
              ? c("我的孩子", "My children")
              : c("学生档案", "Students")}
          </h1>
          <p>
            {c(
              "每一份成长，都值得认真记录。",
              "Every step of growth deserves care."
            )}
          </p>
        </div>
        {can(user, "createStudent") && (
          <Link className="web-primary-link" to="/students/new">
            + {c("添加学生", "Add student")}
          </Link>
        )}
      </div>
      {can(user, "manageStudents") && (
        <Link
          className="underline"
          to={management ? "/students" : "/students/manage"}
        >
          {management
            ? c("返回学生列表", "Back to students")
            : c("管理学生", "Manage students")}
        </Link>
      )}
      <div className="web-card mt-5">
        <div className="section-heading">
          <h2>{c("学生列表", "Student directory")}</h2>
          <span className="record-badge">
            {filtered.length} {c("位学生", "students")}
          </span>
        </div>
        <div className="web-filters">
          <label>
            {c("搜索", "Search")}
            <Input
              value={search}
              onChange={event => filter("q", event.target.value)}
              placeholder={c("姓名或年级", "Name or grade")}
            />
          </label>
          <label>
            {c("年级", "Grade")}
            <select
              value={grade}
              onChange={event => filter("grade", event.target.value)}
            >
              <option value="">{c("全部年级", "All grades")}</option>
              {[...new Set(students.map(student => student.grade))]
                .sort()
                .map(value => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </label>
          {(search || grade) && (
            <Button variant="ghost" onClick={() => setParams({})}>
              {c("清除筛选", "Clear filters")}
            </Button>
          )}
        </div>
        <AsyncState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
          empty={query.isSuccess && !filtered.length}
        />
        {query.isSuccess && !!filtered.length && (
          <div className="web-table">
            <table>
              <thead>
                <tr>
                  <th>{c("学生", "Student")}</th>
                  <th>{c("年级", "Grade")}</th>
                  <th>{c("查看", "Open")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(student => (
                  <tr key={student.id}>
                    <td>
                      <Link to={`/students/${encodeURIComponent(student.id)}`}>
                        {student.name}
                      </Link>
                    </td>
                    <td>{student.grade}</td>
                    <td>
                      <Link
                        className="underline"
                        to={`/students/${encodeURIComponent(student.id)}`}
                      >
                        {c("成长档案 →", "Learning profile →")}
                      </Link>
                      {management && can(user, "manageStudents") && (
                        <div className="flex flex-wrap gap-3 mt-2">
                          <Link
                            className="underline"
                            to={`/students/${encodeURIComponent(
                              student.id
                            )}/edit`}
                          >
                            {c("编辑", "Edit")}
                          </Link>
                          <Link
                            className="underline"
                            to={`/students/${encodeURIComponent(
                              student.id
                            )}/parents`}
                          >
                            {c("家长关联", "Parents")}
                          </Link>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleting(student)}
                          >
                            {c("删除", "Delete")}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.isSuccess && !students.length && user.role === "parent" && (
          <p>
            {c(
              "尚未关联孩子，请联系教师确认家长绑定。",
              "No children are linked yet. Contact a teacher to confirm your parent binding."
            )}
          </p>
        )}
      </div>
      {deleting && (
        <StudentDeleteDialog
          key={deleting.id}
          student={deleting}
          onClose={() => setDeleting(undefined)}
        />
      )}
    </section>
  );
}
