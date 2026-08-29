import { describe, expect, it } from 'vitest';
import { AdminSchema, ParentSchema, TeacherSchema } from '../../server/schema';

describe('password auth provider schema', () => {
  it('accepts password-authenticated teacher and parent records without changing WeChat defaults', () => {
    const teacher = TeacherSchema.parse({
      name: 'Password Teacher',
      email: 'teacher@example.invalid',
      password: 'stored-password-value',
      authProvider: 'password',
    });
    const parent = ParentSchema.parse({
      name: 'Password Parent',
      email: 'parent@example.invalid',
      password: 'stored-password-value',
      authProvider: 'password',
    });
    const admin = AdminSchema.parse({
      name: 'Password Admin',
      email: 'admin@example.invalid',
      password: 'stored-password-value',
      authProvider: 'password',
    });
    const defaultTeacher = TeacherSchema.parse({ name: 'WeChat Teacher' });

    expect(teacher.authProvider).toBe('password');
    expect(parent.authProvider).toBe('password');
    expect(admin.authProvider).toBe('password');
    expect(defaultTeacher.authProvider).toBe('wechat');
  });
});
