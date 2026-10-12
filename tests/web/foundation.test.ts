import { routerPath } from "../../src/app/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  requestJson,
  requestDownload
} from "../../src/services/http";
import { buildApiUrl } from "../../src/config/api";
import { SessionController } from "../../src/features/auth/session";
import { can } from "../../src/app/permissions";
import { queryKeys } from "../../src/app/queryKeys";
import {
  businessToday,
  reportingWeek,
  isBusinessDate,
  addCalendarDays
} from "../../src/domain/businessDates";
import { roles, memoryStorage, secondaryChildren } from "./fixtures";
import { studentsApi } from "../../src/services/studentsApi";
import { toSessionUser, toPublicUser } from "../../server/auth/userIdentity";
let storage: Storage;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
describe("HTTP contracts", () => {
  it("prefixes /api exactly once and rejects external paths", () => {
    expect(buildApiUrl("/api/students")).toBe(buildApiUrl("students"));
    expect(() => buildApiUrl("https://other.test")).toThrow();
  });
  it("keeps bare array, null and empty successful response shapes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([1]))
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await requestJson("students")).toEqual([1]);
    expect(await requestJson("progress")).toBeNull();
    expect(await requestJson("profile")).toBeUndefined();
  });
  it("sends encoded DELETE JSON and bearer credentials", async () => {
    storage.setItem("edunet-token", "opaque-token");
    vi.mocked(fetch).mockResolvedValue(response({}));
    await requestJson("students/x/bin", {
      method: "DELETE",
      body: { recordType: "paper", recordId: "p" }
    });
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer opaque-token"
    );
    expect(JSON.parse(options.body as string)).toEqual({
      recordType: "paper",
      recordId: "p"
    });
  });
  it.each(["CONFLICT", "ACTION_LOCKED", "duplicate"])(
    "preserves %s metadata and never retries",
    async code => {
      vi.mocked(fetch).mockResolvedValue(
        response(
          {
            error: code,
            updatedAt: "version",
            updatedByName: "Teacher",
            lock: { remaining: 2 }
          },
          409
        )
      );
      const error = await requestJson("progress", {
        method: "POST",
        body: {}
      }).catch(error => error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.details.updatedAt).toBe("version");
      expect(error.details.lock).toEqual({ remaining: 2 });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );
  it("uses safe messages for non-JSON errors and preserves forbidden status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>private proxy output</html>", { status: 403 })
    );
    await expect(requestJson("students")).rejects.toMatchObject({
      status: 403,
      message: "Request failed (403)"
    });
  });
  it("downloads real bytes and handles UTF-8 filenames", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("csv bytes", {
        headers: {
          "Content-Disposition":
            "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.csv"
        }
      })
    );
    const file = await requestDownload("export");
    expect(file.filename).toBe("报告.csv");
    expect(await file.blob.text()).toBe("csv bytes");
  });
});
describe("authoritative session lifecycle", () => {
  it("does not authenticate from cached user JSON or malformed storage", async () => {
    storage.setItem("edunet-user", "{bad");
    const controller = new SessionController(storage, vi.fn());
    await controller.restore();
    expect(controller.state.status).toBe("anonymous");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("migrates a legacy admin token after successful validation", async () => {
    storage.setItem("adminToken", "legacy");
    vi.mocked(fetch).mockResolvedValue(response({ user: roles.admin }));
    const controller = new SessionController(storage, vi.fn());
    await controller.restore();
    expect(controller.state.user).toEqual(roles.admin);
    expect(storage.getItem("edunet-token")).toBe("legacy");
  });
  it("retains credentials but hides private UI on network failure, then retries", async () => {
    storage.setItem("edunet-token", "valid");
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response({ user: roles.teacher }));
    const controller = new SessionController(storage, vi.fn());
    await controller.restore();
    expect(controller.state).toEqual({ status: "unavailable", user: null });
    expect(storage.getItem("edunet-token")).toBe("valid");
    await controller.restore();
    expect(controller.state.status).toBe("authenticated");
  });
  it("clears rejected credentials and private caches", async () => {
    storage.setItem("edunet-token", "expired");
    vi.mocked(fetch).mockResolvedValue(response({}, 401));
    const clear = vi.fn();
    const controller = new SessionController(storage, clear);
    await controller.restore();
    expect(controller.state.status).toBe("anonymous");
    expect(storage.getItem("edunet-token")).toBeNull();
    expect(clear).toHaveBeenCalled();
  });
  it("cannot resurrect a logged out session from an in-flight profile read", async () => {
    storage.setItem("edunet-token", "valid");
    let resolve: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const controller = new SessionController(storage, vi.fn());
    const restoring = controller.restore();
    controller.clear();
    resolve(response({ user: roles.teacher }));
    await restoring;
    expect(controller.state.status).toBe("anonymous");
  });
  it("fails closed when reviewer metadata is incomplete", async () => {
    storage.setItem("edunet-token", "reviewer");
    vi.mocked(fetch).mockResolvedValue(
      response({ user: { ...roles.reviewer, reviewerStudentId: null } })
    );
    const controller = new SessionController(storage, vi.fn());
    await controller.restore();
    expect(controller.state.status).toBe("unavailable");
    expect(controller.state.user).toBeNull();
  });
  it("preserves unrelated origin storage and language on logout", () => {
    [
      "edunet:draft:teacher:child",
      "edunet:seen:parent:child",
      "unrelated",
      "edunet-language"
    ].forEach(key => storage.setItem(key, "value"));
    new SessionController(storage, vi.fn()).clear();
    expect(storage.getItem("edunet:draft:teacher:child")).toBeNull();
    expect(storage.getItem("unrelated")).toBe("value");
    expect(storage.getItem("edunet-language")).toBe("value");
  });
  it("does not let another tab restore the legacy token during logout", async () => {
    storage.setItem("edunet-token", "shared-admin");
    storage.setItem("adminToken", "shared-admin");
    const otherTab = new SessionController(storage, vi.fn());
    const remove = storage.removeItem.bind(storage);
    let restoring: Promise<void> | undefined;
    let handlingChange = false;
    vi.spyOn(storage, "removeItem").mockImplementation(key => {
      remove(key);
      // Another browsing context can process the token storage event while
      // this tab is still clearing its remaining localStorage entries.
      if (key === "edunet-token" && !handlingChange) {
        handlingChange = true;
        restoring = otherTab.restore();
        handlingChange = false;
      }
    });
    vi.mocked(fetch).mockResolvedValue(response({ user: roles.admin }));
    new SessionController(storage, vi.fn()).clear();
    await restoring;
    expect(otherTab.state.status).toBe("anonymous");
    expect(storage.getItem("edunet-token")).toBeNull();
    expect(storage.getItem("adminToken")).toBeNull();
  });
  it("treats pending login as unauthenticated", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response(
        {
          status: "pending_approval",
          user: { ...roles.teacher, status: "pending" }
        },
        401
      )
    );
    const controller = new SessionController(storage, vi.fn());
    await expect(controller.login("login", {})).rejects.toMatchObject({
      status: 401
    });
    expect(controller.state.status).toBe("anonymous");
  });
});
describe("scope and calendar fixtures", () => {
  it("preserves strict teacher/admin/manager distinctions and demo writes", () => {
    expect(can(roles.teacher, "createStudent")).toBe(true);
    expect(can(roles.teacher, "manageStudents")).toBe(false);
    expect(can(roles.manager, "manageStudents")).toBe(true);
    expect(can(roles.admin, "author")).toBe(true);
    expect(can(roles.admin, "strictTeacher")).toBe(true);
    expect(can(roles.parent, "strictTeacher")).toBe(false);
    expect(can(roles.parent, "author")).toBe(false);
    expect(can(roles.reviewer, "author", "demo")).toBe(true);
    expect(can(roles.reviewer, "author", "other")).toBe(false);
    expect(can(roles.reviewer, "queues")).toBe(false);
  });
  it("namespaces queries by account, student and date", () => {
    expect(
      queryKeys.student(roles.parent, "child-1", "2026-10-01")
    ).not.toEqual(queryKeys.student(roles.parent, "child-2", "2026-10-01"));
    expect(queryKeys.students(roles.teacher)).not.toEqual(
      queryKeys.students(roles.reviewer)
    );
  });
  it("keeps secondary-only children from the scoped endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(response(secondaryChildren));
    expect(await studentsApi.list()).toEqual(secondaryChildren);
  });
  it("keeps session claims on refresh without accepting them from a DB record", () => {
    const row = {
      id: "reviewer",
      name: "Reviewer",
      isReviewer: true,
      reviewerStudentId: "malicious"
    };
    expect(toPublicUser(row, "teacher")).not.toHaveProperty("isReviewer");
    expect(toSessionUser(row, roles.reviewer)).toMatchObject({
      isReviewer: true,
      reviewerStudentId: "demo",
      canManageStudentsAndParents: false
    });
  });
  it("handles China midnight, leap days and Sunday–Saturday across years", () => {
    expect(businessToday(new Date("2026-10-02T16:00:00Z"))).toBe("2026-10-03");
    expect(isBusinessDate("2025-02-29")).toBe(false);
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(reportingWeek("2026-01-01")).toEqual({
      start: "2025-12-28",
      end: "2026-01-03"
    });
  });
});

it("keeps legacy Response semantics while rejecting token forwarding outside the API", async () => {
  const { fetchApiResponse } = await import("../../src/services/http");
  vi.mocked(fetch).mockResolvedValue(response({ error: "No record" }, 404));
  const result = await fetchApiResponse(buildApiUrl("progress/student"));
  expect(result.status).toBe(404);
  expect(await result.json()).toEqual({ error: "No record" });
  expect(() =>
    fetchApiResponse("https://untrusted.example/api/students")
  ).toThrow();
});
it("does not discard a valid legacy admin session when the shared token is expired", async () => {
  storage.setItem("edunet-token", "expired");
  storage.setItem("adminToken", "valid-admin");
  vi.mocked(fetch)
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(response({ user: roles.admin }));
  const controller = new SessionController(storage, vi.fn());
  await controller.restore();
  expect(controller.state.user?.role).toBe("admin");
  expect(storage.getItem("edunet-token")).toBe("valid-admin");
});
it("expires only the protected request session, not denied resources or rejected logins", async () => {
  const windowMock = new EventTarget();
  vi.stubGlobal("window", windowMock);
  vi.stubGlobal(
    "CustomEvent",
    class extends Event {
      detail: unknown;
      constructor(type: string, options: { detail: unknown }) {
        super(type);
        this.detail = options.detail;
      }
    }
  );
  storage.setItem("edunet-token", "current");
  const expired = vi.fn();
  windowMock.addEventListener("edunet:session-expired", expired);
  vi.mocked(fetch)
    .mockResolvedValueOnce(response({}, 403))
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(response({}, 401));
  await requestJson("students").catch(() => {});
  expect(expired).not.toHaveBeenCalled();
  await requestJson("login", {
    auth: false,
    method: "POST",
    body: {}
  }).catch(() => {});
  expect(expired).not.toHaveBeenCalled();
  await requestJson("students").catch(() => {});
  expect(expired).toHaveBeenCalledTimes(1);
  expect(expired.mock.calls[0][0].detail).toBe("current");
  vi.unstubAllGlobals();
});

it.each([401, 403, 500])(
  "rejects failed binary exports (%s) without returning a file",
  async status => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Export failed" }), {
        status,
        headers: { "Content-Type": "application/json" }
      })
    );
    await expect(requestDownload("export")).rejects.toMatchObject({ status });
  }
);
it.each(["application/json", "text/html"])(
  "rejects a successful non-file export response (%s)",
  async contentType => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("message", { headers: { "Content-Type": contentType } })
    );
    await expect(requestDownload("export")).rejects.toThrow(
      "instead of a file"
    );
  }
);

it("keeps confirmed dirty-form navigation inside the router deployment base", () => {
  expect(routerPath("/school/students?grade=P3", "/school/")).toBe(
    "/students?grade=P3"
  );
  expect(routerPath("/students", "/")).toBe("/students");
  expect(routerPath("/schoolhouse/students", "/school/")).toBe(
    "/schoolhouse/students"
  );
  expect(routerPath("/school?x=1", "/school/")).toBe("/?x=1");
});
