import { expect, it } from "vitest";
import {
  allowedParents,
  catalogPayload,
  catalogPath,
  Topic
} from "@/features/curriculum/contracts";
it("preserves textual ordering and avoids sending server-only properties", () => {
  expect(
    catalogPayload("topic", {
      code: " 1.01 ",
      title: " Topic ",
      orderIndex: "001.010",
      parentTopicId: "",
      id: "ignored"
    })
  ).toEqual({
    code: "1.01",
    title: "Topic",
    orderIndex: "001.010",
    parentTopicId: null
  });
});
it("uppercases subject codes and retains inactive and required flags", () => {
  expect(
    catalogPayload("subject", {
      code: " science ",
      name: "Science",
      levelId: "level",
      sortOrder: 0,
      isActive: false,
      isRequired: true
    })
  ).toMatchObject({
    code: "SCIENCE",
    isActive: false,
    isRequired: true,
    sortOrder: 0
  });
});
it("rejects truncating names and invalid order instead of silently changing them", () => {
  expect(() => catalogPayload("level", { name: "x".repeat(65) })).toThrow();
  for (const sortOrder of [-1, 10000, 1.5, NaN])
    expect(() =>
      catalogPayload("level", { name: "Level", sortOrder })
    ).toThrow();
});
it("excludes a topic and descendants from its possible parents", () => {
  const topic = (id: string, parentTopicId?: string): Topic => ({
    id,
    parentTopicId,
    subjectId: "s",
    code: id,
    title: id,
    orderIndex: id
  });
  const rows = [topic("a"), topic("b", "a"), topic("c", "b"), topic("d")];
  expect(allowedParents(rows, "a").map(row => row.id)).toEqual(["d"]);
  expect(allowedParents(rows, "b").map(row => row.id)).toEqual(["a", "d"]);
});
it("uses existing endpoints and requires a saved subject before adding topics", () => {
  expect(catalogPath("topic", undefined, "a/b")).toBe("subjects/a%2Fb/topics");
  expect(catalogPath("topic", "t")).toBe("topics/t");
  expect(catalogPath("level", "l")).toBe("subject-levels/l");
  expect(() => catalogPath("topic")).toThrow();
});
