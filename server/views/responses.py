from flask import jsonify

def json_success(payload=None, status=200):
    if payload is None:
        payload = {}
    return jsonify(payload), status

def json_error(error, field=None, status=400, extra=None):
    payload = {"error": error}
    if field is not None:
        payload["field"] = field
    if extra:
        payload.update(extra)
    return jsonify(payload), status

def user_view(user, csrf_token):
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "email_verified": user["email_verified"],
        "csrf_token": csrf_token
    }