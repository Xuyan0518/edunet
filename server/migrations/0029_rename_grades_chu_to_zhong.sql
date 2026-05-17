UPDATE "students"
SET "grade" = CASE "grade"
  WHEN '初一' THEN '中一'
  WHEN '初二' THEN '中二'
  WHEN '初三' THEN '中三'
  WHEN '初四' THEN '中四'
  ELSE "grade"
END
WHERE "grade" IN ('初一', '初二', '初三', '初四');
