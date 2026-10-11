import { expect, it } from "vitest";
import { studyAttendanceDefaults } from "@/domain/studyDefaults";
const settings = {
  enabled: true,
  days: [0, 1, 2, 3, 4],
  startTime: "18:30",
  endTime: "21:15"
};
it("initializes only configured new-form days with calendar-safe dates", () => {
  expect(studyAttendanceDefaults("2026-10-04", settings)).toEqual({
    attendanceStart: "18:30",
    attendanceEnd: "21:15"
  });
  expect(studyAttendanceDefaults("2026-10-03", settings)).toEqual({
    attendanceStart: "",
    attendanceEnd: ""
  });
  expect(
    studyAttendanceDefaults("2026-10-04", { ...settings, enabled: false })
  ).toEqual({ attendanceStart: "", attendanceEnd: "" });
  expect(studyAttendanceDefaults("2026-02-30", settings)).toEqual({
    attendanceStart: "",
    attendanceEnd: ""
  });
});
