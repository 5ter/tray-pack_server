const DAY_MS = 24 * 60 * 60 * 1000;
const MALAYSIA_OFFSET_HOURS = 8;

function parseDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    return { year, month, day, dayNumber: Date.UTC(year, month - 1, day) };
}

function addDays(value, numberOfDays) {
    const parsed = parseDateOnly(value);
    if (!parsed) throw new RangeError('Date must use YYYY-MM-DD format and be a real calendar date.');
    return new Date(parsed.dayNumber + numberOfDays * DAY_MS).toISOString().slice(0, 10);
}

function malaysiaMidnightAsUtcSql(value) {
    const parsed = parseDateOnly(value);
    if (!parsed) throw new RangeError('Date must use YYYY-MM-DD format and be a real calendar date.');
    const utcMs = parsed.dayNumber - MALAYSIA_OFFSET_HOURS * 60 * 60 * 1000;
    return new Date(utcMs).toISOString().slice(0, 19).replace('T', ' ');
}

function buildMalaysiaDateRange(from, to) {
    const start = parseDateOnly(from);
    const end = parseDateOnly(to);
    if (!start || !end) {
        throw new RangeError('Choose valid start and end dates in YYYY-MM-DD format.');
    }
    if (start.dayNumber > end.dayNumber) {
        throw new RangeError('Start date must be on or before end date.');
    }
    const inclusiveDays = Math.floor((end.dayNumber - start.dayNumber) / DAY_MS) + 1;
    if (inclusiveDays > 366) {
        throw new RangeError('Select a date range of 366 days or less.');
    }

    return {
        startUtc: malaysiaMidnightAsUtcSql(from),
        endExclusiveUtc: malaysiaMidnightAsUtcSql(addDays(to, 1))
    };
}

module.exports = { addDays, buildMalaysiaDateRange, malaysiaMidnightAsUtcSql, parseDateOnly };
