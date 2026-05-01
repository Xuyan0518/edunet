-- Part 4: Loss-point catalog (categories + points) with seed data.
--
-- Loss points are predefined and teachers select from this catalog when
-- entering English scores. Categories are scoped to the four scored
-- sub-skills: editing, reading, grammar, essay. The seeded items below are
-- a reasonable starter set derived from Singapore secondary English exam
-- patterns; teachers can extend via direct DB edits or a future admin UI.

CREATE TABLE IF NOT EXISTS "loss_point_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(64) NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "loss_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" uuid NOT NULL REFERENCES "loss_point_categories"("id"),
  "code" varchar(64) NOT NULL,
  "label" varchar(200) NOT NULL,
  "description" text,
  "order_index" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_loss_point_category_code"
  ON "loss_points" ("category_id", "code");

-- Seed categories. ON CONFLICT DO NOTHING keeps re-runs idempotent.
INSERT INTO "loss_point_categories" ("code", "name", "order_index") VALUES
  ('editing', '改错', 10),
  ('reading', '阅读理解', 20),
  ('grammar', '语法', 30),
  ('essay',   '作文', 40)
ON CONFLICT ("code") DO NOTHING;

-- Seed loss points. We resolve category ids by code so re-runs don't depend
-- on insertion order. Each (category_id, code) pair is unique, so DO NOTHING
-- on conflict is safe.
INSERT INTO "loss_points" ("category_id", "code", "label", "order_index")
SELECT c."id", v."code", v."label", v."order_index"
FROM (VALUES
  -- editing
  ('editing', 'tense_error',          '时态错误',     10),
  ('editing', 'subject_verb',         '主谓一致',     20),
  ('editing', 'preposition',          '介词错误',     30),
  ('editing', 'article',              '冠词错误',     40),
  ('editing', 'spelling',             '拼写错误',     50),
  ('editing', 'punctuation',          '标点错误',     60),
  ('editing', 'word_form',            '词形/词性',    70),
  -- reading
  ('reading', 'detail',               '细节理解错误', 10),
  ('reading', 'gist',                 '主旨理解错误', 20),
  ('reading', 'inference',            '词义推断错误', 30),
  ('reading', 'reasoning',            '推理判断错误', 40),
  ('reading', 'vocab_block',          '词汇障碍',     50),
  -- grammar
  ('grammar', 'tense_voice',          '时态/语态',    10),
  ('grammar', 'subordinate_clause',   '从句',         20),
  ('grammar', 'non_finite',           '非谓语动词',   30),
  ('grammar', 'inversion_subjunctive','倒装/虚拟',    40),
  ('grammar', 'pos_confusion',        '词性混淆',     50),
  ('grammar', 'relative',             '关系词',       60),
  -- essay
  ('essay',   'off_topic',            '内容偏题',     10),
  ('essay',   'structure',            '结构混乱',     20),
  ('essay',   'simplicity',           '语言简单',     30),
  ('essay',   'grammar_errors',       '语法错误',     40),
  ('essay',   'poor_vocab',           '词汇贫乏',     50),
  ('essay',   'short',                '字数不足',     60)
) AS v("category_code", "code", "label", "order_index")
JOIN "loss_point_categories" c ON c."code" = v."category_code"
ON CONFLICT ("category_id", "code") DO NOTHING;
