def get_next_version(conn):
    conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'global_version'")
    row = conn.execute("SELECT value FROM meta WHERE key = 'global_version'").fetchone()
    return row[0]

def get_current_version(conn):
    row = conn.execute("SELECT value FROM meta WHERE key = 'global_version'").fetchone()
    return row[0] if row else 0