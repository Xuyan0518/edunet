
import { toast } from 'sonner';

import { buildApiUrl } from '@/config/api';

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
  parent_id?: string | null;
  created_at: string;
}

export interface DailyProgress {
  id: string;
  student_id: string;
  date: string;
  activities: Record<string, string>;
  mood: string;
  notes: string | null;
  created_at: string;
}

export interface WeeklyFeedback {
  id: string;
  student_id: string;
  week_ending: string;
  academic_progress: string;
  behavior: string;
  recommendations: string | null;
  created_at: string;
}

// API functions
export const api = {
  // Students
  async getStudents(): Promise<Student[] | null> {
    try {
      const response = await fetch(buildApiUrl('students'));
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async getStudent(id: string): Promise<Student | null> {
    try {
      const response = await fetch(buildApiUrl(`students/${id}`));
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(buildApiUrl('parents/unassigned'));
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

  // Daily Progress
  async getStudentProgress(studentId: string): Promise<DailyProgress[] | null> {
    try {
      const response = await fetch(buildApiUrl(`students/${studentId}/progress`));
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createProgress(progress: Omit<DailyProgress, 'id' | 'created_at'>): Promise<DailyProgress | null> {
    try {
      const response = await fetch(buildApiUrl('progress'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(buildApiUrl(`students/${studentId}/feedback`));
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createFeedback(feedback: Omit<WeeklyFeedback, 'id' | 'created_at'>): Promise<WeeklyFeedback | null> {
    try {
      const response = await fetch(buildApiUrl('feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    fetch('/api/subjects').then(r => r.json()),

  // assign (replace) subjects via PUT /api/students/:studentId/subjects
  replaceStudentSubjects: async (studentId: string, subjectIds: string[]) =>
    fetch(`/api/students/${studentId}/subjects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectIds }),
    }).then(async r => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }),
};
