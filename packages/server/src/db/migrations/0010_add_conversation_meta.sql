ALTER TABLE conversations ADD COLUMN favorite integer NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN auto_renamed integer NOT NULL DEFAULT 0;
