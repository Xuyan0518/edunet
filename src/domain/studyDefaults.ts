import { isBusinessDate } from './businessDates';
import type { StudySettings } from '@/features/settings/contracts';
// Mini daily-progress/detail.js:getStudyAttendanceDefaults. Use only for a new form.
export function studyAttendanceDefaults(date: string, settings: StudySettings) {
  if (!isBusinessDate(date) || !settings.enabled || !settings.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) return { attendanceStart: '', attendanceEnd: '' };
  return { attendanceStart: settings.startTime, attendanceEnd: settings.endTime };
}
