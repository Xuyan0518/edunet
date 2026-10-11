import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { queryKeys } from "@/app/queryKeys";
import { studentsApi } from "@/services/studentsApi";
import { useWebCopy } from "@/i18n/web";
import { AsyncState } from "@/components/shared/AsyncState";
export function StudentSwitcher({
  studentId,
  section = ""
}: {
  studentId: string;
  section?: string;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.students(user),
    queryFn: ({ signal }) => studentsApi.list(signal)
  });
  if (!query.isSuccess)
    return (
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  return (
    <label className="web-field max-w-sm mb-5">
      {c("切换学生", "Switch student")}
      <select
        value={studentId}
        onChange={event =>
          navigate(
            `/students/${encodeURIComponent(event.target.value)}${
              section ? `/${section}` : ""
            }`
          )
        }
      >
        {query.data.map(student => (
          <option value={student.id} key={student.id}>
            {student.name} · {student.grade}
          </option>
        ))}
      </select>
    </label>
  );
}
