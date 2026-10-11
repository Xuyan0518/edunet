ALTER TABLE teacher ALTER COLUMN password TYPE varchar(128);
--> statement-breakpoint
ALTER TABLE parents ALTER COLUMN password TYPE varchar(128);
--> statement-breakpoint
ALTER TABLE teacher ADD COLUMN google_subject varchar(255) UNIQUE, ADD COLUMN wechat_web_open_id varchar(64) UNIQUE;
--> statement-breakpoint
ALTER TABLE parents ADD COLUMN google_subject varchar(255) UNIQUE, ADD COLUMN wechat_web_open_id varchar(64) UNIQUE;
