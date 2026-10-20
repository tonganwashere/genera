import json
from flask import Blueprint, request
from server import db
from server.controllers.auth_controller import get_current_user, validate_csrf
from server.models.card import check_card_limits, sync_own_cards, get_changed_cards
from server.models.progress import check_progress_limits, sync_progress, get_changed_progress
from server.models.setting import sync_settings, get_user_settings
from server.models.sync_version import get_current_version
from server.views.responses import json_success, json_error
from server.services.validation import validate_own_card, validate_progress_row, validate_settings

sync_bp = Blueprint("sync", __name__, url_prefix="/api")
MAX_REQUEST_BATCH = 500
MAX_RESPONSE_BATCH = 500

@sync_bp.route("/sync", methods=["POST"])
def sync():
    user = get_current_user()
    if not user:
        return json_error("Not logged in.", status=401)

    if not validate_csrf():
        return json_error("Invalid or missing CSRF token.", status=403)

    if not user["email_verified"]:
        return json_error("Please verify your email address to enable sync.", status=403, extra={"unverified_email": True})

    user_id = user["id"]

    if not request.is_json:
        return json_error("Request body must be JSON.", status=400)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Malformed JSON body.", status=400)

    since = data.get("since", 0)
    incoming_cards = data.get("own_cards", [])
    incoming_progress = data.get("progress", [])
    incoming_settings = data.get("settings")

    if not isinstance(incoming_cards, list) or not isinstance(incoming_progress, list):
        return json_error("own_cards and progress must be arrays.", status=400)

    if len(incoming_cards) + len(incoming_progress) > MAX_REQUEST_BATCH:
        return json_error(f"Batch size exceeds maximum limit of {MAX_REQUEST_BATCH} rows.", status=400)

    for card in incoming_cards:
        valid, msg, field = validate_own_card(card)
        if not valid:
            return json_error(msg, field=field, status=400)

    for item in incoming_progress:
        valid, msg, field = validate_progress_row(item)
        if not valid:
            return json_error(msg, field=field, status=400)

    if incoming_settings is not None:
        valid, msg, field = validate_settings(incoming_settings)
        if not valid:
            return json_error(msg, field=field, status=400)

    conn = db.get_db()

    try:
        conn.execute("BEGIN TRANSACTION")

        valid_cards, card_msg = check_card_limits(conn, user_id, incoming_cards)
        if not valid_cards:
            conn.rollback()
            return json_error(card_msg, field="own_cards", status=400)

        valid_prog, prog_msg = check_progress_limits(conn, user_id, incoming_progress)
        if not valid_prog:
            conn.rollback()
            return json_error(prog_msg, field="progress", status=400)

        sync_own_cards(conn, user_id, incoming_cards)
        sync_progress(conn, user_id, incoming_progress)
        sync_settings(conn, user_id, incoming_settings)

        pushed_card_ids = {c["id"] for c in incoming_cards if "id" in c}
        pushed_progress_keys = {(p["card_kind"], p["card_id"]) for p in incoming_progress if "card_kind" in p and "card_id" in p}

        changed_cards = get_changed_cards(conn, user_id, since, pushed_card_ids)
        changed_progress = get_changed_progress(conn, user_id)

        all_changes = []
        for r in changed_cards:
            all_changes.append(("card", r["server_version"], r))

        for r in changed_progress:
            key = (r["card_kind"], r["card_id"])
            if r["server_version"] > since or key in pushed_progress_keys:
                all_changes.append(("progress", r["server_version"], r))

        all_changes.sort(key=lambda x: x[1])

        has_more = len(all_changes) > MAX_RESPONSE_BATCH
        if has_more:
            selected_changes = all_changes[:MAX_RESPONSE_BATCH]
            returned_version = selected_changes[-1][1]
        else:
            selected_changes = all_changes
            returned_version = get_current_version(conn)

        out_cards = []
        out_progress = []

        for change_type, _, r in selected_changes:
            if change_type == "card":
                out_cards.append({
                    "id": r["id"],
                    "question": r["question"],
                    "answer": r["answer"],
                    "category": r["category"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "deleted": r["deleted"]
                })
            elif change_type == "progress":
                out_progress.append({
                    "card_kind": r["card_kind"],
                    "card_id": r["card_id"],
                    "box": r["box"],
                    "due_date": r["due_date"],
                    "last_reviewed": r["last_reviewed"],
                    "introduced_on": r["introduced_on"],
                    "times_right": r["times_right"],
                    "times_wrong": r["times_wrong"],
                    "hidden": r["hidden"],
                    "updated_at": r["updated_at"]
                })

        settings_row = get_user_settings(conn, user_id)
        out_settings = None
        if settings_row:
            if settings_row["server_version"] > since or incoming_settings is not None:
                categories = []
                try:
                    categories = json.loads(settings_row["enabled_categories"])
                except Exception:
                    categories = []
                out_settings = {
                    "daily_new_limit": settings_row["daily_new_limit"],
                    "enabled_categories": categories,
                    "updated_at": settings_row["updated_at"]
                }

        conn.commit()

        return json_success({
            "own_cards": out_cards,
            "progress": out_progress,
            "settings": out_settings,
            "version": returned_version,
            "has_more": has_more
        }, status=200)

    except Exception as err:
        conn.rollback()
        return json_error(f"Sync transaction failed: {str(err)}", status=500)