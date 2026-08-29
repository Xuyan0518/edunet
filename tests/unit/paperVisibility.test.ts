import { describe, expect, it } from 'vitest';
import { toParentPaperDto } from '../../server/utils/paperVisibility';

describe('toParentPaperDto', () => {
  it('omits teacher evaluation and internal catalog metadata', () => {
    const result = toParentPaperDto({
      id: 'paper-1',
      studentId: 'student-1',
      subjectId: 'subject-1',
      subjectName: 'English',
      typeId: 'type-1',
      typeName: 'Quiz',
      schoolId: 'school-1',
      schoolName: 'Internal school',
      description: 'Reading quiz',
      strengths: 'Strong inference',
      improvements: 'Review vocabulary',
      date: '2026-08-18',
      score: 85,
      total: 100,
      grade: 'B',
      scoreLevel: 'good',
      scoreStatus: 'complete',
      updatedAt: new Date('2026-08-18T01:00:00Z'),
      updatedByName: 'Teacher A',
    });

    expect(result).toEqual({
      id: 'paper-1',
      studentId: 'student-1',
      subjectName: 'English',
      description: 'Reading quiz',
      date: '2026-08-18',
      score: 85,
      total: 100,
      grade: 'B',
      scoreLevel: 'good',
      scoreStatus: 'complete',
    });
    expect(result).not.toHaveProperty('strengths');
    expect(result).not.toHaveProperty('typeName');
    expect(result).not.toHaveProperty('schoolName');
    expect(result).not.toHaveProperty('updatedAt');
  });
});
