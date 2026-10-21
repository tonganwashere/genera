import json
import logging
from flask import Blueprint, request
from server import db
from server.controllers.auth_controller import require_login
from server.models.card import check_card_limits, sync_own_cards, get_changed_cards
from server.models.progress import check_progress_limits, sync_progress, get_changed_progress
from server.models.setting import sync_settings, get_user_settings
from server.db import get_current_version
from server.responses import json_success, json_error, get_json_body
from server.services.validation import validate_own_card, validate_progress_row, validate_settings

sync_bp = Blueprint("sync", __name__, url_prefix="/api")
MAX_REQUEST_BATCH = 500
MAX_RESPONSE_BATCH = 500

@sync_bp.route("/sync", methods=["POST"])
@require_login
def sync(user):
    if not user["email_verified"]:
        return json_error("Please verify your email address to enable sync.", status=403, extra={"unverified_email": True})

    user_id = user["id"]

    data, err = get_json_body(request)
    if err:
        return err

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

    valid_cards, card_msg = check_card_limits(conn, user_id, incoming_cards)
    if not valid_cards:
        return json_error(card_msg, field="own_cards", status=400)

    valid_prog, prog_msg = check_progress_limits(conn, user_id, incoming_progress)
    if not valid_prog:
        return json_error(prog_msg, field="progress", status=400)

    pushed_card_ids = {c["id"] for c in incoming_cards if "id" in c}
    pushed_progress_keys = {(p["card_kind"], p["card_id"]) for p in incoming_progress if "card_kind" in p and "card_id" in p}

    try:
        with conn:
            if incoming_cards:
                sync_own_cards(conn, user_id, incoming_cards)
            if incoming_progress:
                sync_progress(conn, user_id, incoming_progress)
            if incoming_settings is not None:
                sync_settings(conn, user_id, incoming_settings)

            all_changes = []
            for r in get_changed_cards(conn, user_id, since, pushed_card_ids):
                all_changes.append(("card", r["server_version"], r))

            for r in get_changed_progress(conn, user_id, since, pushed_progress_keys):
                all_changes.append(("progress", r["server_version"], r))

            all_changes.sort(key=lambda x: x[1])

            has_more = len(all_changes) > MAX_RESPONSE_BATCH
            if has_more:
                selected_changes = all_changes[:MAX_RESPONSE_BATCH]
                cutoff_ver = selected_changes[-1][1]
                if all_changes[MAX_RESPONSE_BATCH][1] == cutoff_ver:
                    less_than_cutoff = [c for c in selected_changes if c[1] < cutoff_ver]
                    if less_than_cutoff and less_than_cutoff[-1][1] >= since:
                        selected_changes = less_than_cutoff
                        returned_version = max(since, selected_changes[-1][1])
                    else:
                        same_ver_items = [c for c in all_changes if c[1] == cutoff_ver]
                        selected_changes = same_ver_items
                        returned_version = max(since, cutoff_ver)
                        has_more = len(all_changes) > len(selected_changes)
                else:
                    returned_version = max(since, cutoff_ver)
            else:
                selected_changes = all_changes
                returned_version = max(since, get_current_version(conn))


            out_cards = []
            out_progress = []
            for change_type, _, r in selected_changes:
                item = {k: r[k] for k in r.keys() if k != "server_version"}
                if change_type == "card":
                    out_cards.append(item)
                else:
                    out_progress.append(item)

            settings_row = get_user_settings(conn, user_id)
            out_settings = None
            if settings_row and (settings_row["server_version"] > since or incoming_settings is not None):
                try:
                    categories = json.loads(settings_row["enabled_categories"])
                except (ValueError, TypeError):
                    categories = []
                out_settings = {
                    "daily_new_limit": settings_row["daily_new_limit"],
                    "enabled_categories": categories,
                    "updated_at": settings_row["updated_at"]
                }

        return json_success({
            "own_cards": out_cards,
            "progress": out_progress,
            "settings": out_settings,
            "version": returned_version,
            "has_more": has_more
        }, status=200)

    except Exception as err:
        logging.exception("Sync failed: %s", err)
        return json_error("Sync failed due to an internal error.", status=500)