from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash

def get_user_by_id(conn, user_id):
    return conn.execute(
        "SELECT id, username, email, token_version, email_verified, password_hash FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

def get_user_by_username(conn, username):
    return conn.execute(
        "SELECT id, username, email, token_version, email_verified, password_hash FROM users WHERE username = ?",
        (username,)
    ).fetchone()

def get_user_by_email(conn, email):
    return conn.execute(
        "SELECT id, username, email, token_version, email_verified, password_hash FROM users WHERE email = ?",
        (email,)
    ).fetchone()

def get_user_by_identifier(conn, identifier):
    clean = identifier.strip().lower()
    return conn.execute(
        "SELECT id, username, email, password_hash, token_version, email_verified FROM users WHERE username = ? OR email = ?",
        (clean, clean)
    ).fetchone()

def create_user(conn, username, email, password):
    clean_user = username.strip()
    clean_email = email.strip().lower()
    password_hash = generate_password_hash(password)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (username, email, password_hash, token_version, email_verified, created_at) VALUES (?, ?, ?, 1, 0, ?)",
        (clean_user, clean_email, password_hash, timestamp)
    )
    user_id = cursor.lastrowid
    cursor.execute(
        "INSERT INTO user_settings (user_id, daily_new_limit, enabled_categories, updated_at, server_version) VALUES (?, 10, '[]', ?, 0)",
        (user_id, timestamp)
    )
    conn.commit()
    return user_id

def verify_user_password(conn, user_id, password):
    user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        return False
    return check_password_hash(user["password_hash"], password)

def update_user_password(conn, user_id, new_password, new_token_version):
    new_hash = generate_password_hash(new_password)
    conn.execute(
        "UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?",
        (new_hash, new_token_version, user_id)
    )
    conn.commit()

def update_user_email(conn, user_id, email):
    clean_email = email.strip().lower()
    conn.execute("UPDATE users SET email = ?, email_verified = 0 WHERE id = ?", (clean_email, user_id))
    conn.commit()

def mark_email_verified(conn, user_id):
    conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
    conn.commit()

def reset_user_password_and_verify(conn, user_id, new_password):
    new_hash = generate_password_hash(new_password)
    conn.execute(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, email_verified = 1 WHERE id = ?",
        (new_hash, user_id)
    )
    conn.commit()

def delete_user_account(conn, user_id):
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()