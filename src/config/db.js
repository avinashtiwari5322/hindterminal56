const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: false, // set true if Azure
        trustServerCertificate: true,
    }
};

// ✅ Database connection
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Connected to SQL Server');
        return pool;
    })
    .catch(err => {
        console.log('❌ Database Connection Failed:', err);
        process.exit(1); // exit if connection fails
    });

// Remove the Express server from here - it should only be in app.js
module.exports = {
    sql,
    poolPromise
};