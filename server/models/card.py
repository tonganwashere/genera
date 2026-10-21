import json
from server import db

MAX_OWN_CARDS = 5000

def check_card_limits(conn, user_id, incoming_cards):
    if not incoming_cards:
        return True, ""
    current_count = conn.execute("SELECT COUNT(*) FROM user_cards WHERE user_id = ?", (user_id,)).fetchone()[0]
    incoming_ids = list({c["id"] for c in incoming_cards if "id" in c})
    if not incoming_ids:
        return True, ""
    placeholders = ",".join("?" for _ in incoming_ids)
    existing_matches = conn.execute(
        f"SELECT COUNT(*) FROM user_cards WHERE user_id = ? AND id IN ({placeholders})",
        (user_id, *incoming_ids)
    ).fetchone()[0]
    new_cards_count = len(incoming_ids) - existing_matches

    if current_count + new_cards_count > MAX_OWN_CARDS:
        return False, f"Own cards limit of {MAX_OWN_CARDS} cards per account exceeded."
    return True, ""

def sync_own_cards(conn, user_id, incoming_cards):
    if not incoming_cards:
        return
    for card in incoming_cards:
        card_id = card.get("id")
        updated_at = card.get("updated_at")
        question = card.get("question")
        answer = card.get("answer")
        category = card.get("category")
        created_at = card.get("created_at")
        deleted = 1 if card.get("deleted") else 0

        existing = conn.execute(
            "SELECT updated_at FROM user_cards WHERE user_id = ? AND id = ?",
            (user_id, card_id)
        ).fetchone()

        if existing is None:
            next_ver = db.get_next_version(conn)
            conn.execute(
                """INSERT INTO user_cards (user_id, id, question, answer, category, created_at, updated_at, deleted, server_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (user_id, card_id, question, answer, category, created_at, updated_at, deleted, next_ver)
            )
        elif updated_at > existing["updated_at"]:
            next_ver = db.get_next_version(conn)
            conn.execute(
                """UPDATE user_cards SET question = ?, answer = ?, category = ?, created_at = ?, updated_at = ?, deleted = ?, server_version = ?
                WHERE user_id = ? AND id = ?""",
                (question, answer, category, created_at, updated_at, deleted, next_ver, user_id, card_id)
            )

def get_changed_cards(conn, user_id, since, pushed_card_ids=None, limit=None):
    if pushed_card_ids:
        query = "SELECT id, question, answer, category, created_at, updated_at, deleted, server_version FROM user_cards WHERE user_id = ? AND (server_version > ? OR id IN (SELECT value FROM json_each(?))) ORDER BY server_version ASC"
        params = [user_id, since, json.dumps(list(pushed_card_ids))]
    else:
        query = "SELECT id, question, answer, category, created_at, updated_at, deleted, server_version FROM user_cards WHERE user_id = ? AND server_version > ? ORDER BY server_version ASC"
        params = [user_id, since]
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    return conn.execute(query, params).fetchall()