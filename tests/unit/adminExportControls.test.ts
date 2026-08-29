import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/admin/AdminDashboard.tsx'), 'utf8');

describe('admin spreadsheet export controls', () => {
  it('offers selected-student/all-students scope and an inclusive date range for XLSX export', () => {
    expect(source).toContain('Export weekly student feedback');
    expect(source).toContain('Unrecorded fields stay blank.');
    expect(source).toContain('All students');
    expect(source).toContain('Selected student');
    expect(source).toContain('type="date"');
    expect(source).toContain('student-records-export');
    expect(source).toContain('Export Excel');
    expect(source).toContain("response.blob()");
  });
});
