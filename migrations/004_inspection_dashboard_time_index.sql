-- Speeds up date-filtered dashboard reports on the inspection history.
-- Run once against the tray database during a quiet period.
ALTER TABLE inspection_results
    ADD KEY ix_inspection_results_time (occurred_at_utc);
