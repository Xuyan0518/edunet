-- Part 8: Academic terms (WA1 / WA2 / WA3 / FINALS) configurable per year.
--
-- Used by Part 7 analytics to default the term-analytics date window when the
-- client omits startDate/endDate. Cycles configured here are independent
-- from weekly_study_cycles (Part 3) — academic terms are coarse multi-month
-- windows; weekly cycles are fine-grained (Sun→Thu) study weeks.

CREATE TABLE IF NOT EXISTS "academic_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "year" integer NOT NULL,
  "term_type" varchar(20) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "updated_by_name" varchar(100),
  CONSTRAINT "academic_term_dates_ok" CHECK ("start_date" <= "end_date")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_academic_terms_year_term"
  ON "academic_terms" ("year", "term_type");
