from pathlib import Path
import sqlite3
from flask import g, has_request_context
from server import config

schema_path = Path(__file__).resolve().parent / "schema.sql"

def get_db_connection():
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def get_db():
    if has_request_context():
        if "db" not in g:
            g.db = get_db_connection()
        return g.db
    return get_db_connection()

def close_db(error = None):
    if has_request_context():
        db = g.pop("db", None)
        if db is not None:
            db.close()

def init_db():
    with open(schema_path, "r", encoding="utf-8") as f:
        sql_script = f.read()
    conn = get_db_connection()
    conn.executescript(sql_script)
    conn.commit()
    conn.close()

def check_db():
    db_file = Path(config.DATABASE_PATH)
    if db_file.is_file():
        try:
            conn = sqlite3.connect(config.DATABASE_PATH)
            cursor = conn.execute("PRAGMA quick_check;")
            status = cursor.fetchone()[0]
            if status != "ok":
                conn.close()
                raise RuntimeError(f"Database file {config.DATABASE_PATH} is corrupted: {status}. Halting startup to avoid data loss.")
            user_cols = [row[1] for row in conn.execute("PRAGMA table_info(users);").fetchall()]
            if "email" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);")
            if "token_version" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;")
            if "email_verified" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;")
            conn.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                otp_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user ON password_reset_otps (user_id, expires_at);")
            conn.execute("""
            CREATE TABLE IF NOT EXISTS email_verification_otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                otp_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_email_verification_otps_user ON email_verification_otps (user_id, expires_at);")
            conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                key TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON rate_limits (key, created_at);")
            conn.commit()
            conn.close()
        except sqlite3.DatabaseError as err:
            raise RuntimeError(f"Database file {config.DATABASE_PATH} is corrupted: {err}. Halting startup to avoid data loss.")
    else:
        init_db()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")