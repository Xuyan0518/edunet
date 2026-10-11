import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import {
  Account,
  IdentityGroup,
  Role,
  roleBody
} from "@/features/admin/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
function RoleEditor({
  group,
  onSaved
}: {
  group: IdentityGroup;
  onSaved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const [roles, setRoles] = useState<Role[]>(group.roles.map(row => row.role));
  const [name, setName] = useState(group.displayName);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState("");
  const ownAdmin = group.roles.some(
    row => row.role === "admin" && row.id === user.id
  );
  async function save() {
    setPending(true);
    let sent = false;
    try {
      const body = roleBody(group, roles, name);
      sent = true;
      await requestJson("admin/users/set-roles", { method: "POST", body });
      await onSaved();
      setConfirm(false);
      setError(c("已保存并重新读取。", "Saved and reread."));
    } catch (err) {
      setUnknown(sent && (!(err instanceof ApiError) || err.status >= 500));
      setError(err instanceof Error ? err.message : "Save failed");
      setConfirm(false);
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="border-t pt-3">
      <summary>{c("编辑姓名与角色", "Edit name and roles")}</summary>
      <div className="space-y-3 pt-3">
        <label className="web-field">
          {c("显示姓名", "Display name")}
          <Input
            maxLength={40}
            disabled={pending || unknown}
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-4">
          {(["admin", "teacher", "parent"] as Role[]).map(role => (
            <label key={role} className="flex gap-2">
              <input
                type="checkbox"
                disabled={pending || unknown || (ownAdmin && role === "admin")}
                checked={roles.includes(role)}
                onChange={event =>
                  setRoles(
                    event.target.checked
                      ? [...roles, role]
                      : roles.filter(value => value !== role)
                  )
                }
              />
              {role === "admin"
                ? c("管理员", "Admin")
                : role === "teacher"
                ? c("教师", "Teacher")
                : c("家长", "Parent")}
            </label>
          ))}
        </div>
        <p>
          {c(
            "角色决定访问权限。此功能需要已有微信身份；保存教师或家长角色会设为已批准，并清除原密码字段。",
            "Roles control access. An existing WeChat identity is required. Saving teacher or parent roles approves them and clears their stored password fields."
          )}
        </p>
        <Button
          disabled={pending || unknown || !roles.length || !name.trim()}
          onClick={() => setConfirm(true)}
        >
          {c("保存角色", "Save roles")}
        </Button>
        <Button
          variant="ghost"
          disabled={pending || unknown}
          onClick={() => {
            setRoles(group.roles.map(row => row.role));
            setName(group.displayName);
          }}
        >
          {c("取消修改", "Cancel changes")}
        </Button>
        {error && <p role="alert">{error}</p>}
        {unknown && (
          <p>
            {c(
              "结果未确认。请刷新账号列表核对当前角色；提议仍保留在此。",
              "Outcome unconfirmed. Refresh accounts to inspect current roles; your proposal is retained here."
            )}
          </p>
        )}
      </div>
      <ConfirmAction
        open={confirm}
        title={c("更新此人的访问角色？", "Update this person’s access roles?")}
        description={`${group.displayName} → ${name}: ${roles.join(", ")}`}
        pending={pending}
        onClose={() => setConfirm(false)}
        onConfirm={() => void save()}
      />
    </details>
  );
}
export default function Accounts() {
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [action, setAction] = useState<{
    row: Account;
    approve: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: queryKeys.resource(user, "admin/accounts"),
    queryFn: async ({ signal }) => {
      const [groups, pending] = await Promise.all([
        requestJson<{ users: IdentityGroup[] }>("admin/users", { signal }),
        requestJson<{ parents: Account[]; teachers: Account[] }>(
          "admin/pending",
          { signal }
        )
      ]);
      return {
        groups: groups.users,
        pending: [
          ...pending.parents.map(row => ({ ...row, role: "parent" as Role })),
          ...pending.teachers.map(row => ({ ...row, role: "teacher" as Role }))
        ]
      };
    }
  });
  async function reload() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    await cache.invalidateQueries({ queryKey: sessionKey(user) });
  }
  async function decide() {
    if (!action) return;
    setPending(true);
    try {
      await requestJson(`admin/${action.approve ? "approve" : "reject"}`, {
        method: "POST",
        body: { id: action.row.id, role: action.row.role }
      });
      await reload();
      setAction(null);
      setMessage(c("状态已更新并重新读取。", "Status updated and reread."));
    } catch (err) {
      setAction(null);
      setMessage(
        (err instanceof Error ? err.message : "Update failed") +
          " " +
          c(
            "请刷新状态核对后再操作。",
            "Refresh the status before another action."
          )
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="web-page space-y-5">
      <h1>{c("账号与审批", "Accounts and approvals")}</h1>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => void query.refetch()}
      >
        {c("刷新账号", "Refresh accounts")}
      </Button>
      {message && <p role="status">{message}</p>}
      <section className="web-card space-y-3">
        <h2>{c("待批准账号", "Pending accounts")}</h2>
        {query.data?.pending.map(row => (
          <article
            key={`${row.role}:${row.id}`}
            className="flex flex-wrap items-center gap-3"
          >
            <span>
              {row.displayName || row.name} · {row.role}
            </span>
            <Button
              disabled={pending}
              onClick={() => setAction({ row, approve: true })}
            >
              {c("批准", "Approve")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setAction({ row, approve: false })}
            >
              {c("拒绝", "Reject")}
            </Button>
          </article>
        ))}
        {query.data && !query.data.pending.length && (
          <p>{c("暂无待批准账号", "No pending accounts")}</p>
        )}
      </section>
      <div className="web-grid">
        <label className="web-field">
          {c("搜索姓名", "Search names")}
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <label className="web-field">
          {c("角色筛选", "Role filter")}
          <select
            value={filter}
            onChange={event => setFilter(event.target.value)}
          >
            <option value="">{c("全部", "All")}</option>
            {["admin", "teacher", "parent"].map(role => (
              <option key={role}>{role}</option>
            ))}
          </select>
        </label>
      </div>
      {query.data?.groups
        .filter(
          group =>
            group.displayName.toLowerCase().includes(search.toLowerCase()) &&
            (!filter || group.roles.some(row => row.role === filter))
        )
        .map(group => (
          <section className="web-card space-y-3" key={group.identityKey}>
            <h2>{group.displayName}</h2>
            {group.roles.map(row => (
              <p key={`${row.role}:${row.id}`}>
                {row.role} · {row.status} ·{" "}
                {row.wechatOpenIdMasked ||
                  c("无微信 OpenID", "No WeChat OpenID")}
              </p>
            ))}
            <RoleEditor group={group} onSaved={reload} />
          </section>
        ))}
      <ConfirmAction
        open={!!action}
        title={
          action?.approve
            ? c("批准此账号？", "Approve this account?")
            : c("拒绝此账号？", "Reject this account?")
        }
        description={`${action?.row.displayName ||
          action?.row.name ||
          ""} · ${action?.row.role || ""}`}
        pending={pending}
        onClose={() => setAction(null)}
        onConfirm={() => void decide()}
      />
    </div>
  );
}
