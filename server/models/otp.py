from datetime import datetime, timezone, timedelta
import hashlib
import secrets

def create_otp(conn, user_id, kind):
    conn.execute("UPDATE user_otps SET used = 1 WHERE user_id = ? AND kind = ? AND used = 0", (user_id, kind))
    otp_code = f"{secrets.randbelow(1000000):06d}"
    otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
    now_utc = datetime.now(timezone.utc)
    created_at = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    expires_at = (now_utc + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        "INSERT INTO user_otps (user_id, kind, otp_hash, created_at, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)",
        (user_id, kind, otp_hash, created_at, expires_at)
    )
    conn.commit()
    return otp_code

def verify_otp(conn, user_id, kind, otp):
    record = conn.execute(
        "SELECT id, otp_hash, expires_at, used FROM user_otps WHERE user_id = ? AND kind = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (user_id, kind)
    ).fetchone()
    if not record:
        return False, "Invalid or expired code. Please request a new code."
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if now_str > record["expires_at"]:
        return False, "The code has expired. Please request a new code."
    expected_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(record["otp_hash"], expected_hash):
        return False, "Invalid OTP code."
    conn.execute("UPDATE user_otps SET used = 1 WHERE id = ?", (record["id"],))
    conn.commit()
    return True, None