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

def get_json_body(request):
    if not request.is_json:
        return None, json_error("Request body must be JSON.", status=400)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, json_error("Malformed JSON body.", status=400)
    return data, None