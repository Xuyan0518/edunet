export type Role = "admin" | "teacher" | "parent";
export interface Account {
  id: string;
  role: Role;
  displayName: string;
  name: string;
  status: string;
  wechatOpenIdMasked?: string | null;
  authProvider?: string;
}
export interface IdentityGroup {
  identityKey: string;
  displayName: string;
  roles: Account[];
}
export interface ReviewItem {
  id: string;
  type: "weekly" | "quarterly" | "yearly" | "report";
  studentId: string;
  studentName: string;
  title: string;
  summary: string;
  updatedAt: string;
  updatedByName: string;
  weekStarting?: string;
  year?: number;
  quarter?: number;
  visibleToParent: boolean;
  reviewStatus: string;
}
export function roleBody(
  group: IdentityGroup,
  roles: Role[],
  displayName: string
) {
  const source = group.roles[0];
  if (
    !source ||
    !roles.length ||
    roles.some(role => !["admin", "teacher", "parent"].includes(role))
  )
    throw new Error("Choose at least one valid role");
  if (!displayName.trim() || displayName.trim().length > 40)
    throw new Error("Display name must contain 1–40 characters");
  return {
    sourceRole: source.role,
    sourceId: source.id,
    roles: [...new Set(roles)],
    displayName: displayName.trim()
  };
}
export function reviewDestination(item: ReviewItem) {
  if (item.type === "report") return `/reports/${encodeURIComponent(item.id)}`;
  if (item.type === "weekly")
    return `/weekly-feedback?student=${encodeURIComponent(
      item.studentId
    )}&weekStarting=${item.weekStarting}`;
  return `/students/${encodeURIComponent(
    item.studentId
  )}/reports?view=legacy&legacyType=${item.type}&legacyYear=${
    item.year
  }&legacyQuarter=${item.quarter || 1}`;
}
