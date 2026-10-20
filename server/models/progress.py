from server.models.sync_version import get_next_version

MAX_PROGRESS_ROWS = 20000

def check_progress_limits(conn, user_id, incoming_progress):
    if not incoming_progress:
        return True, ""
    existing_progress_keys = {
        (r[0], r[1]) for r in conn.execute("SELECT card_kind, card_id FROM progress WHERE user_id = ?", (user_id,)).fetchall()
    }
    new_progress_count = sum(1 for p in incoming_progress if (p.get("card_kind"), p.get("card_id")) not in existing_progress_keys)
    if len(existing_progress_keys) + new_progress_count > MAX_PROGRESS_ROWS:
        return False, f"Progress rows limit of {MAX_PROGRESS_ROWS} rows per account exceeded."
    return True, ""

def sync_progress(conn, user_id, incoming_progress):
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
            next_ver = get_next_version(conn)
            conn.execute(
                "INSERT INTO progress (user_id, card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, next_ver)
            )
        elif updated_at > existing["updated_at"]:
            next_ver = get_next_version(conn)
            conn.execute(
                "UPDATE progress SET box = ?, due_date = ?, last_reviewed = ?, introduced_on = ?, times_right = ?, times_wrong = ?, hidden = ?, updated_at = ?, server_version = ? WHERE user_id = ? AND card_kind = ? AND card_id = ?",
                (box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, next_ver, user_id, card_kind, card_id)
            )

def get_changed_progress(conn, user_id):
    return conn.execute(
        "SELECT card_kind, card_id, box, due_date, last_reviewed, introduced_on, times_right, times_wrong, hidden, updated_at, server_version FROM progress WHERE user_id = ? ORDER BY server_version ASC",
        (user_id,)
    ).fetchall()