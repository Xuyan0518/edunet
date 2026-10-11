export type CatalogKind = "level" | "subject" | "topic";
export type CatalogValues = Record<string, string | number | boolean>;
export interface Topic {
  id: string;
  subjectId: string;
  code: string;
  title: string;
  parentTopicId?: string;
  orderIndex: string;
  children?: Topic[];
}
export interface Subject {
  id: string;
  code: string;
  name: string;
  chineseName?: string;
  englishName?: string;
  levelId: string;
  level?: string;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  topics?: Topic[];
}
export interface Level {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
  subjects?: Subject[];
}
export interface Hierarchy {
  levels: Level[];
  defaultLevelId: string;
}
export const flattenTopics = (topics: Topic[]): Topic[] =>
  topics.flatMap(topic => [topic, ...flattenTopics(topic.children || [])]);
export function allowedParents(topics: Topic[], currentId?: string): Topic[] {
  const excluded = new Set(currentId ? [currentId] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const topic of topics)
      if (
        topic.parentTopicId &&
        excluded.has(topic.parentTopicId) &&
        !excluded.has(topic.id)
      ) {
        excluded.add(topic.id);
        changed = true;
      }
  }
  return topics.filter(topic => !excluded.has(topic.id));
}
export function catalogPayload(kind: CatalogKind, values: CatalogValues) {
  const result: Record<string, unknown> = {};
  const bounds =
    kind === "level"
      ? { name: 64, description: 240 }
      : kind === "subject"
      ? {
          code: 64,
          name: 200,
          chineseName: 120,
          englishName: 120,
          levelId: 100
        }
      : { code: 64, title: 256, orderIndex: 32, parentTopicId: 100 };
  for (const [field, max] of Object.entries(bounds)) {
    const value = String(values[field] ?? "").trim();
    if (value.length > max)
      throw new Error(`${field}: maximum ${max} characters`);
    result[field] =
      field === "parentTopicId"
        ? value || null
        : field === "code" && kind === "subject"
        ? value.toUpperCase()
        : value;
  }
  const required =
    kind === "level"
      ? ["name"]
      : kind === "subject"
      ? ["code", "name", "levelId"]
      : ["code", "title"];
  if (required.some(field => !result[field]))
    throw new Error("Complete all required fields");
  if (kind !== "topic") {
    const order = Number(values.sortOrder ?? 0);
    if (!Number.isInteger(order) || order < 0 || order > 9999)
      throw new Error("Invalid sort order");
    result.sortOrder = order;
    result.isActive = values.isActive !== false;
  }
  if (kind === "subject") result.isRequired = values.isRequired === true;
  return result;
}
export function catalogPath(
  kind: CatalogKind,
  id?: string,
  subjectId?: string
) {
  if (kind === "level")
    return `subject-levels${id ? `/${encodeURIComponent(id)}` : ""}`;
  if (kind === "subject")
    return `subjects${id ? `/${encodeURIComponent(id)}` : ""}`;
  if (id) return `topics/${encodeURIComponent(id)}`;
  if (!subjectId) throw new Error("Select a persisted subject first");
  return `subjects/${encodeURIComponent(subjectId)}/topics`;
}
