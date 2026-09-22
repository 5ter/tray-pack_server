const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
// Assuming the logger path is correctly configured in your environment
const logger = require('C:/Barcode_Printing_Node/utils/logger'); 

const app = express();
const port = 3168;

app.use(cors());
// Middleware to handle JSON bodies
app.use(express.json()); 
app.use(express.text({ type: 'text/plain' }));

const db = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'aMicf_bcps2025',
    database: 'tray'
});

db.connect(err => {
    if (err) {
        logger.error('Error connecting to the database:', err.stack);
        return;
    }
    logger.log('Connected to SQL database as ID', db.threadId);
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
            logger.warn(`Failed login attempt for user: ${username}`);
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
    });
});

// ------------------------------------------------------------------
// ⭐ NEW ENDPOINT 4: Register New Product
// Inserts new product data into the label_print_data table.
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------

app.listen(port, '192.168.40.29', () => {
    logger.log(`Host server listening on http://192.168.40.29:${port}`);
});