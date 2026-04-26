-- schemas/auth_schema.sql — Reference DDL for auth tables
-- These are managed by Alembic (do not run manually)

CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(50) UNIQUE NOT NULL,
    display     VARCHAR(100) NOT NULL,
    category    VARCHAR(50) NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permissions (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id       INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    role_id       INTEGER REFERENCES roles(id) NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE doctor_profiles (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialization   VARCHAR(100),
    license_number   VARCHAR(50) UNIQUE,
    department       VARCHAR(100)
);

CREATE TABLE nurse_profiles (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_id      VARCHAR(50) UNIQUE,
    department       VARCHAR(100),
    shift            VARCHAR(20) DEFAULT 'Day',
    is_available     BOOLEAN DEFAULT TRUE,
    current_workload INTEGER DEFAULT 0
);

CREATE TABLE staff_profiles (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_id    VARCHAR(50) UNIQUE,
    department     VARCHAR(100),
    certification  VARCHAR(100),
    license_number VARCHAR(50),
    desk_location  VARCHAR(100)
);

CREATE TABLE patient_profiles (
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    patient_id        VARCHAR(20) UNIQUE NOT NULL,
    date_of_birth     DATE,
    gender            VARCHAR(10),
    blood_group       VARCHAR(5),
    insurance_id      VARCHAR(50),
    emergency_contact VARCHAR(20),
    bed_number        VARCHAR(20)
);

-- Indexes
CREATE INDEX ix_users_email ON users(email);
CREATE INDEX ix_users_role_id ON users(role_id);
CREATE INDEX ix_roles_key ON roles(key);
CREATE INDEX ix_permissions_key ON permissions(key);
