-- Add a self-reported operator name/ID to each inspection result.
-- Existing historical results are marked UNKNOWN; no legacy tables are changed.

ALTER TABLE inspection_results
    ADD COLUMN operator_name VARCHAR(100) NOT NULL DEFAULT 'UNKNOWN' AFTER machine_id;
