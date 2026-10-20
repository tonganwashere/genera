import {
    get_user_settings,
    save_user_settings,
    get_all_categories,
    get_meta
} from "../models/localdb.js";

export async function render_settings_view() {
    const limit_input = document.getElementById("setting-daily-limit");
    const categories_container = document.getElementById("settings-categories-list");
    if (!limit_input || !categories_container) return;

    const settings = await get_user_settings();
    const categories = await get_all_categories();

    limit_input.value = settings.daily_new_limit ?? 10;

    categories_container.innerHTML = "";
    const enabled_set = new Set(settings.enabled_categories || []);
    const is_all_enabled = enabled_set.size === 0;

    for (const cat of categories) {
        const item_label = document.createElement("label");
        item_label.className = "settings-category-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "setting-category-cb";
        checkbox.value = cat;
        checkbox.checked = is_all_enabled || enabled_set.has(cat);

        const span = document.createElement("span");
        span.textContent = cat;

        item_label.appendChild(checkbox);
        item_label.appendChild(span);
        categories_container.appendChild(item_label);
    }

    await render_account_section();
}

export async function render_account_section() {
    const badge = document.getElementById("account-status-badge");
    const text = document.getElementById("account-status-text");
    const login_btn = document.getElementById("btn-open-login");
    const register_btn = document.getElementById("btn-open-register");
    const verify_email_btn = document.getElementById("btn-open-verify-email");
    const bind_email_btn = document.getElementById("btn-open-bind-email");
    const change_pass_btn = document.getElementById("btn-open-change-password");
    const delete_acc_btn = document.getElementById("btn-open-delete-account");
    const sync_btn = document.getElementById("btn-account-sync");
    const manage_btn = document.getElementById("btn-account-manage");
    const logout_btn = document.getElementById("btn-account-logout");
    const dropdown_user = document.getElementById("dropdown-username");
    const dropdown_email = document.getElementById("dropdown-email");

    const s_badge = document.getElementById("settings-account-badge");
    const s_desc = document.getElementById("settings-account-desc");
    const s_info = document.getElementById("settings-account-info");
    const s_user = document.getElementById("settings-info-username");
    const s_email = document.getElementById("settings-info-email");
    const s_email_badge = document.getElementById("settings-info-email-badge");
    const s_login_btn = document.getElementById("settings-btn-login");
    const s_register_btn = document.getElementById("settings-btn-register");
    const s_verify_email_btn = document.getElementById("settings-btn-verify-email");
    const s_bind_email_btn = document.getElementById("settings-btn-bind-email");
    const s_change_pass_btn = document.getElementById("settings-btn-change-password");
    const s_delete_acc_btn = document.getElementById("settings-btn-delete-account");
    const s_sync_btn = document.getElementById("settings-btn-sync");
    const s_logout_btn = document.getElementById("settings-btn-logout");

    if (!badge || !text) return;

    const mode = await get_meta("mode");
    const username = await get_meta("username");
    const email = await get_meta("email");
    const email_verified = (await get_meta("email_verified")) || 0;

    if (mode === "account") {
        if (dropdown_user) dropdown_user.textContent = username || "Account";
        if (dropdown_email) {
            dropdown_email.textContent = email || "No email linked";
            dropdown_email.style.display = "block";
        }
        if (s_info) s_info.style.display = "flex";
        if (s_user) s_user.textContent = username || "User";
        if (s_email) s_email.textContent = email || "None";

        if (!email) {
            const status_text = `Logged in as ${username || "user"}. Please add your Gmail to enable sync and account recovery.`;
            badge.textContent = "Email needed";
            badge.className = "badge badge-hidden";
            text.textContent = status_text;
            if (s_badge) {
                s_badge.textContent = "Email needed";
                s_badge.className = "badge badge-hidden";
            }
            if (s_desc) s_desc.textContent = status_text;
            if (s_email_badge) s_email_badge.style.display = "none";
            if (bind_email_btn) bind_email_btn.style.display = "inline-block";
            if (verify_email_btn) verify_email_btn.style.display = "none";
            if (sync_btn) sync_btn.style.display = "none";
            if (s_bind_email_btn) {
                s_bind_email_btn.style.display = "inline-block";
                s_bind_email_btn.textContent = "Add Gmail";
            }
            if (s_verify_email_btn) s_verify_email_btn.style.display = "none";
            if (s_sync_btn) s_sync_btn.style.display = "none";
        } else if (!email_verified) {
            const status_text = `Logged in as ${username || "user"}. Please verify your email (${email}) to enable sync.`;
            badge.textContent = "Unverified";
            badge.className = "badge badge-mine";
            text.textContent = status_text;
            if (s_badge) {
                s_badge.textContent = "Unverified";
                s_badge.className = "badge badge-mine";
            }
            if (s_desc) s_desc.textContent = status_text;
            if (s_email_badge) {
                s_email_badge.style.display = "inline-block";
                s_email_badge.textContent = "Unverified";
                s_email_badge.className = "badge badge-mine";
            }
            if (bind_email_btn) bind_email_btn.style.display = "none";
            if (verify_email_btn) verify_email_btn.style.display = "inline-block";
            if (sync_btn) sync_btn.style.display = "none";
            if (s_bind_email_btn) {
                s_bind_email_btn.style.display = "inline-block";
                s_bind_email_btn.textContent = "Update Gmail";
            }
            if (s_verify_email_btn) s_verify_email_btn.style.display = "inline-block";
            if (s_sync_btn) s_sync_btn.style.display = "none";
        } else if (!navigator.onLine) {
            const status_text = `Logged in as ${username || "user"}. You are currently offline.`;
            badge.textContent = "Offline";
            badge.className = "badge";
            text.textContent = status_text;
            if (s_badge) {
                s_badge.textContent = "Offline";
                s_badge.className = "badge";
            }
            if (s_desc) s_desc.textContent = status_text;
            if (s_email_badge) {
                s_email_badge.style.display = "inline-block";
                s_email_badge.textContent = "Verified";
                s_email_badge.className = "badge badge-official";
            }
            if (bind_email_btn) bind_email_btn.style.display = "none";
            if (verify_email_btn) verify_email_btn.style.display = "none";
            if (sync_btn) sync_btn.style.display = "inline-block";
            if (s_bind_email_btn) {
                s_bind_email_btn.style.display = "inline-block";
                s_bind_email_btn.textContent = "Update Gmail";
            }
            if (s_verify_email_btn) s_verify_email_btn.style.display = "none";
            if (s_sync_btn) s_sync_btn.style.display = "inline-block";
        } else {
            const last_err = get_last_sync_error();
            const dirty_count = await count_dirty_rows();
            let status_label = "Synced";
            let status_class = "badge badge-official";
            let status_desc = `Logged in as ${username || "user"}. Syncing enabled across your devices.`;
            if (last_err) {
                status_label = "Sync failed";
                status_class = "badge badge-hidden";
                status_desc = `Logged in as ${username || "user"}. Sync failed (${last_err}).`;
            } else if (dirty_count > 0) {
                status_label = `${dirty_count} unsynced`;
                status_class = "badge badge-mine";
                status_desc = `Logged in as ${username || "user"}. ${dirty_count} local change(s) pending sync.`;
            }
            badge.textContent = status_label;
            badge.className = status_class;
            text.textContent = status_desc;
            if (s_badge) {
                s_badge.textContent = status_label;
                s_badge.className = status_class;
            }
            if (s_desc) s_desc.textContent = status_desc;
            if (s_email_badge) {
                s_email_badge.style.display = "inline-block";
                s_email_badge.textContent = "Verified";
                s_email_badge.className = "badge badge-official";
            }
            if (bind_email_btn) bind_email_btn.style.display = "none";
            if (verify_email_btn) verify_email_btn.style.display = "none";
            if (sync_btn) sync_btn.style.display = "inline-block";
            if (s_bind_email_btn) {
                s_bind_email_btn.style.display = "inline-block";
                s_bind_email_btn.textContent = "Update Gmail";
            }
            if (s_verify_email_btn) s_verify_email_btn.style.display = "none";
            if (s_sync_btn) s_sync_btn.style.display = "inline-block";
        }

        if (login_btn) login_btn.style.display = "none";
        if (register_btn) register_btn.style.display = "none";
        if (change_pass_btn) change_pass_btn.style.display = "none";
        if (delete_acc_btn) delete_acc_btn.style.display = "none";
        if (manage_btn) manage_btn.style.display = "inline-block";
        if (logout_btn) logout_btn.style.display = "inline-block";
        if (s_login_btn) s_login_btn.style.display = "none";
        if (s_register_btn) s_register_btn.style.display = "none";
        if (s_change_pass_btn) s_change_pass_btn.style.display = "inline-block";
        if (s_delete_acc_btn) s_delete_acc_btn.style.display = "inline-block";
        if (s_logout_btn) s_logout_btn.style.display = "inline-block";
    } else {
        if (dropdown_user) dropdown_user.textContent = "Local Mode";
        if (dropdown_email) {
            dropdown_email.textContent = "";
            dropdown_email.style.display = "none";
        }
        badge.textContent = "Local";
        badge.className = "badge";
        text.textContent = "Using local storage. Your cards and study progress are stored only on this browser.";
        if (s_badge) {
            s_badge.textContent = "Local";
            s_badge.className = "badge";
        }
        if (s_desc) {
            s_desc.textContent = "Using local storage. Your cards and study progress are stored only on this browser.";
        }
        if (s_info) s_info.style.display = "none";

        if (login_btn) login_btn.style.display = "inline-block";
        if (register_btn) register_btn.style.display = "inline-block";
        if (bind_email_btn) bind_email_btn.style.display = "none";
        if (verify_email_btn) verify_email_btn.style.display = "none";
        if (change_pass_btn) change_pass_btn.style.display = "none";
        if (delete_acc_btn) delete_acc_btn.style.display = "none";
        if (manage_btn) manage_btn.style.display = "none";
        if (sync_btn) sync_btn.style.display = "none";
        if (logout_btn) logout_btn.style.display = "none";

        if (s_login_btn) s_login_btn.style.display = "inline-block";
        if (s_register_btn) s_register_btn.style.display = "inline-block";
        if (s_bind_email_btn) s_bind_email_btn.style.display = "none";
        if (s_verify_email_btn) s_verify_email_btn.style.display = "none";
        if (s_change_pass_btn) s_change_pass_btn.style.display = "none";
        if (s_delete_acc_btn) s_delete_acc_btn.style.display = "none";
        if (s_sync_btn) s_sync_btn.style.display = "none";
        if (s_logout_btn) s_logout_btn.style.display = "none";
    }
}