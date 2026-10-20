from datetime import datetime, timezone, timedelta
import hashlib
import secrets
from server.services.email_service import send_otp_email, send_verification_email

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
    return otp_code

def verify_email_otp(conn, user_id, otp):
    record = conn.execute(
        "SELECT id, otp_hash, expires_at, used FROM email_verification_otps WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if not record:
        return False, "No pending verification code found. Please request a new code."
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if now_str > record["expires_at"]:
        return False, "Verification code has expired. Please request a new code."
    expected_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(record["otp_hash"], expected_hash):
        return False, "Invalid verification code."
    conn.execute("UPDATE email_verification_otps SET used = 1 WHERE id = ?", (record["id"],))
    conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
    conn.commit()
    return True, None

def create_reset_otp(conn, user_id, email):
    conn.execute("UPDATE password_reset_otps SET used = 1 WHERE user_id = ? AND used = 0", (user_id,))
    otp_code = f"{secrets.randbelow(1000000):06d}"
    otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
    now_utc = datetime.now(timezone.utc)
    created_at = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    expires_at = (now_utc + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        "INSERT INTO password_reset_otps (user_id, otp_hash, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)",
        (user_id, otp_hash, created_at, expires_at)
    )
    conn.commit()
    send_otp_email(email, otp_code)
    return otp_code

def verify_reset_otp(conn, user_id, otp):
    record = conn.execute(
        "SELECT id, otp_hash, expires_at, used FROM password_reset_otps WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if not record:
        return False, "Invalid or expired code. Please request a new code."
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if now_str > record["expires_at"]:
        return False, "The code has expired. Please request a new code."
    expected_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(record["otp_hash"], expected_hash):
        return False, "Invalid OTP code."
    conn.execute("UPDATE password_reset_otps SET used = 1 WHERE id = ?", (record["id"],))
    return True, None