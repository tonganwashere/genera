from pathlib import Path
import sqlite3
from flask import g, has_app_context
from server import config

schema_path = Path(__file__).resolve().parent / "schema.sql"

def get_db_connection():
    Path(config.DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DATABASE_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    return conn

def get_db():
    if has_app_context():
        if "db" not in g:
            g.db = get_db_connection()
        return g.db
    return get_db_connection()

def close_db(error = None):
    if has_app_context():
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
    if not db_file.is_file() or db_file.stat().st_size == 0:
        init_db()
        return

    try:
        conn = get_db_connection()
        cursor = conn.execute("PRAGMA quick_check;")
        status = cursor.fetchone()[0]
        if status != "ok":
            conn.close()
            raise RuntimeError(f"Database file {config.DATABASE_PATH} is corrupted: {status}. Halting startup to avoid data loss.")

        table_exists = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users';").fetchone()
        if not table_exists:
            conn.close()
            init_db()
            return

        user_cols = [row[1] for row in conn.execute("PRAGMA table_info(users);").fetchall()]
        if "email" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);")
        if "token_version" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;")
        if "email_verified" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;")

        otp_table = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_otps';").fetchone()
        if not otp_table:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_otps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    otp_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_otps ON user_otps (user_id, kind, expires_at);")

            has_email_otps = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='email_verification_otps';").fetchone()
            if has_email_otps:
                conn.execute("""
                    INSERT INTO user_otps (user_id, kind, otp_hash, created_at, expires_at, used)
                    SELECT user_id, 'verification', otp_hash, created_at, expires_at, used
                    FROM email_verification_otps;
                """)
            has_reset_otps = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_otps';").fetchone()
            if has_reset_otps:
                conn.execute("""
                    INSERT INTO user_otps (user_id, kind, otp_hash, created_at, expires_at, used)
                    SELECT user_id, 'reset', otp_hash, created_at, expires_at, used
                    FROM password_reset_otps;
                """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_cards (
                user_id INTEGER NOT NULL,
                id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                category TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER NOT NULL DEFAULT 0,
                server_version INTEGER NOT NULL,
                PRIMARY KEY (user_id, id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_cards_sync ON user_cards (user_id, server_version);")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_id INTEGER NOT NULL,
                card_kind TEXT NOT NULL,
                card_id TEXT NOT NULL,
                box INTEGER NOT NULL DEFAULT 1,
                due_date TEXT NOT NULL,
                last_reviewed TEXT,
                introduced_on TEXT,
                times_right INTEGER NOT NULL DEFAULT 0,
                times_wrong INTEGER NOT NULL DEFAULT 0,
                hidden INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                server_version INTEGER NOT NULL,
                PRIMARY KEY (user_id, card_kind, card_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_progress_sync ON progress (user_id, server_version);")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                daily_new_limit INTEGER NOT NULL DEFAULT 10,
                enabled_categories TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                server_version INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                key TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON rate_limits (key, created_at);")


        conn.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            );
        """)
        conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('global_version', 0);")

        conn.commit()
        conn.close()
    except sqlite3.DatabaseError as err:
        raise RuntimeError(f"Database file {config.DATABASE_PATH} is corrupted: {err}. Halting startup to avoid data loss.")

def get_next_version(conn):
    try:
        row = conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'global_version' RETURNING value").fetchone()
        if row:
            return row[0]
    except sqlite3.OperationalError:
        pass
    conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'global_version'")
    row = conn.execute("SELECT value FROM meta WHERE key = 'global_version'").fetchone()
    return row[0] if row else 1

def get_current_version(conn):
    row = conn.execute("SELECT value FROM meta WHERE key = 'global_version'").fetchone()
    return row[0] if row else 0

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")