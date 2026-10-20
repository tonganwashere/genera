import time

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