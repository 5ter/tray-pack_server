const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { Mutex } = require('async-mutex');
const logger = require('C:/Barcode_Printing_Node/utils/logger'); 

const app = express();
const port = 3200;
const mutex = new Mutex();

app.use(cors());
app.use(express.json()); 

// ------------------------------------------------------------------
// 🗄️ DATABASE CONNECTION (Pool Mode)
// ------------------------------------------------------------------
const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'aMicf_bcps2025',
    database: 'tray',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Promisify the pool for async/await
const db = pool.promise();

// Check connection status without crashing
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Database Pool connected successfully');
        connection.release();
    }
});

// Helper for Date: YYMMDD
function getYYMMDD() {
    const d = new Date();
    const year = String(d.getFullYear()).slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// ------------------------------------------------------------------
// ⭐ SEQUENTIAL UPDATE ENDPOINT
// ------------------------------------------------------------------
app.post('/update-box-id', async (req, res) => {
    const { spec } = req.body;
    if (!spec) return res.status(400).json({ error: 'Spec required' });

    const release = await mutex.acquire();
    console.log(`\n🔒 Lock Acquired: Processing ${spec}`);

    try {
        const [rows] = await db.query(
            'SELECT `Box_ID` FROM label_print_data WHERE `Spec` = ? LIMIT 1', 
            [spec.trim()]
        );

        if (!rows || rows.length === 0) {
            console.warn(`⚠️ Spec not found: ${spec}`);
            return res.status(404).json({ error: 'Spec not found' });
        }

        const currentFullId = rows[0].Box_ID || ""; 

        if (currentFullId.length < 19) {
            throw new Error(`Box_ID format invalid in DB: "${currentFullId}"`);
        }

        const vendor = currentFullId.substring(0, 8);
        const todayYYMMDD = getYYMMDD();
        const counterStr = currentFullId.substring(14, 19);
        const suffix = currentFullId.substring(19);

        const nextCounterNum = parseInt(counterStr, 10) + 1;
        const newCounterPadded = String(nextCounterNum).padStart(5, '0');
        const newBoxId = `${vendor}${todayYYMMDD}${newCounterPadded}${suffix}`;

        /*
        await db.query(
            'UPDATE label_print_data SET `Box_ID` = ? WHERE `Spec` = ?',
            [newBoxId, spec.trim()]
        );
        */

        console.log(`✅ Success: Updated ${spec} to ${newBoxId}`);
        res.status(200).json({ newBoxId });

    } catch (err) {
        console.error('❌ Update Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        release();
        console.log(`🔓 Lock Released`);
    }
});

app.post('/get-project-data', async (req, res) => {
    const { spec } = req.body; 

    if (!spec) {
        return res.status(400).json({ error: 'Missing product specification (Spec).' });
    }

    try {
        const trimmedSpec = spec.trim();
        
        // ⭐ We use await here because 'db' is now a promise pool.
        // The [results] syntax extracts the first part of the MySQL response.
        const [results] = await db.query(
            'SELECT `PN` AS Cust_PN, `Quantity`, `Box_ID`, `Remarks`, `Tray_Amount`, `Spec` FROM label_print_data WHERE `Spec` = ? LIMIT 1', 
            [trimmedSpec]
        );

        if (!results || results.length === 0) {
            return res.status(404).json({ error: `No project data found for Spec: ${trimmedSpec}` });
        }
        
        console.log(`✅ Success: Found data for ${trimmedSpec}`);
        res.status(200).json(results[0]); 

    } catch (err) {
        // ⭐ This line is key: It tells you WHY it failed in your terminal
        console.error('❌ SQL ERROR:', err.message);
        res.status(500).json({ 
            error: 'Database error fetching project data.',
            details: err.message 
        });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await db.query('SELECT 1 FROM user_log_in WHERE username = ? AND password = ? LIMIT 1', [username, password]);
        if (rows.length === 1) return res.json({ message: 'Login successful' });
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------------------------------
// 🛡️ PROCESS PROTECTOR (Prevents server from closing on errors)
// ------------------------------------------------------------------
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT ERROR:', err);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server fully operational on port ${port}`);
});