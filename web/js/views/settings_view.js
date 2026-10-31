import {
    get_user_settings,
    get_meta,
    count_dirty_rows
} from "../models/localdb.js";
import { get_last_sync_error } from "../controllers/sync_controller.js";
export async function render_settings_view() {
    const limit_input = document.getElementById("setting-daily-limit");
    const settings = await get_user_settings();
    if (limit_input) {
        limit_input.value = settings.daily_new_limit ?? 10;
    }
    await render_account_section();
}
export async function render_account_section() {
    const badge = document.getElementById("account-status-badge");
    const text = document.getElementById("account-status-text");
    if (!badge || !text) return;
    const dropdown_user = document.getElementById("dropdown-username");
    const dropdown_email = document.getElementById("dropdown-email");
    const s_badge = document.getElementById("settings-account-badge");
    const s_desc = document.getElementById("settings-account-desc");
    const s_info = document.getElementById("settings-account-info");
    const s_user = document.getElementById("settings-info-username");
    const s_email = document.getElementById("settings-info-email");
    const s_email_badge = document.getElementById("settings-info-email-badge");
    const mode = await get_meta("mode");
    const username = await get_meta("username");
    const email = await get_meta("email");
    const email_verified = (await get_meta("email_verified")) || 0;
    const toggle = (selector, visible) => {
        document.querySelectorAll(selector).forEach((b) => (b.style.display = visible ? "inline-block" : "none"));
    };
    const set_badge = (el, label, cls) => {
        if (el) {
            el.textContent = label;
            el.className = cls;
        }
    };
    const is_account = mode === "account";
    let badge_text = "Local";
    let badge_cls = "badge";
    let status_desc = "Using local storage. Your cards and study progress are stored only on this browser.";
    let email_badge_info = null;
    let can_sync = false;
    let show_verify = false;
    let show_bind = false;
    let bind_label = "Add Email";
    if (is_account) {
        const user_label = username || "user";
        if (dropdown_user) dropdown_user.textContent = username || "Account";
        if (dropdown_email) {
            dropdown_email.textContent = email || "No email linked";
            dropdown_email.style.display = "block";
        }
        if (s_info) s_info.style.display = "flex";
        if (s_user) s_user.textContent = username || "User";
        if (s_email) s_email.textContent = email || "None";
        show_bind = true;
        if (!email) {
            badge_text = "Email needed";
            badge_cls = "badge badge-hidden";
            status_desc = `Logged in as ${user_label}. Please add your email to enable sync and account recovery.`;
            bind_label = "Add Email";
        } else if (!email_verified) {
            badge_text = "Unverified";
            badge_cls = "badge badge-mine";
            status_desc = `Logged in as ${user_label}. Please verify your email (${email}) to enable sync.`;
            email_badge_info = { text: "Unverified", cls: "badge badge-mine" };
            show_verify = true;
            bind_label = "Update Email";
        } else {
            can_sync = true;
            bind_label = "Update Email";
            email_badge_info = { text: "Verified", cls: "badge badge-official" };
            if (!navigator.onLine) {
                badge_text = "Offline";
                badge_cls = "badge";
                status_desc = `Logged in as ${user_label}. You are currently offline.`;
            } else {
                const last_err = get_last_sync_error();
                const dirty_count = await count_dirty_rows();
                if (last_err) {
                    badge_text = "Sync failed";
                    badge_cls = "badge badge-hidden";
                    status_desc = `Logged in as ${user_label}. Sync failed (${last_err}).`;
                } else if (dirty_count > 0) {
                    badge_text = `${dirty_count} unsynced`;
                    badge_cls = "badge badge-mine";
                    status_desc = `Logged in as ${user_label}. ${dirty_count} local change(s) pending sync.`;
                } else {
                    badge_text = "Synced";
                    badge_cls = "badge badge-official";
                    status_desc = `Logged in as ${user_label}. Syncing enabled across your devices.`;
                }
            }
        }
    } else {
        if (dropdown_user) dropdown_user.textContent = "Local Mode";
        if (dropdown_email) {
            dropdown_email.textContent = "";
            dropdown_email.style.display = "none";
        }
        if (s_info) s_info.style.display = "none";
    }
    set_badge(badge, badge_text, badge_cls);
    set_badge(s_badge, badge_text, badge_cls);
    text.textContent = status_desc;
    if (s_desc) s_desc.textContent = status_desc;
    if (s_email_badge) {
        if (email_badge_info) {
            set_badge(s_email_badge, email_badge_info.text, email_badge_info.cls);
            s_email_badge.style.display = "inline-block";
        } else {
            s_email_badge.style.display = "none";
        }
    }
    toggle('[data-account-action="login"], [data-account-action="register"]', !is_account);
    toggle('[data-account-action="manage"], [data-account-action="logout"], [data-account-action="change-username"], [data-account-action="change-password"], [data-account-action="delete-account"]', is_account);
    toggle('[data-account-action="sync"]', is_account && can_sync);
    toggle('[data-account-action="verify-email"]', is_account && show_verify);
    document.querySelectorAll('[data-account-action="bind-email"]').forEach((b) => {
        b.style.display = is_account && show_bind ? "inline-block" : "none";
        b.textContent = bind_label;
    });
}