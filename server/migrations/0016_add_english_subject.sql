INSERT INTO "subjects" ("id", "code", "name", "level")
VALUES ('e0d7b1d2-5d7e-4e88-8f9a-93f0b1e8b9f7', 'ENGLISH', 'English', 'English')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "level" = EXCLUDED."level";
