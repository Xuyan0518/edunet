import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys } from "@/app/queryKeys";
import { loadStudentSubjects } from "@/services/studentSubjects";
import { AsyncState } from "./AsyncState";
export function AssignedSubjects({ studentId }: { studentId: string }) {
  const { user } = useAuth();
  const c = useWebCopy();
  const query = useQuery({
    queryKey: queryKeys.student(user, studentId, "assigned-subjects"),
    queryFn: ({ signal }) => loadStudentSubjects(studentId, signal)
  });
  return (
    <div className="assigned-subjects">
      <span>{c("已选科目", "Assigned subjects")}</span>
      <AsyncState error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <span>{c("加载中…", "Loading…")}</span>
      ) : (
        query.data?.map(subject => (
          <span className="subject-chip" key={subject.id}>
            {subject.name}
          </span>
        ))
      )}
      {query.data?.length === 0 && (
        <span>{c("尚未关联科目", "No assigned subjects")}</span>
      )}
    </div>
  );
}
