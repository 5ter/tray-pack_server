const test = require('node:test');
const assert = require('node:assert/strict');
const {
    addDays,
    buildMalaysiaDateRange,
    malaysiaMidnightAsUtcSql,
    parseDateOnly
} = require('./admin_dashboard_utils');

test('date parser accepts real calendar dates and rejects impossible dates', () => {
    assert.ok(parseDateOnly('2024-02-29'));
    assert.equal(parseDateOnly('2025-02-29'), null);
    assert.equal(parseDateOnly('2026-2-05'), null);
});

test('date arithmetic crosses month and year boundaries', () => {
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
});

test('Malaysia midnight is converted to the correct UTC database boundary', () => {
    assert.equal(malaysiaMidnightAsUtcSql('2026-10-05'), '2026-10-04 16:00:00');
});

test('date range includes the full Malaysia end date using an exclusive end', () => {
    assert.deepEqual(buildMalaysiaDateRange('2026-10-05', '2026-10-05'), {
        startUtc: '2026-10-04 16:00:00',
        endExclusiveUtc: '2026-10-05 16:00:00'
    });
});

test('date range rejects reversed and excessively broad ranges', () => {
    assert.throws(() => buildMalaysiaDateRange('2026-10-06', '2026-10-05'), /on or before/);
    assert.throws(() => buildMalaysiaDateRange('2024-01-01', '2025-01-01'), /366 days or less/);
});
