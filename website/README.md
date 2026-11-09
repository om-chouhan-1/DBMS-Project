# Workspace Dashboard

A minimal PostgreSQL-backed dashboard for the DBMS Project database.

## Setup

### 1. Configure database connection

Edit `website/.env` with your PostgreSQL credentials:

```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=dbms_project
DB_PASSWORD=your_password
DB_PORT=5432
PORT=3000
```

### 2. Create the database and seed data

```
cd website
node setup-db.js
```

This creates the database, runs the schema, and inserts sample data.

### 3. Start the server

```
cd website
node server.js
```

Open **http://localhost:3000** in your browser.

## Features

- **Configure** button (top-right) opens a settings drawer where you can:
  - **Toggle sections** on/off (Overview, User Summary, Users, Clients, Projects, Tasks, Workspace, Entries)
  - **Reorder sections** with ↑↓ buttons
  - **Pick columns** to display for each section
  - **Sort** each section by any column, ascending or descending
- **Overview** cards show aggregate stats (total users, projects, tasks, hours, earnings)
- **User Summary** table shows per-user totals (tasks, hours, money earned)
- All settings are saved in your browser and persist across refreshes
