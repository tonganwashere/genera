from datetime import datetime, timezone, timedelta
import hashlib
import secrets
import sqlite3
import time
from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash
from server import db
from server.email_service import send_otp_email, send_verification_email
from server.validation import validate_email, validate_otp, validate_password, validate_username

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

def get_current_user():
    user_id = session.get("user_id")
    token_version = session.get("token_version")
    if not user_id or token_version is None:
        return None
    conn = db.get_db()
    user = conn.execute(
        "SELECT id, username, email, token_version, email_verified FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    if not user or user["token_version"] != token_version:
        session.clear()
        return None
    return user

def validate_csrf():
    token = request.headers.get("X-CSRF-Token")
    expected = session.get("csrf_token")
    if not token or not expected or not secrets.compare_digest(token, expected):
        return False
    return True

def is_rate_limited(conn, ip, identifier):
    now = int(time.time())
    window = 900
    cutoff = now - window
    conn.execute("DELETE FROM rate_limits WHERE created_at < ?", (now - 3600,))
    conn.commit()
    ip_key = f"ip:{ip}"
    user_key = f"user:{identifier.lower()}"
    ip_count = conn.execute("SELECT COUNT(*) FROM rate_limits WHERE key = ? AND created_at >= ?", (ip_key, cutoff)).fetchone()[0]
    user_count = conn.execute("SELECT COUNT(*) FROM rate_limits WHERE key = ? AND created_at >= ?", (user_key, cutoff)).fetchone()[0]
    return ip_count >= 20 or user_count >= 5

def record_failure(conn, ip, identifier):
    now = int(time.time())
    ip_key = f"ip:{ip}"
    user_key = f"user:{identifier.lower()}"
    conn.execute("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)", (ip_key, now))
    conn.execute("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)", (user_key, now))
    conn.commit()

def clear_failures(conn, ip, identifier):
    user_key = f"user:{identifier.lower()}"
    conn.execute("DELETE FROM rate_limits WHERE key = ?", (user_key,))
    conn.commit()

def is_otp_rate_limited(conn, ip, email):
    now = int(time.time())
    cutoff = now - 60
    ip_key = f"otp_ip:{ip}"
    email_key = f"otp_email:{email.lower()}"
    ip_count = conn.execute("SELECT COUNT(*) FROM rate_limits WHERE key = ? AND created_at >= ?", (ip_key, cutoff)).fetchone()[0]
    email_count = conn.execute("SELECT COUNT(*) FROM rate_limits WHERE key = ? AND created_at >= ?", (email_key, cutoff)).fetchone()[0]
    return ip_count >= 5 or email_count >= 1

def record_otp_request(conn, ip, email):
    now = int(time.time())
    ip_key = f"otp_ip:{ip}"
    email_key = f"otp_email:{email.lower()}"
    conn.execute("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)", (ip_key, now))
    conn.execute("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)", (email_key, now))
    conn.commit()

def create_verification_otp(conn, user_id, email):
    conn.execute("UPDATE email_verification_otps SET used = 1 WHERE user_id = ? AND used = 0", (user_id,))
    otp_code = f"{secrets.randbelow(1000000):06d}"
    otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
    now_utc = datetime.now(timezone.utc)
    created_at = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    expires_at = (now_utc + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        "INSERT INTO email_verification_otps (user_id, otp_hash, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)",
        (user_id, otp_hash, created_at, expires_at)
    )
    conn.commit()
    send_verification_email(email, otp_code)

@auth_bp.route("/register", methods=["POST"])
def register():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    username = data.get("username", "")
    email = data.get("email", "")
    password = data.get("password", "")

    valid_user, user_err = validate_username(username)
    if not valid_user:
        return jsonify({"error": user_err, "field": "username"}), 400

    valid_email, email_err = validate_email(email)
    if not valid_email:
        return jsonify({"error": email_err, "field": "email"}), 400

    valid_pass, pass_err = validate_password(password)
    if not valid_pass:
        return jsonify({"error": pass_err, "field": "password"}), 400

    username = username.strip()
    email = email.strip().lower()
    conn = db.get_db()
    cursor = conn.cursor()

    existing_user = cursor.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing_user:
        return jsonify({"error": "Username is already taken.", "field": "username"}), 409

    existing_email = cursor.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing_email:
        return jsonify({"error": "Email is already registered.", "field": "email"}), 409

    password_hash = generate_password_hash(password)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        cursor.execute(
            "INSERT INTO users (username, email, password_hash, token_version, email_verified, created_at) VALUES (?, ?, ?, 1, 0, ?)",
            (username, email, password_hash, timestamp)
        )
        user_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO user_settings (user_id, daily_new_limit, enabled_categories, updated_at, server_version) VALUES (?, 10, '[]', ?, 0)",
            (user_id, timestamp)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({"error": "Username or email is already taken."}), 409

    csrf_token = secrets.token_hex(16)
    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    session["email"] = email
    session["token_version"] = 1
    session["csrf_token"] = csrf_token

    create_verification_otp(conn, user_id, email)

    return jsonify({
        "id": user_id,
        "username": username,
        "email": email,
        "email_verified": 0,
        "csrf_token": csrf_token
    }), 201

@auth_bp.route("/login", methods=["POST"])
def login():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    identifier = data.get("identifier") or data.get("username", "")
    password = data.get("password", "")

    if not identifier or not password:
        return jsonify({"error": "Username/Email and password are required."}), 400

    clean_ident = identifier.strip().lower()
    client_ip = request.remote_addr or "127.0.0.1"
    conn = db.get_db()

    if is_rate_limited(conn, client_ip, clean_ident):
        return jsonify({"error": "Too many failed login attempts. Please try again later."}), 429

    user = conn.execute(
        "SELECT id, username, email, password_hash, token_version, email_verified FROM users WHERE username = ? OR email = ?",
        (clean_ident, clean_ident)
    ).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        record_failure(conn, client_ip, clean_ident)
        return jsonify({"error": "Invalid username/email or password."}), 401

    clear_failures(conn, client_ip, clean_ident)
    csrf_token = secrets.token_hex(16)
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["email"] = user["email"]
    session["token_version"] = user["token_version"]
    session["csrf_token"] = csrf_token

    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "email_verified": user["email_verified"],
        "csrf_token": csrf_token
    }), 200

@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200

@auth_bp.route("/me", methods=["GET"])
def me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)

    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "email_verified": user["email_verified"],
        "csrf_token": session["csrf_token"]
    }), 200

@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    if user["email_verified"] == 1:
        return jsonify({"message": "Email is already verified.", "email_verified": 1}), 200

    if not validate_csrf():
        return jsonify({"error": "Invalid or missing CSRF token."}), 403

    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    otp = data.get("otp", "").strip()
    valid_otp, otp_err = validate_otp(otp)
    if not valid_otp:
        return jsonify({"error": otp_err, "field": "otp"}), 400

    conn = db.get_db()
    record = conn.execute(
        "SELECT id, otp_hash, expires_at, used FROM email_verification_otps WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (user["id"],)
    ).fetchone()

    if not record:
        return jsonify({"error": "No pending verification code found. Please request a new code."}), 400

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if now_str > record["expires_at"]:
        return jsonify({"error": "Verification code has expired. Please request a new code."}), 400

    expected_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(record["otp_hash"], expected_hash):
        return jsonify({"error": "Invalid verification code."}), 400

    conn.execute("UPDATE email_verification_otps SET used = 1 WHERE id = ?", (record["id"],))
    conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user["id"],))
    conn.commit()

    return jsonify({"message": "Email verified successfully.", "email_verified": 1}), 200

@auth_bp.route("/resend-verification", methods=["POST"])
def resend_verification():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    if not validate_csrf():
        return jsonify({"error": "Invalid or missing CSRF token."}), 403

    if not user["email"]:
        return jsonify({"error": "No email address linked to this account."}), 400

    if user["email_verified"]:
        return jsonify({"error": "Email is already verified."}), 400

    client_ip = request.remote_addr or "127.0.0.1"
    conn = db.get_db()

    if is_otp_rate_limited(conn, client_ip, user["email"]):
        return jsonify({"error": "Please wait at least 60 seconds before requesting another code."}), 429

    record_otp_request(conn, client_ip, user["email"])
    create_verification_otp(conn, user["id"], user["email"])

    return jsonify({"message": "Verification code sent."}), 200

@auth_bp.route("/bind-email", methods=["POST"])
def bind_email():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    if not validate_csrf():
        return jsonify({"error": "Invalid or missing CSRF token."}), 403

    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    email = data.get("email", "").strip().lower()
    valid_email, email_err = validate_email(email)
    if not valid_email:
        return jsonify({"error": email_err, "field": "email"}), 400

    password = data.get("password", "")
    if not password:
        return jsonify({"error": "Current password is required to update email.", "field": "password"}), 400

    if user["email"] and email == user["email"].lower():
        return jsonify({"error": "This Gmail address is already linked to your account.", "field": "email"}), 400

    conn = db.get_db()
    db_user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not db_user or not check_password_hash(db_user["password_hash"], password):
        return jsonify({"error": "Current password is incorrect.", "field": "password"}), 400

    existing = conn.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user["id"])).fetchone()
    if existing:
        return jsonify({"error": "Email is already registered to another account.", "field": "email"}), 409

    conn.execute("UPDATE users SET email = ?, email_verified = 0 WHERE id = ?", (email, user["id"]))
    conn.commit()

    session["email"] = email
    create_verification_otp(conn, user["id"], email)

    return jsonify({"message": "Email updated. Please verify your new address.", "email": email, "email_verified": 0}), 200

@auth_bp.route("/change-password", methods=["POST"])
def change_password():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    if not validate_csrf():
        return jsonify({"error": "Invalid or missing CSRF token."}), 403

    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "Current password and new password are required."}), 400

    if current_password == new_password:
        return jsonify({"error": "New password cannot be the same as your current password.", "field": "new_password"}), 400

    valid_pass, pass_err = validate_password(new_password)
    if not valid_pass:
        return jsonify({"error": pass_err, "field": "new_password"}), 400

    conn = db.get_db()
    db_user = conn.execute("SELECT id, password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not db_user or not check_password_hash(db_user["password_hash"], current_password):
        return jsonify({"error": "Current password is incorrect.", "field": "current_password"}), 400

    new_hash = generate_password_hash(new_password)
    new_token_version = user["token_version"] + 1
    conn.execute(
        "UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?",
        (new_hash, new_token_version, user["id"])
    )
    conn.commit()

    session["token_version"] = new_token_version

    return jsonify({"message": "Password updated successfully."}), 200

@auth_bp.route("/account", methods=["DELETE"])
def delete_account():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    if not validate_csrf():
        return jsonify({"error": "Invalid or missing CSRF token."}), 403

    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    password = data.get("password", "")
    if not password:
        return jsonify({"error": "Password is required to delete account."}), 400

    conn = db.get_db()
    db_user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not db_user or not check_password_hash(db_user["password_hash"], password):
        return jsonify({"error": "Password is incorrect."}), 400

    conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    conn.commit()

    session.clear()
    return jsonify({"message": "Account deleted successfully."}), 200

@auth_bp.route("/forgot-password/request-otp", methods=["POST"])
def request_otp():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    email = data.get("email", "").strip().lower()
    valid_email, email_err = validate_email(email)
    if not valid_email:
        return jsonify({"error": email_err, "field": "email"}), 400

    client_ip = request.remote_addr or "127.0.0.1"
    conn = db.get_db()

    if is_otp_rate_limited(conn, client_ip, email):
        return jsonify({"error": "Please wait at least 60 seconds before requesting another code."}), 429

    record_otp_request(conn, client_ip, email)
    user = conn.execute("SELECT id, email_verified FROM users WHERE email = ?", (email,)).fetchone()

    if user:
        conn.execute("UPDATE password_reset_otps SET used = 1 WHERE user_id = ? AND used = 0", (user["id"],))
        otp_code = f"{secrets.randbelow(1000000):06d}"
        otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
        now_utc = datetime.now(timezone.utc)
        created_at = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        expires_at = (now_utc + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn.execute(
            "INSERT INTO password_reset_otps (user_id, otp_hash, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)",
            (user["id"], otp_hash, created_at, expires_at)
        )
        conn.commit()
        send_otp_email(email, otp_code)

    return jsonify({"message": "If this email is registered, a password reset code has been sent."}), 200

@auth_bp.route("/forgot-password/reset", methods=["POST"])
def reset_password():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed JSON body."}), 400

    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()
    new_password = data.get("new_password", "")

    valid_email, email_err = validate_email(email)
    if not valid_email:
        return jsonify({"error": email_err, "field": "email"}), 400

    valid_otp, otp_err = validate_otp(otp)
    if not valid_otp:
        return jsonify({"error": otp_err, "field": "otp"}), 400

    valid_pass, pass_err = validate_password(new_password)
    if not valid_pass:
        return jsonify({"error": pass_err, "field": "new_password"}), 400

    conn = db.get_db()
    user = conn.execute("SELECT id, email_verified FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        return jsonify({"error": "Invalid email or expired code."}), 400

    record = conn.execute(
        "SELECT id, otp_hash, expires_at, used FROM password_reset_otps WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (user["id"],)
    ).fetchone()

    if not record:
        return jsonify({"error": "Invalid or expired code. Please request a new code."}), 400

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if now_str > record["expires_at"]:
        return jsonify({"error": "The code has expired. Please request a new code."}), 400

    expected_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(record["otp_hash"], expected_hash):
        return jsonify({"error": "Invalid OTP code."}), 400

    conn.execute("UPDATE password_reset_otps SET used = 1 WHERE id = ?", (record["id"],))
    new_hash = generate_password_hash(new_password)
    conn.execute(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, email_verified = 1 WHERE id = ?",
        (new_hash, user["id"])
    )
    conn.commit()

    session.clear()
    return jsonify({"message": "Password reset successfully. You can now log in with your new password."}), 200