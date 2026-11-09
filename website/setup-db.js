/**
 * setup-db.js — Creates the database, schema and seed data.
 *
 * Usage:  node setup-db.js
 *
 * Reads connection details from .env (same as server.js).
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'dbms_project';

async function run() {
  // 1. Connect to default 'postgres' database to create the project database
  const admin = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
  });

  await admin.connect();
  const exists = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`Created database "${DB_NAME}".`);
  } else {
    console.log(`Database "${DB_NAME}" already exists.`);
  }
  await admin.end();

  // 2. Connect to project database and run SQL files
  const db = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: DB_NAME,
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
  });
  await db.connect();

  const sqlDir = path.join(__dirname, '..', 'Codes and Queries');
  const schemaSQL = fs.readFileSync(path.join(sqlDir, 'Schema.sql'), 'utf-8');
  const seedSQL   = fs.readFileSync(path.join(sqlDir, 'Sample data insertion int the tables.sql'), 'utf-8');

  try {
    await db.query(schemaSQL);
    console.log('Schema created.');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('Schema tables already exist — skipping.');
    } else {
      throw err;
    }
  }

  try {
    await db.query(seedSQL);
    console.log('Sample data inserted.');
  } catch (err) {
    if (err.message.includes('duplicate key') || err.message.includes('already exists')) {
      console.log('Sample data already present — skipping.');
    } else {
      throw err;
    }
  }

  await db.end();
  console.log('Setup complete.');
}

run().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
