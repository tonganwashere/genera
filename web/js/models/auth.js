import {
    get_meta,
    set_meta,
    set_meta_batch,
    merge_local_into_account,
    clear_account_local_data
} from "./localdb.js";

export async function api_request(endpoint, { method = "POST", body = null, require_csrf = false, csrf_token = null } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (require_csrf) {
        const token = csrf_token || (await get_meta("csrf_token"));
        if (token) headers["X-CSRF-Token"] = token;
    }
    const options = { method, headers };
    if (body !== null) options.body = JSON.stringify(body);
    const res = await fetch(endpoint, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
}

export async function perform_account_login({ username, email, password, is_register = false }) {
    const endpoint = is_register ? "/api/register" : "/api/login";
    const payload = is_register
        ? { username, email, password }
        : { identifier: username, password };

    const user_data = await api_request(endpoint, { body: payload });
    const current_mode = await get_meta("mode");

    await set_meta_batch({
        mode: "account",
        username: user_data.username,
        email: user_data.email || null,
        email_verified: user_data.email_verified ?? 0,
        csrf_token: user_data.csrf_token || null
    });

    if (current_mode === "local" && user_data.email_verified === 1) {
        const pull_data = await api_request("/api/sync", {
            body: {
                since: 0,
                own_cards: [],
                progress: [],
                settings: null
            },
            require_csrf: true,
            csrf_token: user_data.csrf_token || null
        });

        await merge_local_into_account({
            server_cards: pull_data.own_cards || [],
            server_progress: pull_data.progress || [],
            server_settings: pull_data.settings || null,
            server_version: pull_data.version || 0,
            username: user_data.username
        });
    }

    return user_data;
}

export async function perform_account_logout() {
    try {
        await fetch("/api/logout", { method: "POST" });
    } catch (_) {}

    await clear_account_local_data();
}

export async function verify_account_email(otp) {
    const data = await api_request("/api/verify-email", {
        body: { otp },
        require_csrf: true
    });
    await set_meta("email_verified", 1);
    return data;
}

export async function bind_account_email({ email, password }) {
    const data = await api_request("/api/bind-email", {
        body: { email, password },
        require_csrf: true
    });
    await set_meta_batch({ email, email_verified: 0 });
    return data;
}

export async function update_user_username({ username, password }) {
    const data = await api_request("/api/change-username", {
        body: { username, password },
        require_csrf: true
    });
    await set_meta("username", data.username);
    return data;
}

export async function delete_user_account(password) {
    const data = await api_request("/api/account", {
        method: "DELETE",
        body: { password },
        require_csrf: true
    });
    await clear_account_local_data();
    return data;
}