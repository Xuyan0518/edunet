# Database Migration: Update Progress Tables to New Schema

This migration updates the `daily_progress` and `weekly_feedback` tables to match the new schema structure defined in `server/schema.ts`.

## What This Migration Does

### Daily Progress Table Changes:
- ✅ Adds `attendance` column (VARCHAR(10)) - replaces `mood`
- ✅ Removes `mood` column
- ✅ Removes `notes` column
- ✅ Keeps `activities` as JSONB (will be used for the new array structure)

### Weekly Feedback Table Changes:
- ✅ Adds `week_starting` column (DATE)
- ✅ Adds `summary` column (TEXT) - replaces `academic_progress`
- ✅ Adds `strengths` column (JSONB array)
- ✅ Adds `areas_to_improve` column (JSONB array)
- ✅ Adds `teacher_notes` column (TEXT) - replaces `recommendations`
- ✅ Adds `next_week_focus` column (TEXT)
- ✅ Removes `academic_progress`, `behavior`, `recommendations` columns
- ✅ Updates unique constraint to use `week_starting`

## How to Run the Migration

### Option 1: Using npm script (Recommended)
```bash
npm run db:update-schema
```

### Option 2: Direct execution
```bash
npx tsx server/run-migration.ts
```

### Option 3: Manual SQL execution
If you prefer to run the SQL manually, you can execute the contents of:
`server/migrations/0007_update_progress_tables_to_new_schema.sql`

## Before Running

1. **Backup your database** (recommended)
2. **Stop your application** to prevent data conflicts
3. **Ensure you have the latest code** with the updated schema.ts

## After Running

1. **Verify the migration** - the script will show the new table structure
2. **Restart your application** - the new schema should now work
3. **Test the progress functionality** - the tabbed interface should now display data correctly

## Data Migration Notes

- **Mood to Attendance**: Existing mood values are mapped to attendance:
  - `happy`, `good`, `excellent` → `present`
  - `sad`, `bad`, `poor` → `absent`
  - `tired`, `okay` → `late`
  - Others → `present` (default)

- **Week Starting**: Calculated as 6 days before `week_ending`

- **Activities**: Existing JSONB data is preserved but will need to be updated to the new array format when editing

## Troubleshooting

If you encounter errors:

1. **Check database connection** - ensure DATABASE_URL is correct
2. **Verify permissions** - your database user needs ALTER TABLE permissions
3. **Check for existing data** - ensure tables exist and have data
4. **Review error logs** - the migration script will show detailed error information

## Rollback (if needed)

If you need to rollback, you can restore from your backup or manually reverse the changes. The migration script logs all operations for reference.

## Next Steps

After successful migration:

1. **Test the new progress interface** - navigate to `/daily-progress`
2. **Create some test progress entries** - use the "Add New Progress" button
3. **Verify data display** - check that progress appears in the correct date tabs
4. **Update existing data** - convert old activities format to new array format as needed
