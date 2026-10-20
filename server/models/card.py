import json
from server.models.sync_version import get_next_version

MAX_OWN_CARDS = 5000

def check_card_limits(conn, user_id, incoming_cards):
    if not incoming_cards:
        return True, ""
    existing_card_ids = {
        r[0] for r in conn.execute("SELECT id FROM user_cards WHERE user_id = ?", (user_id,)).fetchall()
    }
    new_cards_count = sum(1 for c in incoming_cards if c.get("id") not in existing_card_ids)
    if len(existing_card_ids) + new_cards_count > MAX_OWN_CARDS:
        return False, f"Own cards limit of {MAX_OWN_CARDS} cards per account exceeded."
    return True, ""

def sync_own_cards(conn, user_id, incoming_cards):
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
            next_ver = get_next_version(conn)
            conn.execute(
                "INSERT INTO user_cards (user_id, id, question, answer, category, created_at, updated_at, deleted, server_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, card_id, question, answer, category, created_at, updated_at, deleted, next_ver)
            )
        elif updated_at > existing["updated_at"]:
            next_ver = get_next_version(conn)
            conn.execute(
                "UPDATE user_cards SET question = ?, answer = ?, category = ?, created_at = ?, updated_at = ?, deleted = ?, server_version = ? WHERE user_id = ? AND id = ?",
                (question, answer, category, created_at, updated_at, deleted, next_ver, user_id, card_id)
            )

def get_changed_cards(conn, user_id, since, pushed_card_ids):
    return conn.execute(
        "SELECT id, question, answer, category, created_at, updated_at, deleted, server_version FROM user_cards WHERE user_id = ? AND (server_version > ? OR id IN (SELECT value FROM json_each(?))) ORDER BY server_version ASC",
        (user_id, since, json.dumps(list(pushed_card_ids)))
    ).fetchall()