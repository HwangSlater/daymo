-- Tests truncate tables, so they get their own database.
-- Runs once when the postgres volume is first created.
CREATE DATABASE daymo_test OWNER daymo;
