const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('node:path');
const { buildMalaysiaDateRange } = require('./admin_dashboard_utils');
// Assuming the logger path is correctly configured in your environment
const logger = require('C:/Barcode_Printing_Node/utils/logger'); 

const app = express();
const port = 3168;

app.use(cors());
// Middleware to handle JSON bodies
app.use(express.json()); 
app.use(express.text({ type: 'text/plain' }));

const db = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'aMicf_bcps2025',
    database: 'tray',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

function queryRows(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (error, rows) => {
            if (error) return reject(error);
            resolve(rows);
        });
    });
}

function inspectionWhereClause(dateRange, partNumber) {
    const clauses = ['occurred_at_utc >= ?', 'occurred_at_utc < ?'];
    const values = [dateRange.startUtc, dateRange.endExclusiveUtc];
    if (partNumber) {
        clauses.push('part_number = ?');
        values.push(partNumber);
    }
    return { sql: clauses.join(' AND '), values };
}

// Startup check (doesn't crash if DB is down; pool will retry on next query)
db.getConnection((err, connection) => {
    if (err) {
        logger.error('Error connecting to the database:', err.stack);
        return;
    }
    logger.log('Connected to SQL database as ID', connection.threadId);
    connection.release();
});

// ------------------------------------------------------------------
// ⭐ NEW ENDPOINT 3: User Login Authentication
// Checks credentials against the user_log_in table.
// ------------------------------------------------------------------
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    // IMPORTANT: In a real system, you must use hashed passwords (e.g., bcrypt)
    const sql = 'SELECT 1 FROM user_log_in WHERE username = ? AND password = ? LIMIT 1';

    db.query(sql, [username, password], (err, results) => {
        if (err) {
            logger.error('Database query error during login:', err);
            return res.status(500).json({ error: 'Database error during authentication.' });
        }
        
        if (results.length === 1) {
            logger.log(`Successful login for user: ${username}`);
            return res.status(200).json({ message: 'Login successful' });
        } else {
            logger.info(`Failed login attempt for user: ${username}`);
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
    });
});

// ------------------------------------------------------------------
// ⭐ NEW ENDPOINT 4: Register New Product
// Inserts new product data into the label_print_data table.
// ------------------------------------------------------------------
// New production API. The existing printing-era endpoints below remain
// available during migration; this client uses the endpoints in this block.
// The read-only management dashboard is available without a login to anyone
// who can reach this server. Keep this service restricted to the trusted LAN.
app.get('/', (_req, res) => {
    res.redirect('/admin');
});

app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'admin_dashboard.html'));
});

app.get('/admin/dashboard.js', (_req, res) => {
    res.sendFile(path.join(__dirname, 'admin_dashboard.js'));
});

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = RUN_ID_PATTERN;

function validRunId(value) {
    return typeof value === 'string' && RUN_ID_PATTERN.test(value);
}

function normalizeInspectionEvent(body, requireEventId = true) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Each inspection event must be a JSON object.' };
    }

    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const cleanedPartNumber = typeof body.partNumber === 'string' ? body.partNumber.trim() : '';
    const cleanedMachineId = typeof body.machineId === 'string' ? body.machineId.trim() : '';
    const cleanedOperatorName = typeof body.operatorName === 'string' ? body.operatorName.trim() : 'UNKNOWN';
    const parsedTimestamp = typeof body.timestampUtc === 'string' ? new Date(body.timestampUtc) : null;

    if (requireEventId && !EVENT_ID_PATTERN.test(eventId)) {
        return { error: 'eventId must be a UUID.' };
    }
    if (!requireEventId && eventId && !EVENT_ID_PATTERN.test(eventId)) {
        return { error: 'eventId must be a UUID when provided.' };
    }
    if (!cleanedPartNumber || cleanedPartNumber.length > 100) {
        return { error: 'A valid partNumber is required.' };
    }
    if (body.status !== 'OK' && body.status !== 'NG') {
        return { error: "status must be either 'OK' or 'NG'." };
    }
    if (!cleanedMachineId || cleanedMachineId.length > 64) {
        return { error: 'A valid machineId is required.' };
    }
    if (!cleanedOperatorName || cleanedOperatorName.length > 100) {
        return { error: 'A valid operatorName is required and must be 100 characters or fewer.' };
    }
    if (!validRunId(body.runId)) {
        return { error: 'runId must be a UUID.' };
    }
    if (!parsedTimestamp || Number.isNaN(parsedTimestamp.getTime())) {
        return { error: 'timestampUtc must be a valid ISO timestamp.' };
    }

    return {
        event: {
            eventId: eventId || null,
            partNumber: cleanedPartNumber,
            runId: body.runId,
            status: body.status,
            machineId: cleanedMachineId,
            operatorName: cleanedOperatorName,
            occurredAtUtc: parsedTimestamp.toISOString().slice(0, 23).replace('T', ' ')
        }
    };
}

function insertInspectionEvent(event, callback) {
    const insertSql = `
        INSERT INTO inspection_results
            (event_id, part_number, run_id, status, machine_id, operator_name, occurred_at_utc)
        VALUES (COALESCE(?, UUID()), ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`;
    db.query(insertSql, [
        event.eventId, event.partNumber, event.runId, event.status,
        event.machineId, event.operatorName, event.occurredAtUtc
    ], callback);
}

function sendInspectionInsertError(res, error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(404).json({ error: 'Part number is not registered.' });
    }
    logger.error('Database error inserting inspection result:', error);
    return res.status(500).json({ error: 'Database error saving inspection result.' });
}

function sendRunSummary(runId, partNumber, res) {
    const sql = `
        SELECT
            p.part_number AS partNumber,
            COALESCE(SUM(r.status = 'OK'), 0) AS okCount,
            COALESCE(SUM(r.status = 'NG'), 0) AS ngCount,
            COUNT(r.id) AS totalCount
        FROM registered_parts p
        LEFT JOIN inspection_results r
            ON r.part_number = p.part_number AND r.run_id = ?
        WHERE p.part_number = ?
        GROUP BY p.part_number
        LIMIT 1`;

    db.query(sql, [runId, partNumber], (err, rows) => {
        if (err) {
            logger.error('Database error reading current-run counts:', err);
            return res.status(500).json({ error: 'Database error reading current-run counts.' });
        }
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Registered part number was not found.' });
        }
        const row = rows[0];
        res.status(200).json({
            runId,
            partNumber: row.partNumber,
            okCount: Number(row.okCount),
            ngCount: Number(row.ngCount),
            totalCount: Number(row.totalCount)
        });
    });
}

app.get('/parts', (req, res) => {
    db.query('SELECT part_number AS partNumber FROM registered_parts ORDER BY part_number', (err, rows) => {
        if (err) {
            logger.error('Database error listing registered part numbers:', err);
            return res.status(500).json({ error: 'Database error listing part numbers.' });
        }
        res.status(200).json(rows);
    });
});

app.post('/register-part', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const partNumber = typeof body.partNumber === 'string' ? body.partNumber.trim() : '';
    if (!partNumber || partNumber.length > 100) {
        return res.status(400).json({ error: 'Part number is required and must be 100 characters or fewer.' });
    }
    db.query('INSERT INTO registered_parts (part_number) VALUES (?)', [partNumber], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: `Part number '${partNumber}' is already registered.` });
            }
            logger.error('Database error registering part number:', err);
            return res.status(500).json({ error: 'Database error registering part number.' });
        }
        logger.log(`Registered part number ${partNumber}`);
        res.status(201).json({ message: 'Part number registered successfully.', partNumber });
    });
});

app.post('/inspection-results', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const normalized = normalizeInspectionEvent(body, false);
    if (normalized.error) {
        return res.status(400).json({ error: normalized.error });
    }
    const event = normalized.event;
    insertInspectionEvent(event, (insertError, result) => {
        if (insertError) {
            return sendInspectionInsertError(res, insertError);
        }
        logger.log(`Saved ${event.status} result for part=${event.partNumber}, run=${event.runId}, operator=${event.operatorName}, machine=${event.machineId}`);
        res.status(201).json({ message: 'Inspection result recorded.', recordId: result.insertId });
    });
});

app.post('/inspection-results/batch', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const events = body.events;
    if (!Array.isArray(events) || events.length < 1 || events.length > 100) {
        return res.status(400).json({ error: 'events must contain between 1 and 100 inspection results.' });
    }

    const normalizedEvents = [];
    for (let index = 0; index < events.length; index += 1) {
        const normalized = normalizeInspectionEvent(events[index], true);
        if (normalized.error) {
            return res.status(400).json({ error: `events[${index}]: ${normalized.error}` });
        }
        normalizedEvents.push(normalized.event);
    }

    // Inserts are idempotent by event_id. If a later insert fails after earlier
    // ones succeeded, the client retries the complete batch without duplicates.
    const acceptedEventIds = [];
    let index = 0;
    function saveNext() {
        if (index >= normalizedEvents.length) {
            return res.status(200).json({ acceptedEventIds });
        }
        const event = normalizedEvents[index];
        insertInspectionEvent(event, insertError => {
            if (insertError) {
                return sendInspectionInsertError(res, insertError);
            }
            acceptedEventIds.push(event.eventId);
            index += 1;
            saveNext();
        });
    }
    saveNext();
});

app.get('/run-summary', (req, res) => {
    const { runId } = req.query;
    const partNumber = typeof req.query.partNumber === 'string' ? req.query.partNumber.trim() : '';
    if (!validRunId(runId)) {
        return res.status(400).json({ error: 'runId must be a UUID.' });
    }
    if (!partNumber || partNumber.length > 100) {
        return res.status(400).json({ error: 'A valid partNumber is required.' });
    }
    sendRunSummary(runId, partNumber, res);
});

app.post('/register-product', async (req, res) => {
    const { PN, Quantity, Box_ID, Spec, Remarks, Tray_Amount } = req.body;

    // Simple validation
    if (!PN || !Quantity || !Box_ID || !Spec || !Tray_Amount) {
        return res.status(400).json({ error: 'Missing required product data fields.' });
    }
    
    // Ensure Quantity and Tray_Amount are numbers
    const numQuantity = Number(Quantity);
    const numTrayAmount = Number(Tray_Amount);

    if (isNaN(numQuantity) || isNaN(numTrayAmount)) {
        return res.status(400).json({ error: 'Quantity and Tray Amount must be valid numbers.' });
    }

    const sql = 'INSERT INTO label_print_data (`PN`, `Quantity`, `Box_ID`, `Spec`, `Remarks`, `Tray_Amount`) VALUES (?, ?, ?, ?, ?, ?)';
    const values = [PN, numQuantity, Box_ID, Spec, Remarks || '', numTrayAmount];

    db.query(sql, values, (err, result) => {
        if (err) {
            // Check for potential duplicate key error (e.g., if Spec or PN is a unique key)
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: `Product with Spec '${Spec}' likely already exists.` });
            }
            logger.error('Database insert error for new product:', err);
            return res.status(500).json({ error: 'Database error registering new product.' });
        }

        logger.log(`Successfully registered new product: ${Spec}`);
        res.status(201).json({ message: 'Product registered successfully', insertId: result.insertId });
    });
});


// ------------------------------------------------------------------
// ⭐ EXISTING ENDPOINTS 1 & 2 (Unchanged from context)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// ENDPOINT 1: Data Retrieval based on Spec
// ------------------------------------------------------------------
app.post('/get-project-data', async (req, res) => {
    // Expecting JSON body: { spec: "CUST_PN-XYZ" }
    const { spec } = req.body; 

    if (!spec) {
        return res.status(400).json({ error: 'Missing product specification (Spec).' });
    }

    const trimmedSpec = spec.trim();
    // Select all necessary fields and alias 'PN' to 'Cust_PN' for consistency
    const sql = 'SELECT `PN` AS Cust_PN, `Quantity`, `Box_ID`, `Remarks`, `Tray_Amount`, `Spec` FROM label_print_data WHERE `Spec` = ? LIMIT 1';

    db.query(sql, [trimmedSpec], (err, results) => {
        if (err) {
            logger.error('Database query error:', err);
            return res.status(500).json({ error: 'Database error fetching project data.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: `No project data found for Spec: ${trimmedSpec}` });
        }
        
        // Return the first matching record as JSON
        res.status(200).json(results[0]); 
    });
});

// ------------------------------------------------------------------
// ENDPOINT 2: Box ID Update
// ------------------------------------------------------------------
// Helper inside DB_server.js to get current date in YYMMDD
function getYYMMDD() {
    const d = new Date();
    const year = String(d.getFullYear()).slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

app.post('/update-box-id', async (req, res) => {
    // Expecting JSON body: { spec: "CUST_PN-XYZ", newBoxId: 101 }
    const { spec, newBoxId } = req.body;
    logger.log(req.body);

    // Validate input data
    if (!spec || newBoxId === undefined || newBoxId === null) {
        return res.status(400).json({ error: 'Missing required parameters: spec and newBoxId.' });
    }

    const trimmedSpec = spec.trim();
    // SQL to update the Box_ID based on the Spec
    const sql = 'UPDATE label_print_data SET `Box_ID` = ? WHERE `Spec` = ?';

    db.query(sql, [newBoxId, trimmedSpec], (err, result) => {
        if (err) {
            logger.error('Database update error for Box_ID:', err);
            return res.status(500).json({ error: 'Database error updating Box ID.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: `No record found for Spec: ${trimmedSpec} or update failed.` });
        }

        res.status(200).json({ message: `Successfully updated Box_ID for Spec: ${trimmedSpec} to ${newBoxId}`, rowsAffected: result.affectedRows });
    });
});

// Read-only management view of the new tray inspection tables.
app.get('/admin/api/dashboard', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    const partNumber = typeof req.query.partNumber === 'string' ? req.query.partNumber.trim() : '';
    if (partNumber.length > 100) {
        return res.status(400).json({ error: 'Part number filter must be 100 characters or fewer.' });
    }

    let dateRange;
    try {
        dateRange = buildMalaysiaDateRange(from, to);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const filter = inspectionWhereClause(dateRange, partNumber);
    const where = `WHERE ${filter.sql}`;
    const values = filter.values;

    try {
        const [summaryRows, dailyRows, partRows, machineRows, runRows, recentRows, registeredParts] = await Promise.all([
            queryRows(`
                SELECT COUNT(*) AS totalCount,
                    COALESCE(SUM(status = 'OK'), 0) AS okCount,
                    COALESCE(SUM(status = 'NG'), 0) AS ngCount,
                    COUNT(DISTINCT run_id) AS runCount
                FROM inspection_results ${where}`, values),
            queryRows(`
                SELECT DATE_FORMAT(DATE_ADD(occurred_at_utc, INTERVAL 8 HOUR), '%Y-%m-%d') AS productionDate,
                    COUNT(*) AS totalCount,
                    COALESCE(SUM(status = 'OK'), 0) AS okCount,
                    COALESCE(SUM(status = 'NG'), 0) AS ngCount
                FROM inspection_results ${where}
                GROUP BY productionDate ORDER BY productionDate`, values),
            queryRows(`
                SELECT part_number AS partNumber, COUNT(*) AS totalCount,
                    COALESCE(SUM(status = 'OK'), 0) AS okCount,
                    COALESCE(SUM(status = 'NG'), 0) AS ngCount,
                    COUNT(DISTINCT run_id) AS runCount
                FROM inspection_results ${where}
                GROUP BY part_number ORDER BY totalCount DESC LIMIT 50`, values),
            queryRows(`
                SELECT machine_id AS machineId, COUNT(*) AS totalCount,
                    COALESCE(SUM(status = 'OK'), 0) AS okCount,
                    COALESCE(SUM(status = 'NG'), 0) AS ngCount,
                    COUNT(DISTINCT run_id) AS runCount
                FROM inspection_results ${where}
                GROUP BY machine_id ORDER BY totalCount DESC LIMIT 50`, values),
            queryRows(`
                SELECT run_id AS runId, part_number AS partNumber,
                    machine_id AS machineId, operator_name AS operatorName,
                    DATE_FORMAT(MIN(occurred_at_utc), '%Y-%m-%dT%H:%i:%sZ') AS startedAtUtc,
                    DATE_FORMAT(MAX(occurred_at_utc), '%Y-%m-%dT%H:%i:%sZ') AS lastResultAtUtc,
                    COUNT(*) AS totalCount,
                    COALESCE(SUM(status = 'OK'), 0) AS okCount,
                    COALESCE(SUM(status = 'NG'), 0) AS ngCount
                FROM inspection_results ${where}
                GROUP BY run_id, part_number, machine_id, operator_name
                ORDER BY MAX(occurred_at_utc) DESC LIMIT 50`, values),
            queryRows(`
                SELECT id, part_number AS partNumber, status,
                    machine_id AS machineId, operator_name AS operatorName,
                    run_id AS runId,
                    DATE_FORMAT(occurred_at_utc, '%Y-%m-%dT%H:%i:%sZ') AS occurredAtUtc
                FROM inspection_results ${where}
                ORDER BY occurred_at_utc DESC, id DESC`, values),
            queryRows('SELECT part_number AS partNumber FROM registered_parts ORDER BY part_number')
        ]);

        const summary = summaryRows[0] || {};
        const totalCount = Number(summary.totalCount || 0);
        const okCount = Number(summary.okCount || 0);
        res.status(200).json({
            filters: { from, to, partNumber },
            summary: {
                totalCount,
                okCount,
                ngCount: Number(summary.ngCount || 0),
                runCount: Number(summary.runCount || 0),
                yieldPercent: totalCount ? Math.round((okCount / totalCount) * 1000) / 10 : 0
            },
            daily: dailyRows,
            byPart: partRows,
            byMachine: machineRows,
            runs: runRows,
            recentResults: recentRows,
            parts: registeredParts
        });
    } catch (error) {
        logger.error('Database error loading admin dashboard:', error);
        res.status(500).json({ error: 'Could not load tray packing dashboard data.' });
    }
});

// ------------------------------------------------------------------

app.listen(port, '192.168.40.29', () => {
    logger.log(`Host server listening on http://192.168.40.29:${port}`);
});
