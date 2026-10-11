import { useParams, Link } from "react-router-dom";
import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import SubjectTopicsPanel from "@/components/ui/SubjectTopicsPanel";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { can } from "@/app/permissions";
export default function StudentSubjects() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  return (
    <div className="web-page space-y-6">
      <StudentWorkspace studentId={id} section="subjects" />
      <div className="section-heading">
        <div>
          <h2>{c("科目与章节", "Subjects & chapters")}</h2>
          <p>
            {c(
              "展开科目查看章节。更新进度时将保留展开状态。",
              "Open a subject to review its chapters. Your place stays open as you update progress."
            )}
          </p>
        </div>
        {can(user, "author", id) && (
          <Link
            className="text-sm underline"
            to={`/students/${id}/english-tasks`}
          >
            {c("英文项目设置", "English task settings")}
          </Link>
        )}
      </div>
      <SubjectTopicsPanel
        key={id}
        studentId={id}
        readOnly={!can(user, "strictTeacher", id)}
      />
    </div>
  );
}
