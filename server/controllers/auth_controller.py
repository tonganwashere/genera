from functools import wraps
import logging
import os
import secrets
import sqlite3
from flask import Blueprint, request, session
from werkzeug.security import check_password_hash
from server import config, db
from server.models.user import (
    get_user_by_id, get_user_by_identifier,
    create_user, update_user_password, update_user_email,
    reset_user_password_and_verify, delete_user_account, is_email_taken, mark_email_verified,
    is_username_taken, update_user_username
)
from server.models.otp import create_otp, verify_otp
from server.models.rate_limit import (
    is_rate_limited, record_failure, clear_failures, is_otp_rate_limited, record_otp_request
)
from server.services.email_service import send_otp_email
from server.responses import json_success, json_error, user_view, get_json_body
from server.services.validation import validate_email, validate_otp, validate_password, validate_username

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

def get_current_user():
    user_id = session.get("user_id")
    token_version = session.get("token_version")
    if not user_id or token_version is None:
        return None
    conn = db.get_db()
    user = get_user_by_id(conn, user_id)
    if not user or user["token_version"] != token_version:
        session.clear()
        return None
    return user

def validate_csrf():
    token = request.headers.get("X-CSRF-Token")
    expected = session.get("csrf_token")
    return bool(token and expected and secrets.compare_digest(token, expected))

def require_login(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return json_error("Not logged in.", status=401)
        if request.method not in ("GET", "HEAD") and not validate_csrf():
            return json_error("Invalid or missing CSRF token.", status=403)
        return fn(user, *args, **kwargs)
    return wrapper

def get_client_ip():
    if getattr(config, "TRUST_PROXY_HEADERS", False):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.remote_addr or "127.0.0.1"


@auth_bp.route("/register", methods=["POST"])
def register():
    data, err = get_json_body(request)
    if err:
        return err

    username = data.get("username", "")
    email = data.get("email", "")
    password = data.get("password", "")

    valid_user, user_err, field = validate_username(username)
    if not valid_user:
        return json_error(user_err, field=field, status=400)

    valid_email, email_err, field = validate_email(email)
    if not valid_email:
        return json_error(email_err, field=field, status=400)

    valid_pass, pass_err, field = validate_password(password)
    if not valid_pass:
        return json_error(pass_err, field=field, status=400)

    conn = db.get_db()
    clean_user = username.strip()
    clean_email = email.strip().lower()

    try:
        user_id = create_user(conn, clean_user, clean_email, password)
    except sqlite3.IntegrityError:
        conn.rollback()
        if get_user_by_identifier(conn, clean_user):
            return json_error("Username is already taken.", field="username", status=409)
        return json_error("Email is already registered.", field="email", status=409)

    otp_code = create_otp(conn, user_id, "verification")
    try:
        send_otp_email(clean_email, otp_code, purpose="Verification")
    except Exception as email_err:
        logging.warning("Failed to send verification email to %s: %s", clean_email, email_err)


    csrf_token = secrets.token_hex(16)
    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = clean_user
    session["email"] = clean_email
    session["token_version"] = 1
    session["csrf_token"] = csrf_token

    return json_success(user_view({
        "id": user_id,
        "username": clean_user,
        "email": clean_email,
        "email_verified": 0
    }, csrf_token), status=201)

@auth_bp.route("/login", methods=["POST"])
def login():
    data, err = get_json_body(request)
    if err:
        return err

    identifier = data.get("identifier") or data.get("username", "")
    password = data.get("password", "")

    if not identifier or not password:
        return json_error("Username/Email and password are required.", status=400)

    clean_ident = identifier.strip().lower()
    client_ip = get_client_ip()
    conn = db.get_db()

    if is_rate_limited(conn, client_ip, clean_ident):
        return json_error("Too many failed login attempts. Please try again later.", status=429)

    user = get_user_by_identifier(conn, clean_ident)
    if not user or not check_password_hash(user["password_hash"], password):
        record_failure(conn, client_ip, clean_ident)
        return json_error("Invalid username/email or password.", status=401)

    clear_failures(conn, clean_ident)
    csrf_token = secrets.token_hex(16)
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["email"] = user["email"]
    session["token_version"] = user["token_version"]
    session["csrf_token"] = csrf_token

    return json_success(user_view(user, csrf_token), status=200)

@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return json_success({"message": "Logged out successfully."}, status=200)

@auth_bp.route("/me", methods=["GET"])
@require_login
def me(user):
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return json_success(user_view(user, session["csrf_token"]), status=200)

@auth_bp.route("/verify-email", methods=["POST"])
@require_login
def verify_email(user):
    if user["email_verified"] == 1:
        return json_success({"message": "Email is already verified.", "email_verified": 1}, status=200)

    data, err = get_json_body(request)
    if err:
        return err

    otp = data.get("otp", "").strip()
    valid_otp, otp_err, field = validate_otp(otp)
    if not valid_otp:
        return json_error(otp_err, field=field, status=400)

    conn = db.get_db()
    success, err_msg = verify_otp(conn, user["id"], "verification", otp)
    if not success:
        return json_error(err_msg, status=400)
    mark_email_verified(conn, user["id"])

    return json_success({"message": "Email verified successfully.", "email_verified": 1}, status=200)

@auth_bp.route("/resend-verification", methods=["POST"])
@require_login
def resend_verification(user):
    if not user["email"]:
        return json_error("No email address linked to this account.", status=400)

    if user["email_verified"]:
        return json_error("Email is already verified.", status=400)

    client_ip = get_client_ip()
    conn = db.get_db()

    if is_otp_rate_limited(conn, client_ip, user["email"]):
        return json_error("Please wait at least 60 seconds before requesting another code.", status=429)

    record_otp_request(conn, client_ip, user["email"])
    otp_code = create_otp(conn, user["id"], "verification")
    try:
        send_otp_email(user["email"], otp_code, purpose="email verification")
    except Exception as err:
        return json_error(f"Failed to send verification code: {err}", status=502)

    return json_success({"message": "Verification code sent."}, status=200)

@auth_bp.route("/bind-email", methods=["POST"])
@require_login
def bind_email(user):
    data, err = get_json_body(request)
    if err:
        return err

    email = data.get("email", "").strip().lower()
    valid_email, email_err, field = validate_email(email)
    if not valid_email:
        return json_error(email_err, field=field, status=400)

    password = data.get("password", "")
    if not password:
        return json_error("Current password is required to update email.", field="password", status=400)

    if user["email"] and email == user["email"].lower():
        return json_error("This email address is already linked to your account.", field="email", status=400)

    conn = db.get_db()
    if not check_password_hash(user["password_hash"], password):
        return json_error("Current password is incorrect.", field="password", status=400)

    if is_email_taken(conn, email, exclude_user_id=user["id"]):
        return json_error("Email is already registered to another account.", field="email", status=409)

    update_user_email(conn, user["id"], email)
    session["email"] = email
    otp_code = create_otp(conn, user["id"], "verification")
    try:
        send_otp_email(email, otp_code, purpose="Verification")
    except Exception as err:
        logging.warning("Failed to send verification email to %s: %s", email, err)

    return json_success({"message": "Email updated. Please verify your new address.", "email": email, "email_verified": 0}, status=200)


@auth_bp.route("/change-password", methods=["POST"])
@require_login
def change_password(user):
    data, err = get_json_body(request)
    if err:
        return err

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return json_error("Current password and new password are required.", status=400)

    if current_password == new_password:
        return json_error("New password cannot be the same as your current password.", field="new_password", status=400)

    valid_pass, pass_err, _ = validate_password(new_password)
    if not valid_pass:
        return json_error(pass_err, field="new_password", status=400)

    conn = db.get_db()
    if not check_password_hash(user["password_hash"], current_password):
        return json_error("Current password is incorrect.", field="current_password", status=400)

    new_token_version = user["token_version"] + 1
    update_user_password(conn, user["id"], new_password, new_token_version)
    session["token_version"] = new_token_version

    return json_success({"message": "Password updated successfully."}, status=200)

@auth_bp.route("/change-username", methods=["POST"])
@require_login
def change_username(user):
    data, err = get_json_body(request)
    if err:
        return err

    new_username = data.get("username", "").strip()
    valid_user, user_err, field = validate_username(new_username)
    if not valid_user:
        return json_error(user_err, field=field, status=400)

    password = data.get("password", "")
    if not password:
        return json_error("Current password is required to update username.", field="password", status=400)

    if new_username.lower() == user["username"].lower():
        return json_error("New username must be different from your current username.", field="username", status=400)

    conn = db.get_db()
    if not check_password_hash(user["password_hash"], password):
        return json_error("Current password is incorrect.", field="password", status=400)

    if is_username_taken(conn, new_username, exclude_user_id=user["id"]):
        return json_error("Username is already taken.", field="username", status=409)

    update_user_username(conn, user["id"], new_username)
    session["username"] = new_username
    return json_success({"message": "Username updated successfully.", "username": new_username}, status=200)

@auth_bp.route("/account", methods=["DELETE"])
@require_login
def delete_account(user):
    data, err = get_json_body(request)
    if err:
        return err

    password = data.get("password", "")
    if not password:
        return json_error("Password is required to delete account.", status=400)

    conn = db.get_db()
    if not check_password_hash(user["password_hash"], password):
        return json_error("Password is incorrect.", status=400)

    delete_user_account(conn, user["id"])
    session.clear()
    return json_success({"message": "Account deleted successfully."}, status=200)

@auth_bp.route("/forgot-password/request-otp", methods=["POST"])
def request_otp():
    data, err = get_json_body(request)
    if err:
        return err

    email = data.get("email", "").strip().lower()
    valid_email, email_err, field = validate_email(email)
    if not valid_email:
        return json_error(email_err, field=field, status=400)

    client_ip = get_client_ip()
    conn = db.get_db()

    if is_otp_rate_limited(conn, client_ip, email):
        return json_error("Please wait at least 60 seconds before requesting another code.", status=429)

    record_otp_request(conn, client_ip, email)
    user = get_user_by_identifier(conn, email)
    if user:
        otp_code = create_otp(conn, user["id"], "reset")
        try:
            send_otp_email(email, otp_code, purpose="Password Reset")
        except Exception as err:
            logging.warning("Failed to send reset code to %s: %s", email, err)


    return json_success({"message": "If this email is registered, a password reset code has been sent."}, status=200)

@auth_bp.route("/forgot-password/reset", methods=["POST"])
def reset_password():
    data, err = get_json_body(request)
    if err:
        return err

    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()
    new_password = data.get("new_password", "")

    valid_email, email_err, field = validate_email(email)
    if not valid_email:
        return json_error(email_err, field=field, status=400)

    valid_otp, otp_err, field = validate_otp(otp)
    if not valid_otp:
        return json_error(otp_err, field=field, status=400)

    valid_pass, pass_err, _ = validate_password(new_password)
    if not valid_pass:
        return json_error(pass_err, field="new_password", status=400)

    conn = db.get_db()
    user = get_user_by_identifier(conn, email)
    if not user:
        return json_error("Invalid email or expired code.", status=400)

    success, err_msg = verify_otp(conn, user["id"], "reset", otp)
    if not success:
        return json_error(err_msg, status=400)

    reset_user_password_and_verify(conn, user["id"], new_password)
    session.clear()
    return json_success({"message": "Password reset successfully. You can now log in with your new password."}, status=200)