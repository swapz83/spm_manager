CREATE TABLE IF NOT EXISTS sys_user (
    sys_id          TEXT PRIMARY KEY,
    user_name       TEXT,
    first_name      TEXT NOT NULL DEFAULT '',
    last_name       TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL DEFAULT '',
    title           TEXT,
    department      TEXT,
    department_name TEXT,
    manager         TEXT,
    avatar_url      TEXT,
    active          BOOLEAN DEFAULT true,
    sys_created_on  TIMESTAMP DEFAULT now(),
    sys_updated_on  TIMESTAMP DEFAULT now()
);

-- Migration: add department_name if upgrading from an older schema
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS department_name TEXT;

CREATE TABLE IF NOT EXISTS pm_project (
    sys_id          TEXT PRIMARY KEY,
    number          TEXT NOT NULL UNIQUE,
    short_description TEXT NOT NULL DEFAULT '',
    description     TEXT,
    state           TEXT NOT NULL DEFAULT 'planning',
    start_date      DATE,
    end_date        DATE,
    project_manager TEXT,
    color           TEXT,
    sys_created_on  TIMESTAMP DEFAULT now(),
    sys_updated_on  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sn_plng_att_core_resource_assignment (
    sys_id          TEXT PRIMARY KEY,
    resource        TEXT NOT NULL,
    project         TEXT NOT NULL,
    allocation_pct  INTEGER NOT NULL CHECK (allocation_pct BETWEEN 1 AND 100),
    resource_status TEXT NOT NULL DEFAULT 'requested',
    role            TEXT,
    start_date      DATE,
    end_date        DATE,
    sys_created_on  TIMESTAMP DEFAULT now(),
    sys_updated_on  TIMESTAMP DEFAULT now()
);
