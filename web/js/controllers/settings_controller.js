import {
    get_user_settings,
    save_user_settings,
    get_all_categories,
    get_meta,
    count_dirty_rows
} from "../models/localdb.js";
import {
    perform_account_login,
    perform_account_logout,
    change_account_password,
    verify_account_email,
    resend_account_verification,
    bind_account_email,
    delete_user_account,
    request_password_reset_otp,
    reset_password_with_otp,
    sync_now,
    get_last_sync_error
} from "./sync_controller.js";
import {
    render_settings_view,
    render_account_section
} from "../views/settings_view.js";

let on_change_callback = null;
let current_auth_mode = "login";

export function init_settings_view(on_change) {
    on_change_callback = on_change;
    setup_settings_listeners();
    setup_account_listeners();
    setup_account_dropdown();
    render_settings_view();
}

function setup_settings_listeners() {
    const form = document.getElementById("settings-form");
    const select_all_btn = document.getElementById("btn-select-all-categories");
    const deselect_all_btn = document.getElementById("btn-deselect-all-categories");
    const saved_msg = document.getElementById("settings-saved-msg");

    if (select_all_btn) {
        select_all_btn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll(".setting-category-cb");
            checkboxes.forEach((cb) => (cb.checked = true));
        });
    }

    if (deselect_all_btn) {
        deselect_all_btn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll(".setting-category-cb");
            checkboxes.forEach((cb) => (cb.checked = false));
        });
    }

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const limit_input = document.getElementById("setting-daily-limit");
            const raw_limit = parseInt(limit_input.value, 10);
            if (isNaN(raw_limit) || raw_limit < 0 || raw_limit > 100) {
                alert("Daily new official cards limit must be an integer between 0 and 100.");
                return;
            }

            const checkboxes = document.querySelectorAll(".setting-category-cb");
            const checked_cats = [];
            checkboxes.forEach((cb) => {
                if (cb.checked) {
                    checked_cats.push(cb.value);
                }
            });

            if (checked_cats.length === 0) {
                alert("Please enable at least one category.");
                return;
            }

            const total_cats = checkboxes.length;
            const enabled_categories = checked_cats.length === total_cats ? [] : checked_cats;

            try {
                await save_user_settings({
                    daily_new_limit: raw_limit,
                    enabled_categories: enabled_categories
                });

                if (saved_msg) {
                    saved_msg.style.display = "inline-block";
                    setTimeout(() => {
                        saved_msg.style.display = "none";
                    }, 2000);
                }

                if (on_change_callback) {
                    on_change_callback();
                }
            } catch (err) {
                alert("Failed to save settings: " + err.message);
            }
        });
    }
}

function setup_account_listeners() {
    const auth_modal = document.getElementById("auth-modal");
    const auth_form = document.getElementById("auth-form");
    const auth_title = document.getElementById("auth-modal-title");
    const auth_error = document.getElementById("auth-error-msg");
    const auth_success = document.getElementById("auth-success-msg");
    const auth_user_group = document.getElementById("auth-username-group");
    const auth_user_input = document.getElementById("auth-username-input");
    const auth_user_label = document.getElementById("auth-username-label");
    const auth_email_group = document.getElementById("auth-email-group");
    const auth_email_input = document.getElementById("auth-email-input");
    const auth_pass_group = document.getElementById("auth-password-group");
    const auth_pass_input = document.getElementById("auth-password-input");
    const auth_confirm_group = document.getElementById("auth-confirm-password-group");
    const auth_confirm_input = document.getElementById("auth-confirm-password-input");
    const auth_otp_group = document.getElementById("auth-otp-group");
    const auth_otp_input = document.getElementById("auth-otp-input");
    const auth_new_pass_group = document.getElementById("auth-new-password-group");
    const auth_new_pass_input = document.getElementById("auth-new-password-input");
    const auth_toggle_btn = document.getElementById("auth-toggle-mode-btn");
    const auth_forgot_btn = document.getElementById("auth-forgot-btn");
    const auth_cancel_btn = document.getElementById("auth-cancel-btn");
    const auth_submit_btn = document.getElementById("auth-submit-btn");

    const open_login_btn = document.getElementById("btn-open-login");
    const open_register_btn = document.getElementById("btn-open-register");
    const sync_btn = document.getElementById("btn-account-sync");
    const logout_btn = document.getElementById("btn-account-logout");

    const s_login_btn = document.getElementById("settings-btn-login");
    const s_register_btn = document.getElementById("settings-btn-register");
    const s_verify_btn = document.getElementById("settings-btn-verify-email");
    const s_bind_btn = document.getElementById("settings-btn-bind-email");
    const s_change_pass_btn = document.getElementById("settings-btn-change-password");
    const s_delete_acc_btn = document.getElementById("settings-btn-delete-account");
    const s_sync_btn = document.getElementById("settings-btn-sync");
    const s_logout_btn = document.getElementById("settings-btn-logout");

    const change_pass_modal = document.getElementById("change-password-modal");
    const change_pass_form = document.getElementById("change-password-form");
    const change_pass_error = document.getElementById("change-pass-error-msg");
    const change_pass_success = document.getElementById("change-pass-success-msg");
    const change_pass_current = document.getElementById("change-pass-current");
    const change_pass_new = document.getElementById("change-pass-new");
    const change_pass_confirm = document.getElementById("change-pass-confirm");
    const open_change_pass_btn = document.getElementById("btn-open-change-password");
    const change_pass_cancel_btn = document.getElementById("change-pass-cancel-btn");
    const change_pass_submit_btn = document.getElementById("change-pass-submit-btn");

    const open_verify_btn = document.getElementById("btn-open-verify-email");
    const verify_modal = document.getElementById("verify-email-modal");
    const verify_form = document.getElementById("verify-email-form");
    const verify_otp_input = document.getElementById("verify-email-otp");
    const verify_resend_btn = document.getElementById("verify-email-resend-btn");
    const verify_change_btn = document.getElementById("verify-email-change-btn");
    const verify_cancel_btn = document.getElementById("verify-email-cancel-btn");
    const verify_error = document.getElementById("verify-email-error-msg");
    const verify_success = document.getElementById("verify-email-success-msg");
    const verify_email_target = document.getElementById("verify-email-target");

    const open_bind_btn = document.getElementById("btn-open-bind-email");
    const bind_modal = document.getElementById("bind-email-modal");
    const bind_form = document.getElementById("bind-email-form");
    const bind_title = document.getElementById("bind-email-title");
    const bind_input = document.getElementById("bind-email-input");
    const bind_pass_input = document.getElementById("bind-email-password");
    const bind_cancel_btn = document.getElementById("bind-email-cancel-btn");
    const bind_submit_btn = document.getElementById("bind-email-submit-btn");
    const bind_error = document.getElementById("bind-email-error-msg");

    const open_delete_btn = document.getElementById("btn-open-delete-account");
    const delete_modal = document.getElementById("delete-account-modal");
    const delete_form = document.getElementById("delete-account-form");
    const delete_pass_input = document.getElementById("delete-account-password");
    const delete_cancel_btn = document.getElementById("delete-account-cancel-btn");
    const delete_submit_btn = document.getElementById("delete-account-submit-btn");
    const delete_error = document.getElementById("delete-account-error-msg");

    document.querySelectorAll(".btn-toggle-password").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target_id = btn.getAttribute("data-target");
            if (!target_id) return;
            const input = document.getElementById(target_id);
            if (!input) return;
            input.type = input.type === "password" ? "text" : "password";
        });
    });

    let resend_cooldown_timer = null;
    function start_resend_cooldown(seconds = 60) {
        if (!verify_resend_btn) return;
        if (resend_cooldown_timer) clearInterval(resend_cooldown_timer);
        verify_resend_btn.disabled = true;
        let remaining = seconds;
        verify_resend_btn.textContent = `Resend Code (${remaining}s)`;
        resend_cooldown_timer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(resend_cooldown_timer);
                resend_cooldown_timer = null;
                verify_resend_btn.disabled = false;
                verify_resend_btn.textContent = "Resend Code";
            } else {
                verify_resend_btn.textContent = `Resend Code (${remaining}s)`;
            }
        }, 1000);
    }

    async function open_verify_modal() {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");
        if (verify_error) {
            verify_error.style.display = "none";
            verify_error.textContent = "";
        }
        if (verify_success) {
            verify_success.style.display = "none";
            verify_success.textContent = "";
        }
        if (verify_otp_input) verify_otp_input.value = "";
        const email = await get_meta("email");
        if (verify_email_target) verify_email_target.textContent = email || "your Gmail address";
        if (verify_modal) verify_modal.showModal();
    }

    async function open_bind_modal() {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");
        if (bind_error) {
            bind_error.style.display = "none";
            bind_error.textContent = "";
        }
        const curr_email = await get_meta("email");
        if (bind_title) {
            bind_title.textContent = curr_email ? "Update Gmail Address" : "Add Gmail Address";
        }
        if (bind_submit_btn) {
            bind_submit_btn.textContent = curr_email ? "Update Gmail" : "Save Gmail";
        }
        if (bind_input) bind_input.value = curr_email || "";
        if (bind_pass_input) bind_pass_input.value = "";
        if (bind_modal) bind_modal.showModal();
    }

    function open_change_pass_modal() {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");
        if (change_pass_error) {
            change_pass_error.style.display = "none";
            change_pass_error.textContent = "";
        }
        if (change_pass_success) {
            change_pass_success.style.display = "none";
            change_pass_success.textContent = "";
        }
        if (change_pass_current) change_pass_current.value = "";
        if (change_pass_new) change_pass_new.value = "";
        if (change_pass_confirm) change_pass_confirm.value = "";
        if (change_pass_modal) change_pass_modal.showModal();
    }

    function open_delete_modal() {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");
        if (delete_error) {
            delete_error.style.display = "none";
            delete_error.textContent = "";
        }
        if (delete_pass_input) delete_pass_input.value = "";
        if (delete_modal) delete_modal.showModal();
    }

    async function trigger_sync() {
        if (sync_btn) {
            sync_btn.disabled = true;
            sync_btn.textContent = "Syncing...";
        }
        if (s_sync_btn) {
            s_sync_btn.disabled = true;
            s_sync_btn.textContent = "Syncing...";
        }
        try {
            await sync_now(on_change_callback);
        } finally {
            if (sync_btn) {
                sync_btn.disabled = false;
                sync_btn.textContent = "Sync Now";
            }
            if (s_sync_btn) {
                s_sync_btn.disabled = false;
                s_sync_btn.textContent = "Sync Now";
            }
            await render_account_section();
        }
    }

    async function trigger_logout() {
        if (confirm("Log out of your account? This device will return to local mode.")) {
            await perform_account_logout(on_change_callback);
            await render_account_section();
        }
    }

    function open_modal(mode, preserve_messages = false) {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");

        current_auth_mode = mode;
        if (!preserve_messages) {
            if (auth_error) {
                auth_error.style.display = "none";
                auth_error.textContent = "";
            }
            if (auth_success) {
                auth_success.style.display = "none";
                auth_success.textContent = "";
            }
        }

        document.querySelectorAll(".password-input-wrap input").forEach((input) => {
            input.type = "password";
        });

        if (mode === "login") {
            if (auth_title) auth_title.textContent = "Log In";
            if (auth_user_group) auth_user_group.style.display = "block";
            if (auth_user_label) auth_user_label.textContent = "Username or Email";
            if (auth_user_input) {
                auth_user_input.placeholder = "Username or @gmail.com";
                auth_user_input.required = true;
                auth_user_input.value = "";
                auth_user_input.autocomplete = "username";
            }
            if (auth_email_group) auth_email_group.style.display = "none";
            if (auth_email_input) {
                auth_email_input.required = false;
                auth_email_input.readOnly = false;
            }
            if (auth_pass_group) auth_pass_group.style.display = "block";
            if (auth_pass_input) {
                auth_pass_input.required = true;
                auth_pass_input.value = "";
                auth_pass_input.autocomplete = "current-password";
            }
            if (auth_confirm_group) auth_confirm_group.style.display = "none";
            if (auth_confirm_input) {
                auth_confirm_input.required = false;
                auth_confirm_input.value = "";
            }
            if (auth_otp_group) auth_otp_group.style.display = "none";
            if (auth_otp_input) {
                auth_otp_input.required = false;
                auth_otp_input.value = "";
            }
            if (auth_new_pass_group) auth_new_pass_group.style.display = "none";
            if (auth_new_pass_input) {
                auth_new_pass_input.required = false;
                auth_new_pass_input.value = "";
            }
            if (auth_toggle_btn) {
                auth_toggle_btn.textContent = "Need an account? Register";
                auth_toggle_btn.style.display = "block";
            }
            if (auth_forgot_btn) auth_forgot_btn.style.display = "block";
            if (auth_submit_btn) auth_submit_btn.textContent = "Log In";
        } else if (mode === "register") {
            if (auth_title) auth_title.textContent = "Create Account";
            if (auth_user_group) auth_user_group.style.display = "block";
            if (auth_user_label) auth_user_label.textContent = "Username";
            if (auth_user_input) {
                auth_user_input.placeholder = "e.g. alex_trivia";
                auth_user_input.required = true;
                auth_user_input.value = "";
                auth_user_input.autocomplete = "username";
            }
            if (auth_email_group) auth_email_group.style.display = "block";
            if (auth_email_input) {
                auth_email_input.required = true;
                auth_email_input.readOnly = false;
                auth_email_input.value = "";
                auth_email_input.autocomplete = "email";
            }
            if (auth_pass_group) auth_pass_group.style.display = "block";
            if (auth_pass_input) {
                auth_pass_input.required = true;
                auth_pass_input.value = "";
                auth_pass_input.autocomplete = "new-password";
            }
            if (auth_confirm_group) auth_confirm_group.style.display = "block";
            if (auth_confirm_input) {
                auth_confirm_input.required = true;
                auth_confirm_input.value = "";
                auth_confirm_input.autocomplete = "new-password";
            }
            if (auth_otp_group) auth_otp_group.style.display = "none";
            if (auth_otp_input) {
                auth_otp_input.required = false;
                auth_otp_input.value = "";
            }
            if (auth_new_pass_group) auth_new_pass_group.style.display = "none";
            if (auth_new_pass_input) {
                auth_new_pass_input.required = false;
                auth_new_pass_input.value = "";
            }
            if (auth_toggle_btn) {
                auth_toggle_btn.textContent = "Already have an account? Log In";
                auth_toggle_btn.style.display = "block";
            }
            if (auth_forgot_btn) auth_forgot_btn.style.display = "none";
            if (auth_submit_btn) auth_submit_btn.textContent = "Register";
        } else if (mode === "forgot_request") {
            if (auth_title) auth_title.textContent = "Forgot Password";
            if (auth_user_group) auth_user_group.style.display = "none";
            if (auth_user_input) auth_user_input.required = false;
            if (auth_email_group) auth_email_group.style.display = "block";
            if (auth_email_input) {
                auth_email_input.required = true;
                auth_email_input.readOnly = false;
                auth_email_input.value = "";
                auth_email_input.autocomplete = "email";
            }
            if (auth_pass_group) auth_pass_group.style.display = "none";
            if (auth_pass_input) auth_pass_input.required = false;
            if (auth_confirm_group) auth_confirm_group.style.display = "none";
            if (auth_confirm_input) {
                auth_confirm_input.required = false;
                auth_confirm_input.value = "";
            }
            if (auth_otp_group) auth_otp_group.style.display = "none";
            if (auth_otp_input) auth_otp_input.required = false;
            if (auth_new_pass_group) auth_new_pass_group.style.display = "none";
            if (auth_new_pass_input) auth_new_pass_input.required = false;
            if (auth_toggle_btn) {
                auth_toggle_btn.textContent = "Back to Log In";
                auth_toggle_btn.style.display = "block";
            }
            if (auth_forgot_btn) auth_forgot_btn.style.display = "none";
            if (auth_submit_btn) auth_submit_btn.textContent = "Send Reset Code";
        } else if (mode === "forgot_verify") {
            if (auth_title) auth_title.textContent = "Reset Password";
            if (auth_user_group) auth_user_group.style.display = "none";
            if (auth_user_input) auth_user_input.required = false;
            if (auth_email_group) auth_email_group.style.display = "block";
            if (auth_email_input) {
                auth_email_input.required = true;
                auth_email_input.readOnly = true;
            }
            if (auth_pass_group) auth_pass_group.style.display = "none";
            if (auth_pass_input) auth_pass_input.required = false;
            if (auth_otp_group) auth_otp_group.style.display = "block";
            if (auth_otp_input) {
                auth_otp_input.required = true;
                auth_otp_input.value = "";
            }
            if (auth_new_pass_group) auth_new_pass_group.style.display = "block";
            if (auth_new_pass_input) {
                auth_new_pass_input.required = true;
                auth_new_pass_input.value = "";
                auth_new_pass_input.autocomplete = "new-password";
            }
            if (auth_confirm_group) auth_confirm_group.style.display = "block";
            if (auth_confirm_input) {
                auth_confirm_input.required = true;
                auth_confirm_input.value = "";
                auth_confirm_input.autocomplete = "new-password";
            }
            if (auth_toggle_btn) {
                auth_toggle_btn.textContent = "Back to Log In";
                auth_toggle_btn.style.display = "block";
            }
            if (auth_forgot_btn) auth_forgot_btn.style.display = "none";
            if (auth_submit_btn) auth_submit_btn.textContent = "Reset Password";
        }

        if (auth_modal) auth_modal.showModal();
    }

    if (open_login_btn) {
        open_login_btn.addEventListener("click", () => open_modal("login"));
    }
    if (s_login_btn) {
        s_login_btn.addEventListener("click", () => open_modal("login"));
    }

    if (open_register_btn) {
        open_register_btn.addEventListener("click", () => open_modal("register"));
    }
    if (s_register_btn) {
        s_register_btn.addEventListener("click", () => open_modal("register"));
    }

    if (auth_toggle_btn) {
        auth_toggle_btn.addEventListener("click", () => {
            if (current_auth_mode === "login") {
                open_modal("register");
            } else {
                open_modal("login");
            }
        });
    }

    if (auth_forgot_btn) {
        auth_forgot_btn.addEventListener("click", () => {
            open_modal("forgot_request");
        });
    }

    if (auth_cancel_btn && auth_modal) {
        auth_cancel_btn.addEventListener("click", () => {
            auth_modal.close();
        });
    }

    if (sync_btn) {
        sync_btn.addEventListener("click", trigger_sync);
    }
    if (s_sync_btn) {
        s_sync_btn.addEventListener("click", trigger_sync);
    }

    if (logout_btn) {
        logout_btn.addEventListener("click", trigger_logout);
    }
    if (s_logout_btn) {
        s_logout_btn.addEventListener("click", trigger_logout);
    }

    if (open_change_pass_btn && change_pass_modal) {
        open_change_pass_btn.addEventListener("click", open_change_pass_modal);
    }
    if (s_change_pass_btn && change_pass_modal) {
        s_change_pass_btn.addEventListener("click", open_change_pass_modal);
    }

    if (change_pass_cancel_btn && change_pass_modal) {
        change_pass_cancel_btn.addEventListener("click", () => {
            change_pass_modal.close();
        });
    }

    if (change_pass_form) {
        change_pass_form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (change_pass_error) {
                change_pass_error.style.display = "none";
                change_pass_error.textContent = "";
            }
            if (change_pass_success) {
                change_pass_success.style.display = "none";
                change_pass_success.textContent = "";
            }

            const current_password = change_pass_current.value;
            const new_password = change_pass_new.value;
            const confirm_password = change_pass_confirm.value;

            if (new_password !== confirm_password) {
                if (change_pass_error) {
                    change_pass_error.textContent = "New passwords do not match.";
                    change_pass_error.style.display = "block";
                }
                return;
            }

            if (change_pass_submit_btn) {
                change_pass_submit_btn.disabled = true;
                change_pass_submit_btn.textContent = "Updating...";
            }

            try {
                const res = await change_account_password({ current_password, new_password });
                if (change_pass_success) {
                    change_pass_success.textContent = res.message || "Password updated successfully.";
                    change_pass_success.style.display = "block";
                }
                setTimeout(() => {
                    if (change_pass_modal) change_pass_modal.close();
                }, 1200);
            } catch (err) {
                if (change_pass_error) {
                    change_pass_error.textContent = err.message;
                    change_pass_error.style.display = "block";
                }
            } finally {
                if (change_pass_submit_btn) {
                    change_pass_submit_btn.disabled = false;
                    change_pass_submit_btn.textContent = "Update Password";
                }
            }
        });
    }

    if (auth_form) {
        auth_form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (auth_error) {
                auth_error.style.display = "none";
                auth_error.textContent = "";
            }

            if (current_auth_mode === "register") {
                if (auth_confirm_input && auth_pass_input.value !== auth_confirm_input.value) {
                    if (auth_error) {
                        auth_error.textContent = "Passwords do not match.";
                        auth_error.style.display = "block";
                    }
                    return;
                }
            } else if (current_auth_mode === "forgot_verify") {
                if (auth_confirm_input && auth_new_pass_input.value !== auth_confirm_input.value) {
                    if (auth_error) {
                        auth_error.textContent = "Passwords do not match.";
                        auth_error.style.display = "block";
                    }
                    return;
                }
            }

            const original_text = auth_submit_btn ? auth_submit_btn.textContent : "";
            if (auth_submit_btn) {
                auth_submit_btn.disabled = true;
                auth_submit_btn.textContent = "Connecting...";
            }

            try {
                if (current_auth_mode === "login") {
                    await perform_account_login({
                        username: auth_user_input.value.trim(),
                        password: auth_pass_input.value,
                        is_register: false,
                        on_update: on_change_callback
                    });
                    if (auth_modal) auth_modal.close();
                    await render_account_section();
                    if (on_change_callback) {
                        await on_change_callback();
                    }
                } else if (current_auth_mode === "register") {
                    await perform_account_login({
                        username: auth_user_input.value.trim(),
                        email: auth_email_input.value.trim(),
                        password: auth_pass_input.value,
                        is_register: true,
                        on_update: on_change_callback
                    });
                    if (auth_modal) auth_modal.close();
                    await render_account_section();
                    if (on_change_callback) {
                        await on_change_callback();
                    }
                    await open_verify_modal();
                } else if (current_auth_mode === "forgot_request") {
                    const email = auth_email_input.value.trim();
                    const res = await request_password_reset_otp(email);
                    open_modal("forgot_verify", true);
                    if (auth_email_input) auth_email_input.value = email;
                    if (auth_success) {
                        auth_success.textContent = res.message || "Reset code sent! Enter the 6-digit code below.";
                        auth_success.style.display = "block";
                    }
                } else if (current_auth_mode === "forgot_verify") {
                    const res = await reset_password_with_otp({
                        email: auth_email_input.value.trim(),
                        otp: auth_otp_input.value.trim(),
                        new_password: auth_new_pass_input.value
                    });
                    open_modal("login", true);
                    if (auth_success) {
                        auth_success.textContent = res.message || "Password reset successfully. You can now log in.";
                        auth_success.style.display = "block";
                    }
                }
            } catch (err) {
                if (auth_error) {
                    auth_error.textContent = err.message;
                    auth_error.style.display = "block";
                }
            } finally {
                if (auth_submit_btn) {
                    auth_submit_btn.disabled = false;
                    if (current_auth_mode === "login") auth_submit_btn.textContent = "Log In";
                    else if (current_auth_mode === "register") auth_submit_btn.textContent = "Register";
                    else if (current_auth_mode === "forgot_request") auth_submit_btn.textContent = "Send Reset Code";
                    else if (current_auth_mode === "forgot_verify") auth_submit_btn.textContent = "Reset Password";
                    else auth_submit_btn.textContent = original_text;
                }
            }
        });
    }

    if (open_verify_btn) {
        open_verify_btn.addEventListener("click", open_verify_modal);
    }
    if (s_verify_btn) {
        s_verify_btn.addEventListener("click", open_verify_modal);
    }

    if (verify_cancel_btn && verify_modal) {
        verify_cancel_btn.addEventListener("click", () => {
            verify_modal.close();
        });
    }

    if (verify_change_btn) {
        verify_change_btn.addEventListener("click", async () => {
            if (verify_modal) verify_modal.close();
            await open_bind_modal();
        });
    }

    if (verify_resend_btn) {
        verify_resend_btn.addEventListener("click", async () => {
            if (verify_error) {
                verify_error.style.display = "none";
                verify_error.textContent = "";
            }
            if (verify_success) {
                verify_success.style.display = "none";
                verify_success.textContent = "";
            }
            try {
                const res = await resend_account_verification();
                start_resend_cooldown(60);
                if (verify_success) {
                    verify_success.textContent = res.message || "Verification code sent!";
                    verify_success.style.display = "block";
                }
            } catch (err) {
                if (verify_error) {
                    verify_error.textContent = err.message;
                    verify_error.style.display = "block";
                }
            }
        });
    }

    if (verify_form) {
        verify_form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (verify_error) {
                verify_error.style.display = "none";
                verify_error.textContent = "";
            }
            if (verify_success) {
                verify_success.style.display = "none";
                verify_success.textContent = "";
            }
            const otp = verify_otp_input.value.trim();
            const submit_btn = document.getElementById("verify-email-submit-btn");
            if (submit_btn) {
                submit_btn.disabled = true;
                submit_btn.textContent = "Verifying...";
            }
            try {
                const res = await verify_account_email(otp);
                if (verify_success) {
                    verify_success.textContent = res.message || "Email verified successfully!";
                    verify_success.style.display = "block";
                }
                await render_account_section();
                if (on_change_callback) {
                    await on_change_callback();
                }
                setTimeout(() => {
                    if (verify_modal) verify_modal.close();
                }, 1200);
            } catch (err) {
                if (verify_error) {
                    verify_error.textContent = err.message;
                    verify_error.style.display = "block";
                }
            } finally {
                if (submit_btn) {
                    submit_btn.disabled = false;
                    submit_btn.textContent = "Verify Email";
                }
            }
        });
    }


    if (open_bind_btn) {
        open_bind_btn.addEventListener("click", open_bind_modal);
    }
    if (s_bind_btn) {
        s_bind_btn.addEventListener("click", open_bind_modal);
    }

    if (bind_cancel_btn && bind_modal) {
        bind_cancel_btn.addEventListener("click", () => {
            bind_modal.close();
        });
    }

    if (bind_form) {
        bind_form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (bind_error) {
                bind_error.style.display = "none";
                bind_error.textContent = "";
            }
            const email = bind_input.value.trim();
            const password = bind_pass_input ? bind_pass_input.value : "";
            const submit_btn = document.getElementById("bind-email-submit-btn");
            if (submit_btn) {
                submit_btn.disabled = true;
                submit_btn.textContent = "Linking...";
            }
            try {
                await bind_account_email({ email, password });
                if (bind_modal) bind_modal.close();
                await render_account_section();
                await open_verify_modal();
                const v_success = document.getElementById("verify-email-success-msg");
                if (v_success) {
                    v_success.textContent = "Code sent! Check your inbox.";
                    v_success.style.display = "block";
                }
            } catch (err) {
                if (bind_error) {
                    bind_error.textContent = err.message;
                    bind_error.style.display = "block";
                }
            } finally {
                if (submit_btn) {
                    submit_btn.disabled = false;
                    const curr_email = await get_meta("email");
                    submit_btn.textContent = curr_email ? "Update Gmail" : "Save Gmail";
                }
            }
        });
    }

    if (open_delete_btn) {
        open_delete_btn.addEventListener("click", open_delete_modal);
    }
    if (s_delete_acc_btn) {
        s_delete_acc_btn.addEventListener("click", open_delete_modal);
    }

    if (delete_cancel_btn && delete_modal) {
        delete_cancel_btn.addEventListener("click", () => {
            delete_modal.close();
        });
    }

    if (delete_form) {
        delete_form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (delete_error) {
                delete_error.style.display = "none";
                delete_error.textContent = "";
            }
            const password = delete_pass_input.value;
            const submit_btn = document.getElementById("delete-account-submit-btn");
            if (submit_btn) {
                submit_btn.disabled = true;
                submit_btn.textContent = "Deleting...";
            }
            try {
                await delete_user_account(password);
                if (delete_modal) delete_modal.close();
                await render_account_section();
                if (on_change_callback) {
                    await on_change_callback();
                }
            } catch (err) {
                if (delete_error) {
                    delete_error.textContent = err.message;
                    delete_error.style.display = "block";
                }
            } finally {
                if (submit_btn) {
                    submit_btn.disabled = false;
                    submit_btn.textContent = "Permanently Delete";
                }
            }
        });
    }
}

export function setup_account_dropdown() {
    const container = document.getElementById("account-menu-container");
    const btn = document.getElementById("sync-status");
    const dropdown = document.getElementById("account-dropdown");
    if (!container || !btn || !dropdown) return;

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const is_open = container.classList.toggle("open");
        btn.setAttribute("aria-expanded", is_open ? "true" : "false");
    });

    const close_dropdown = () => {
        container.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
    };

    document.addEventListener("click", (e) => {
        if (!container.contains(e.target)) {
            close_dropdown();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && container.classList.contains("open")) {
            close_dropdown();
            btn.focus();
        }
    });

    const action_btns = dropdown.querySelectorAll("button");
    action_btns.forEach((b) => {
        b.addEventListener("click", () => {
            close_dropdown();
        });
    });
}