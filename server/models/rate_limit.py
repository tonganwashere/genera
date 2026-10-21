import time

_last_prune = 0

def prune_old_records(conn, now):
    global _last_prune
    if now - _last_prune >= 300:
        conn.execute("DELETE FROM rate_limits WHERE created_at < ?", (now - 3600,))
        _last_prune = now

def check_rate_limits(conn, keys_with_limits, window_seconds):
    now = int(time.time())
    cutoff = now - window_seconds
    placeholders = ",".join("?" for _ in keys_with_limits)
    keys = list(keys_with_limits.keys())
    rows = conn.execute(
        f"SELECT key, COUNT(*) FROM rate_limits WHERE key IN ({placeholders}) AND created_at >= ? GROUP BY key",
        (*keys, cutoff)
    ).fetchall()
    counts = dict(rows)
    return any(counts.get(k, 0) >= limit for k, limit in keys_with_limits.items())

def record_keys(conn, *keys):
    now = int(time.time())
    prune_old_records(conn, now)
    conn.executemany("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)", [(k, now) for k in keys])
    conn.commit()

def is_rate_limited(conn, ip, identifier):
    return check_rate_limits(conn, {f"ip:{ip}": 20, f"user:{identifier.lower()}": 5}, 900)

def record_failure(conn, ip, identifier):
    record_keys(conn, f"ip:{ip}", f"user:{identifier.lower()}")

def clear_failures(conn, identifier):
    conn.execute("DELETE FROM rate_limits WHERE key = ?", (f"user:{identifier.lower()}",))
    conn.commit()

def is_otp_rate_limited(conn, ip, email):
    return check_rate_limits(conn, {f"otp_ip:{ip}": 5, f"otp_email:{email.lower()}": 1}, 60)

def record_otp_request(conn, ip, email):
    record_keys(conn, f"otp_ip:{ip}", f"otp_email:{email.lower()}")