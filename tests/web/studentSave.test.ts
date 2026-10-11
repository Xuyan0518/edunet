import { expect, it, vi } from "vitest";
import { memoryStorage, secondaryChildren } from "./fixtures";
import {
  parentIdsFor,
  saveStudentProfile,
  saveStudentAssignments
} from "../../src/features/studentSave";
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
it("sends all parent bindings on an ordinary name edit", async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.mocked(fetch).mockResolvedValue(reply(secondaryChildren[0]));
  const parentIds = parentIdsFor(secondaryChildren[0]);
  await saveStudentProfile(
    { name: "Renamed", grade: "P3", parentIds },
    "child-1"
  );
  expect(
    JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string).parentIds
  ).toEqual(["primary-parent", "secondary-parent"]);
});
it("reconciles assignments and preserves progress when saving changed selection", async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.mocked(fetch)
    .mockResolvedValueOnce(reply(["english", "math"]))
    .mockResolvedValueOnce(reply({}))
    .mockResolvedValueOnce(reply(["english"]));
  expect(await saveStudentAssignments("child-1", ["english"])).toEqual([
    "english"
  ]);
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1].body as string)).toEqual({
    subjectIds: ["english"],
    resetProgress: "keep"
  });
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(([, options]) => options.method !== "POST")
  ).toBe(true);
});
it("does not repeat assignment writes after a lost successful response", async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.mocked(fetch).mockImplementation(async () => reply(["english"]));
  await saveStudentAssignments("child-1", ["english"]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    vi.mocked(fetch).mock.calls.every(([, options]) => !options.method)
  ).toBe(true);
});
it("fails a dependent read without claiming assignment success", async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.mocked(fetch).mockResolvedValue(reply({}, 403));
  await expect(
    saveStudentAssignments("child-1", ["english"])
  ).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("uses fresh secondary bindings when the admin aggregate omits them", async () => {
  const { adminParentIds } = await import("../../src/features/studentSave");
  expect(
    adminParentIds(secondaryChildren[0], "primary-parent", "primary-parent")
  ).toEqual(["primary-parent", "secondary-parent"]);
  expect(
    adminParentIds(secondaryChildren[0], "primary-parent", "replacement")
  ).toEqual(["replacement", "secondary-parent"]);
  expect(adminParentIds(secondaryChildren[0], "primary-parent", "")).toEqual([
    "secondary-parent"
  ]);
});
