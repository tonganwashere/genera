from server import db

MAX_PROGRESS_ROWS = 20000

def check_progress_limits(conn, user_id, incoming_progress):
    if not incoming_progress:
        return True, ""
    current_count = conn.execute("SELECT COUNT(*) FROM progress WHERE user_id = ?", (user_id,)).fetchone()[0]
    incoming_keys = list({(p["card_kind"], p["card_id"]) for p in incoming_progress if "card_kind" in p and "card_id" in p})
    if not incoming_keys:
        return True, ""
    placeholders = ",".join("(?, ?)" for _ in incoming_keys)
    flat_params = [v for pair in incoming_keys for v in pair]
    existing_matches = conn.execute(
        f"SELECT COUNT(*) FROM progress WHERE user_id = ? AND (card_kind, card_id) IN (VALUES {placeholders})",
        (user_id, *flat_params)
    ).fetchone()[0]
    new_progress_count = len(incoming_keys) - existing_matches

    if current_count + new_progress_count > MAX_PROGRESS_ROWS:
        return False, f"Progress rows limit of {MAX_PROGRESS_ROWS} rows per account exceeded."
    return True, ""

def sync_progress(conn, user_id, incoming_progress):
    if not incoming_progress:
        return
    for item in incoming_progress:
        card_kind = item.get("card_kind")
        card_id = item.get("card_id")
        box = item.get("box", 1)
        due_date = item.get("due_date")
        last_reviewed = item.get("last_reviewed")
        introduced_on = item.get("introduced_on")
        times_right = item.get("times_right", 0)
        times_wrong = item.get("times_wrong", 0)
        hidden = 1 if item.get("hidden") else 0
        updated_at = item.get("updated_at")

        existing = conn.execute(
            "SELECT updated_at FROM progress WHERE user_id = ? AND card_kind = ? AND card_id = ?",
            (user_id, card_kind, card_id)
        ).fetchone()

        if existing is None:
            next_ver = db.get_next_version(conn)
            conn.execute(
                """INSERT INTO progress (user_id, card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (user_id, card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, next_ver)
            )
        elif updated_at > existing["updated_at"]:
            next_ver = db.get_next_version(conn)
            conn.execute(
                """UPDATE progress SET box = ?, due_date = ?, last_reviewed = ?, introduced_on = ?, times_right = ?, times_wrong = ?, hidden = ?, updated_at = ?, server_version = ?
                WHERE user_id = ? AND card_kind = ? AND card_id = ?""",
                (box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, next_ver, user_id, card_kind, card_id)
            )

def get_changed_progress(conn, user_id, since=0, pushed_progress_keys=None, limit=None):
    if pushed_progress_keys:
        placeholders = ",".join("(?, ?)" for _ in pushed_progress_keys)
        flat_params = [v for pair in pushed_progress_keys for v in pair]
        query = f"SELECT card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version FROM progress WHERE user_id = ? AND (server_version > ? OR (card_kind, card_id) IN (VALUES {placeholders})) ORDER BY server_version ASC"
        params = [user_id, since, *flat_params]
    else:
        query = "SELECT card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version FROM progress WHERE user_id = ? AND server_version > ? ORDER BY server_version ASC"
        params = [user_id, since]
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    return conn.execute(query, params).fetchall()