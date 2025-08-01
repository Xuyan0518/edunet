
import { toast } from 'sonner';

const API_URL = 'http://localhost:3001/api';

// Error handler helper
const handleError = (error: unknown) => {
  console.error('API Error:', error);
  toast.error('Error connecting to the server. Please try again later.');
  return null;
};

// Student interfaces
export interface Student {
  id: number;
  name: string;
  grade: string;
  parent_id: number;
  created_at: string;
}

export interface DailyProgress {
  id: number;
  student_id: number;
  date: string;
  activities: Record<string, string>;
  mood: string;
  notes: string | null;
  created_at: string;
}

export interface WeeklyFeedback {
  id: number;
  student_id: number;
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
      const response = await fetch(`${API_URL}/students`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async getStudent(id: number): Promise<Student | null> {
    try {
      const response = await fetch(`${API_URL}/students/${id}`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createStudent(student: Omit<Student, 'id' | 'created_at'>): Promise<Student | null> {
    try {
      const response = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(student),
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      toast.success('Student created successfully');
      return data;
    } catch (error) {
      return handleError(error);
    }
  },

  async updateStudent(id: number, student: Partial<Student>): Promise<Student | null> {
    try {
      const response = await fetch(`${API_URL}/students/${id}`, {
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

  // Daily Progress
  async getStudentProgress(studentId: number): Promise<DailyProgress[] | null> {
    try {
      const response = await fetch(`${API_URL}/students/${studentId}/progress`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createProgress(progress: Omit<DailyProgress, 'id' | 'created_at'>): Promise<DailyProgress | null> {
    try {
      const response = await fetch(`${API_URL}/progress`, {
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
  async getStudentFeedback(studentId: number): Promise<WeeklyFeedback[] | null> {
    try {
      const response = await fetch(`${API_URL}/students/${studentId}/feedback`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      return handleError(error);
    }
  },

  async createFeedback(feedback: Omit<WeeklyFeedback, 'id' | 'created_at'>): Promise<WeeklyFeedback | null> {
    try {
      const response = await fetch(`${API_URL}/feedback`, {
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
};
