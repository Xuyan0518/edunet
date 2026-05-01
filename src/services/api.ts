
import { toast } from 'sonner';

import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';

// ... existing code ...

// Error handler helper
const handleError = (error: unknown) => {
  console.error('API Error:', error);
  toast.error('Error connecting to the server. Please try again later.');
  return null;
};

// Student interfaces
export interface Student {
  id: string;
  name: string;
  grade: string;
  parentId?: string | null; // Changed from parent_id to match Drizzle ORM response
  parent_id?: string | null; // Keep for backward compatibility
  createdAt: string;
}

export interface DailyProgress {
  id: string;
  studentId: string; // Maps to student_id in database
  date: string;
  attendance: string; // Database field is attendance
  activities: Array<{ // Database field is activities (jsonb array)
    subject: string;
    description: string;
    performance: string;
    notes?: string;
  }>;
  createdAt: string; // Maps to created_at in database
}

export interface WeeklyFeedback {
  id: string;
  studentId: string; // Maps to student_id in database
  weekStarting: string; // Database field is week_starting
  weekEnding: string; // Database field is week_ending
  summary: string; // Database field is summary
  strengths: string[]; // Database field is strengths (jsonb array)
  areasToImprove: string[]; // Database field is areas_to_improve (jsonb array)
  teacherNotes: string | null; // Database field is teacher_notes
  nextWeekFocus: string | null; // Database field is next_week_focus
  createdAt: string; // Maps to created_at in database
}

// API functions
export const api = {
  // Students
  async getStudents(): Promise<Student[] | null> {
    try {
      const response = await fetch(buildApiUrl('students'), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async getStudent(id: string): Promise<Student | null> {
    try {
      const response = await fetch(buildApiUrl(`students/${id}`), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createStudent(student: { name: string; grade: string; parentId?: string | null }) {
    try {
      const response = await fetch(buildApiUrl('students'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(student),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create student: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('createStudent error:', error);
    }
  },

  async updateStudent(id: string, student: Partial<Student>): Promise<Student | null> {
    try {
      const response = await fetch(buildApiUrl(`students/${id}`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(student),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      toast.success('Student updated successfully');
      return data;
    } catch (error) {
      return handleError(error);
    }
  },

  async getUnassignedParents(): Promise<{ id: string; name: string }[]> {
    try {
      const response = await fetch(buildApiUrl('parents/unassigned'), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async getChildren(): Promise<Student[] | null> {
    try {
      const response = await fetch(buildApiUrl('students/children'));
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  // Daily Progress: students with no record on the given date (defaults to
  // today in Asia/Shanghai server-side). Used by the "今日未记录学生" dashboard
  // card around 20:30 CST when teachers wrap up evening study.
  async getMissingDailyProgress(date?: string): Promise<{
    date: string;
    missing: Array<{ id: string; name: string; grade: string }>;
  } | null> {
    try {
      const url = date
        ? `${buildApiUrl('daily-progress/missing')}?date=${encodeURIComponent(date)}`
        : buildApiUrl('daily-progress/missing');
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  // Upcoming exams card: exams across all students whose effective reminder
  // window includes `date` (default: today CST). Powers the "即将到来的考试" card.
  async getUpcomingExams(date?: string): Promise<{
    date: string;
    upcoming: Array<{
      id: string;
      name: string;
      examType: string | null;
      examDate: string;
      reminderDate: string | null;
      effectiveReminderDate: string | null;
      daysUntil: number;
      student: { id: string; name: string; grade: string };
      subjects: Array<{ name: string; score: string; scope: string | null }>;
    }>;
  } | null> {
    try {
      const url = date
        ? `${buildApiUrl('exams/upcoming')}?date=${encodeURIComponent(date)}`
        : buildApiUrl('exams/upcoming');
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  // Weekly task completion: students whose required English tasks are not all
  // met for the cycle covering `date`. Powers the "本周英文任务未完成学生" card.
  async getIncompleteWeeklyTasks(date?: string): Promise<{
    date: string;
    cycle: { id: string | null; startDate: string; endDate: string; notes: string | null };
    incomplete: Array<{
      id: string;
      name: string;
      grade: string;
      completion: {
        reading: { completed: number; target: number; met: boolean };
        editing: { completed: number; target: number; met: boolean; required: boolean };
        grammar: { completed: number; target: number; met: boolean; required: boolean };
        vocab: { completed: number; target: number; met: boolean };
        composition: { completed: number; target: number; met: boolean };
        allRequiredMet: boolean;
      };
    }>;
  } | null> {
    try {
      const url = date
        ? `${buildApiUrl('weekly-tasks/incomplete')}?date=${encodeURIComponent(date)}`
        : buildApiUrl('weekly-tasks/incomplete');
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  // Daily Progress
  async getStudentProgress(studentId: string): Promise<DailyProgress[] | null> {
    try {
      const response = await fetch(buildApiUrl(`students/${studentId}/progress`), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createProgress(progress: Omit<DailyProgress, 'id' | 'createdAt'>): Promise<DailyProgress | null> {
    try {
      const response = await fetch(buildApiUrl('progress'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(progress),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      toast.success('Progress entry added successfully');
      return data;
    } catch (error) {
      return handleError(error);
    }
  },

  // Weekly Feedback
  async getStudentFeedback(studentId: string): Promise<WeeklyFeedback[] | null> {
    try {
      const response = await fetch(buildApiUrl(`students/${studentId}/feedback`), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createFeedback(feedback: Omit<WeeklyFeedback, 'id' | 'createdAt'>): Promise<WeeklyFeedback | null> {
    try {
      const response = await fetch(buildApiUrl('feedback'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(feedback),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      toast.success('Feedback added successfully');
      return data;
    } catch (error) {
      return handleError(error);
    }
  },

  listSubjects: async () =>
    fetch(buildApiUrl('subjects'), {
      headers: getAuthHeaders(),
    }).then(r => r.json()),

  // assign (replace) subjects via PUT /api/students/:studentId/subjects
  replaceStudentSubjects: async (studentId: string, subjectIds: string[]) =>
    fetch(buildApiUrl(`students/${studentId}/subjects`), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ subjectIds }),
    }).then(async r => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }),

  // get student's current subjects
  getStudentSubjects: async (studentId: string): Promise<string[]> => {
    try {
      const response = await fetch(buildApiUrl(`students/${studentId}/subjects`), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error) || [];
    }
  },
};
