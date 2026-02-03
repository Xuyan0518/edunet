import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { studentsTable } from '../schema';

/**
 * Middleware to verify that a parent can only access their own child's data
 * This should be used after authenticate middleware
 */
export async function verifyParentStudentAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only apply to parents
    if (req.user?.role !== 'parent') {
      next();
      return;
    }

    // Get studentId from params, body, or query
    const studentId = req.params.studentId || req.params.id || req.body.studentId || req.query.studentId;

    if (!studentId) {
      // If no studentId, allow access (e.g., listing all students)
      next();
      return;
    }

    // Convert to string if it's not already
    const studentIdStr = String(studentId);

    // Verify the student belongs to this parent
    const students = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentIdStr));

    if (students.length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    const student = students[0];

    if (student.parentId !== req.user.id) {
      res.status(403).json({ error: 'Access denied: You can only access your own child\'s data' });
      return;
    }

    next();
  } catch (error) {
    console.error('Error verifying parent-student access:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * Middleware to verify parent can only list their own children
 */
export async function filterParentStudents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only apply to parents
    if (req.user?.role !== 'parent') {
      next();
      return;
    }

    // For GET /api/students, we'll filter in the route handler
    // This middleware just marks that filtering is needed
    req.user = { ...req.user, parentId: req.user.id } as any;
    next();
  } catch (error) {
    console.error('Error in filterParentStudents:', error);
    next();
  }
}
