const WebSocket = require("ws");
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
require('dotenv').config(); // Load .env variables

const connectionString = process.env.DATABASE_URL;

const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

// PostgreSQL Connection
// const pool = new Pool({
//     connectionString: connectionString,
//     ssl: { rejectUnauthorized: false }
// });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user123:QiAizBnRp8bzphS2FaPikFmkSRFdmrIE@dpg-d04kqkc9c44c739oc66g-a.oregon-postgres.render.com/mydb_tph6',
  ssl: {
    rejectUnauthorized: false,
  },
});

// Ensure table exists
async function createTableIfNotExists() {
    const query = `
        CREATE TABLE IF NOT EXISTS nodemcu_table (
            id SERIAL PRIMARY KEY,
            temperature FLOAT NOT NULL,
            humidity FLOAT NOT NULL,
            date DATE NOT NULL,
            time TIME NOT NULL
        );
    `;
    try {
        const client = await pool.connect();
        await client.query(query);
        client.release();
        console.log("Table ensured to exist.");
    } catch (error) {
        console.error("Error creating table:", error);
    }
}
createTableIfNotExists();

// Serve static files
app.use(express.static(path.join(__dirname)));

const clients = new Set();
wss.on("connection", (ws) => {
    console.log("Client connected");
    clients.add(ws);

    ws.on("close", () => {
        clients.delete(ws);
        console.log("Client disconnected");
    });
});

// Insert data into PostgreSQL
app.post("/postData", express.urlencoded({ extended: true }), async (req, res) => {
    console.log("Received data:", req.body);
    const { temperature, humidity } = req.body;
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].split(".")[0];

    try {
        const result = await pool.query(
            "INSERT INTO nodemcu_table (temperature, humidity, date, time) VALUES ($1, $2, $3, $4) RETURNING *",
            [temperature, humidity, date, time]
        );

        console.log("Inserted data:", result.rows[0]);

        // Notify WebSocket clients
        const newData = JSON.stringify(result.rows[0]);
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(newData);
            }
        });

        res.json({ message: "Data inserted successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ error: "Database insertion failed" });
    }
});

// Retrieve all data in descending order
app.get("/getAllData", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM nodemcu_table ORDER BY id DESC");
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Database fetch failed" });
    }
});

app.get("/getDataByDate", async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: "Missing start or end date" });
    }

    try {
        const result = await pool.query(
            "SELECT * FROM nodemcu_table WHERE date BETWEEN $1 AND $2 ORDER BY id DESC",
            [start, end]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error filtering data:", error);
        res.status(500).json({ error: "Database filter failed" });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
