import json
from server import db

def sync_settings(conn, user_id, incoming_settings):
    if not incoming_settings:
        return
    daily_new_limit = incoming_settings.get("daily_new_limit", 10)
    enabled_categories = incoming_settings.get("enabled_categories", [])
    enabled_categories_json = json.dumps(enabled_categories) if isinstance(enabled_categories, list) else "[]"
    updated_at = incoming_settings.get("updated_at")

    existing = conn.execute(
        "SELECT updated_at, server_version FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()

    if existing is None:
        next_ver = db.get_next_version(conn)
        conn.execute(
            """INSERT INTO user_settings (user_id, daily_new_limit, enabled_categories, updated_at, server_version)
            VALUES (?, ?, ?, ?, ?)""",
            (user_id, daily_new_limit, enabled_categories_json, updated_at, next_ver)
        )
    elif existing["server_version"] == 0 or updated_at > existing["updated_at"]:
        next_ver = db.get_next_version(conn)
        conn.execute(
            """UPDATE user_settings SET daily_new_limit = ?, enabled_categories = ?, updated_at = ?, server_version = ?
            WHERE user_id = ?""",
            (daily_new_limit, enabled_categories_json, updated_at, next_ver, user_id)
        )

def get_user_settings(conn, user_id):
    return conn.execute(
        "SELECT daily_new_limit, enabled_categories, updated_at, server_version FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()