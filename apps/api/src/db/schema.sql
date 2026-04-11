CREATE TABLE IF NOT EXISTS sys_user (
    sys_id          TEXT PRIMARY KEY,
    user_name       TEXT NOT NULL UNIQUE,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    title           TEXT,
    department      TEXT,
    manager         TEXT REFERENCES sys_user(sys_id),
    avatar_url      TEXT,
    active          BOOLEAN DEFAULT true,
    sys_created_on  TIMESTAMP DEFAULT now(),
    sys_updated_on  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_project (
    sys_id          TEXT PRIMARY KEY,
    number          TEXT NOT NULL UNIQUE,
    short_description TEXT NOT NULL,
    description     TEXT,
    state           TEXT NOT NULL DEFAULT 'planning',
    start_date      DATE,
    end_date        DATE,
    project_manager TEXT REFERENCES sys_user(sys_id),
    color           TEXT,
    sys_created_on  TIMESTAMP DEFAULT now(),
    sys_updated_on  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sn_plng_att_core_resource_assignment (
    sys_id          TEXT PRIMARY KEY,
    resource        TEXT NOT NULL REFERENCES sys_user(sys_id),
    project         TEXT NOT NULL REFERENCES pm_project(sys_id),
    allocation_pct  INTEGER NOT NULL CHECK (allocation_pct BETWEEN 1 AND 100),
    resource_status TEXT NOT NULL DEFAULT 'requested',
    role            TEXT,
    start_date      DATE,
    end_date        DATE,
    sys_created_on  TIMESTAMP DEFAULT now(),
    sys_updated_on  TIMESTAMP DEFAULT now(),
    UNIQUE(resource, project)
);
