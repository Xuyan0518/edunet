# Administrator practice score export

Administrators can download an Excel workbook for one or more selected students, a whole grade, or every student. The export includes practice papers and daily English practice tasks, with each stored exercise exported separately.

## Download a workbook

1. Sign in as an administrator and open **Student Data Management / 学生管理**.
2. In **Export practice scores / 导出练习成绩**, choose **Selected students**, **Whole grade**, or **All students**.
3. For selected students, search by name/grade and check the students to include. Searching does not clear previous selections. **Select matching students** adds the visible matches; **Clear selection** clears the selection. For a whole grade, choose its grade label, such as `中一` or `中二`.
4. Set the start and end dates, or keep the past-month default. The displayed count and dates describe the practice export, independently of the roster filters below it.
5. Click **Download practice scores XLSX / 下载练习成绩 XLSX**. The file goes to the browser's normal download location.

**Export student list CSV** is a separate roster export. The individual student profile's **All student records XLSX** remains available for complete historical records.

## Dates and workbook contents

The default range runs from the same calendar day in the previous month through today, including both boundary dates. March 31 defaults to February 28 (February 29 in a leap year). Dates use the school's existing UTC+8 calendar. **Reset to past month** restores today's default. Empty dates use defaults; if only an end date is supplied, the missing start is one calendar month before that end date.

The workbook contains:

- **Export summary:** scope, effective dates, student count, attempt count, and score/source notes.
- **Students:** all students in the chosen scope, including students with no practices during the period, and each student's attempt count.
- **Practice scores:** student identity, grade, date, subject, practice type/name, attempt, numeric score and maximum score, percentage where calculable, notes, and source record.

Zero is preserved as a numeric score. An unscored attempt has a blank score. Individual exercise rows replace their task's aggregate score, preventing double counting. Historical records that store only one combined task score retain it with a note that individual scores are unavailable. Deleted records are excluded. English composition and custom English tasks are included when recorded; unscored free-text tasks retain their available detail. Paper references inside daily activity JSON are not exported again because practice papers are loaded from the paper records.

Headers are frozen and the student/practice tables have Excel filters. Student names and notes are written as literal text, including strings beginning with `=`, rather than formulas. An empty date range still produces a valid workbook with the chosen students and no practice rows.

## API

`POST /api/admin/practice-scores/export` requires an approved administrator session and returns an XLSX attachment with `Cache-Control: no-store`.

Request examples:

```json
{"scope":"selected","studentIds":["11111111-1111-4111-8111-111111111111"],"startDate":"2026-09-11","endDate":"2026-10-11"}
```

```json
{"scope":"grade","grade":"中一"}
```

```json
{"scope":"all"}
```

Dates may be omitted for the past-month default. Invalid/reversed dates, an empty selected list, malformed IDs, and selected students that no longer exist return HTTP 400. Unauthenticated requests return 401; teacher/parent sessions return 403. Exports beyond Excel's worksheet row limit return 422 with instructions to narrow the scope or dates.

## Verification on 11 October 2026

The regression suites passed **311 business tests and 176 web tests**, including 21 new export checks. Production frontend build and frontend TypeScript validation passed, including validation against the committed dependency lockfile. Changed application files passed focused lint; broader pre-existing backend/lint issues remain separate.

Real development-database fixtures verified one/multiple selected students, Secondary 1 and all-student membership, both date boundaries, omitted-date defaults, empty ranges, numeric zero and unscored values, English exercises, deleted-record exclusion, invalid requests, and non-administrator denial. Only the newly created QA fixture students and their practices were removed afterwards.

Actual browser downloads were imported and inspected: one QA student's workbook retained its numeric 8/10 score; a Secondary 1 January 2000 export had six students and no practice rows; an all-student past-month export had all 54 current development students and three practice rows. Counts are snapshots of development data.

Private evidence remains in the gitignored `.dev/feature-export-audit/` directory. Notifications stayed disabled. This feature completion does not certify the other public-launch requirements.
