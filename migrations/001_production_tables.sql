-- New tray inspection tables. Existing label_print_data and user_log_in data
-- are intentionally left in place.

CREATE TABLE IF NOT EXISTS registered_parts (
    part_number VARCHAR(100) NOT NULL,
    PRIMARY KEY (part_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inspection_results (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    part_number VARCHAR(100) NOT NULL,
    run_id CHAR(36) NOT NULL,
    status ENUM('OK', 'NG') NOT NULL,
    machine_id VARCHAR(64) NOT NULL,
    occurred_at_utc DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_inspection_results_run_status (run_id, status),
    KEY ix_inspection_results_part_time (part_number, occurred_at_utc),
    CONSTRAINT fk_inspection_results_part
        FOREIGN KEY (part_number) REFERENCES registered_parts (part_number)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carry existing registered part numbers forward into the new master list.
INSERT IGNORE INTO registered_parts (part_number)
SELECT DISTINCT TRIM(PN)
FROM label_print_data
WHERE PN IS NOT NULL AND TRIM(PN) <> '';
