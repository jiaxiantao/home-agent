-- Run once on PostgreSQL (requires sufficient privileges):
-- psql $DATABASE_URL -f prisma/sql/pg_trgm.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
