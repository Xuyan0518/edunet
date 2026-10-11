import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import { studentsApi, Student } from "@/services/studentsApi";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Parent = {
  id: string;
  name: string;
  displayName?: string;
  status: string;
};
type Bindings = { studentId: string; parentIds: string[]; parents: Parent[] };
const parentName = (parent: Parent) => parent.displayName || parent.name;

export default function Parents() {
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get("parent") || "";
  const search = params.get("q") || "";
  const [deleting, setDeleting] = useState<Parent>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const parents = useQuery({
    queryKey: queryKeys.resource(user, "parents"),
    queryFn: ({ signal }) => requestJson<Parent[]>("parents", { signal })
  });
  const links = useQuery({
    queryKey: queryKeys.resource(user, `parents/${selected}/students`),
    queryFn: ({ signal }) =>
      requestJson<Student[]>(
        `parents/${encodeURIComponent(selected)}/students`,
        { signal }
      ),
    enabled: !!selected
  });
  async function remove() {
    if (!deleting || pending) return;
    setPending(true);
    setError("");
    try {
      // Recheck both legacy and secondary bindings immediately before the request.
      const linked = await requestJson<Student[]>(
        `parents/${encodeURIComponent(deleting.id)}/students`
      );
      if (linked.length)
        throw new Error(
          c(
            "该家长仍有关联学生，请先处理关联。",
            "This parent still has linked students."
          )
        );
      await requestJson(`parents/${encodeURIComponent(deleting.id)}`, {
        method: "DELETE"
      });
      const refreshed = await parents.refetch();
      if (
        refreshed.error ||
        refreshed.data?.some(parent => parent.id === deleting.id)
      )
        throw new Error(
          c("请刷新确认删除结果。", "Refresh to confirm the result.")
        );
      setDeleting(undefined);
      const next = new URLSearchParams(params);
      next.delete("parent");
      setParams(next);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : c("操作未完成。", "Operation incomplete.")
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="web-content">
      <h1>{c("家长目录", "Parent directory")}</h1>
      <label className="web-field">
        {c("搜索家长", "Search parents")}
        <Input
          value={search}
          onChange={event => {
            const next = new URLSearchParams(params);
            next.set("q", event.target.value);
            setParams(next, { replace: true });
          }}
        />
      </label>
      <AsyncState
        pending={parents.isPending}
        empty={parents.isSuccess && !parents.data.length}
        error={parents.error}
        retry={() => void parents.refetch()}
      />
      <div className="web-grid">
        <div className="web-card space-y-2">
          {parents.data
            ?.filter(parent =>
              parentName(parent)
                .toLowerCase()
                .includes(search.toLowerCase())
            )
            .map(parent => (
              <Button
                key={parent.id}
                variant={selected === parent.id ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("parent", parent.id);
                  setParams(next);
                }}
              >
                {parentName(parent)}
              </Button>
            ))}
        </div>
        {selected && (
          <div className="web-card space-y-3">
            <h2>
              {parentName(
                parents.data?.find(parent => parent.id === selected) || {
                  id: selected,
                  name: c("家长", "Parent"),
                  status: ""
                }
              )}
            </h2>
            <AsyncState
              pending={links.isPending}
              error={links.error}
              empty={links.isSuccess && !links.data.length}
              retry={() => void links.refetch()}
            />
            {links.data?.map(student => (
              <p key={student.id}>
                <Link
                  className="underline"
                  to={`/students/${encodeURIComponent(student.id)}/parents`}
                >
                  {student.name} · {student.grade}
                </Link>
              </p>
            ))}
            <Button
              variant="destructive"
              disabled={
                !links.isSuccess ||
                !!links.data.length ||
                !parents.data?.some(parent => parent.id === selected)
              }
              onClick={() => {
                setError("");
                setDeleting(
                  parents.data?.find(parent => parent.id === selected)
                );
              }}
            >
              {c("删除未关联家长账号", "Delete unlinked parent account")}
            </Button>
            <p className="text-sm">
              {c(
                "主要或其他家长关联存在时，不能删除账号。",
                "Accounts with either primary or secondary student bindings cannot be deleted."
              )}
            </p>
          </div>
        )}
      </div>
      <ConfirmAction
        open={!!deleting}
        title={c(
          `永久删除 ${deleting ? parentName(deleting) : ""}？`,
          `Permanently delete ${deleting ? parentName(deleting) : ""}?`
        )}
        description={c(
          "家长账号不会进入回收站。仅可删除没有任何学生关联的家长。",
          "The parent account will not enter the bin. Only accounts with no student bindings can be deleted."
        )}
        pending={pending}
        error={error}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

export function StudentParents() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [removing, setRemoving] = useState<Parent>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: queryKeys.student(user, id, "parents-editor"),
    queryFn: async ({ signal }) => {
      const [student, bindings, parents] = await Promise.all([
        studentsApi.get(id, signal),
        requestJson<Bindings>(`students/${encodeURIComponent(id)}/parents`, {
          signal
        }),
        requestJson<Parent[]>("parents", { signal })
      ]);
      return { student, bindings, parents };
    }
  });
  async function change(parentId: string, remove: boolean) {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const path = `students/${encodeURIComponent(id)}/parents`;
      await requestJson(
        remove ? `${path}/${encodeURIComponent(parentId)}` : path,
        {
          method: remove ? "DELETE" : "POST",
          ...(!remove ? { body: { parentId } } : {})
        }
      );
      const loaded = await query.refetch();
      if (
        loaded.error ||
        loaded.data.bindings.parentIds.includes(parentId) === remove
      )
        throw new Error("Read after save did not match");
      setChosen("");
      setRemoving(undefined);
      setMessage(c("家长关联已更新。", "Parent bindings updated."));
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
    } catch (err) {
      setRemoving(undefined);
      setMessage(
        err instanceof ApiError && err.status < 500
          ? err.message
          : c(
              "无法确认结果，请刷新关联列表后再操作。",
              "Outcome is unconfirmed. Refresh the bindings before another change."
            )
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="web-content">
      <h1>{c("管理家长关联", "Manage parent bindings")}</h1>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <div className="web-card space-y-4">
          <h2>{query.data.student.name}</h2>
          <p>
            {c(
              "移除主要家长后，服务器会从剩余关联中选择主要家长。其他关联仍保留访问权限。",
              "Removing the primary parent lets the server choose a remaining parent. Other bindings retain access."
            )}
          </p>
          {query.data.bindings.parents.map(parent => (
            <div className="flex flex-wrap gap-3 items-center" key={parent.id}>
              <span>
                {parentName(parent)}
                {parent.id === query.data.student.parentId &&
                  c("（主要家长）", " (primary)")}
              </span>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setRemoving(parent)}
              >
                {c("解除关联", "Unbind")}
              </Button>
            </div>
          ))}
          <label className="web-field">
            {c("添加已批准家长", "Add approved parent")}
            <select
              value={chosen}
              disabled={pending}
              onChange={event => setChosen(event.target.value)}
            >
              <option value="">{c("选择家长", "Choose parent")}</option>
              {query.data.parents
                .filter(
                  parent =>
                    parent.status === "approved" &&
                    !query.data.bindings.parentIds.includes(parent.id)
                )
                .map(parent => (
                  <option value={parent.id} key={parent.id}>
                    {parentName(parent)}
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={!chosen || pending}
            onClick={() => void change(chosen, false)}
          >
            {c("添加关联", "Bind parent")}
          </Button>
          <p>
            <Link
              className="underline"
              to={`/students/${encodeURIComponent(id)}`}
            >
              {c("返回学生档案", "Back to student")}
            </Link>
          </p>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <ConfirmAction
        open={!!removing}
        title={c("解除家长关联？", "Unbind parent?")}
        description={c(
          `${
            removing ? parentName(removing) : ""
          } 将无法通过此关联查看该学生。`,
          `${
            removing ? parentName(removing) : ""
          } will lose access through this binding.`
        )}
        pending={pending}
        onClose={() => setRemoving(undefined)}
        onConfirm={() => removing && void change(removing.id, true)}
      />
    </section>
  );
}
