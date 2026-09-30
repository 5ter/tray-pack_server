-- Add a stable idempotency key so client retries cannot count one PLC result twice.
-- Run this once after 001_production_tables.sql. Existing result rows receive
-- generated IDs before the column is made required and unique.

ALTER TABLE inspection_results
    ADD COLUMN event_id CHAR(36) NULL AFTER id;

UPDATE inspection_results
SET event_id = UUID()
WHERE event_id IS NULL;

ALTER TABLE inspection_results
    MODIFY COLUMN event_id CHAR(36) NOT NULL;

ALTER TABLE inspection_results
    ADD UNIQUE KEY uq_inspection_results_event_id (event_id);
