import { get_meta } from "../models/localdb.js";
import {
    api_request,
    perform_account_login,
    perform_account_logout,
    verify_account_email,
    bind_account_email,
    update_user_username,
    delete_user_account
} from "../models/auth.js";
import { sync_now, update_sync_status_ui } from "./sync_controller.js";
import { render_account_section } from "../views/settings_view.js";

let on_change_callback = null;
let current_auth_mode = "login";
let resend_timer = null;

function validate_client_username(username) {
    if (!username || typeof username !== "string") {
        return "Username is required.";
    }
    const clean = username.trim();
    if (clean.length < 3 || clean.length > 32) {
        return "Username must be between 3 and 32 characters.";
    }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
        return "Username may only contain letters, digits, and underscores.";
    }
    return null;
}

function validate_client_email(email) {
    if (!email || typeof email !== "string") {
        return "Email is required.";
    }
    const clean = email.trim();
    if (!clean.includes("@")) {
        return "Email must contain an '@' symbol.";
    }
    if (clean.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
        return "Please enter a valid email address (e.g. alex@example.com).";
    }
    return null;
}

function validate_client_password(password) {
    if (!password || typeof password !== "string") {
        return "Password is required.";
    }
    if (password.length < 8 || password.length > 128) {
        return "Password must be between 8 and 128 characters.";
    }
    const has_upper = /[A-Z]/.test(password);
    const has_lower = /[a-z]/.test(password);
    const has_digit = /[0-9]/.test(password);
    if (!has_upper || !has_lower || !has_digit) {
        return "Password must contain uppercase, lowercase, and numeric characters.";
    }
    return null;
}

const AUTH_MODES = {
    login: {
        title: "Sign In",
        submit: "Sign In",
        toggle_text: "Need an account? Register",
        active_tab: "login",
        user_label: "Username or Email",
        user_placeholder: "Username or alex@example.com",
        show_segmented: true,
        show_user: true,
        show_email: false,
        show_pass: true,
        show_forgot: true,
        show_confirm: false,
        show_otp: false,
        show_new_pass: false
    },
    register: {
        title: "Create Account",
        submit: "Create Account",
        toggle_text: "Already have an account? Sign In",
        active_tab: "register",
        user_label: "Username",
        user_placeholder: "Choose a username",
        show_segmented: true,
        show_user: true,
        show_email: true,
        show_pass: true,
        show_forgot: false,
        show_confirm: true,
        show_otp: false,
        show_new_pass: false
    },
    forgot_request: {
        title: "Reset Password",
        submit: "Send Reset Code",
        toggle_text: "Back to Sign In",
        active_tab: null,
        show_segmented: false,
        show_user: false,
        show_email: true,
        show_pass: false,
        show_forgot: false,
        show_confirm: false,
        show_otp: false,
        show_new_pass: false
    },
    forgot_verify: {
        title: "Enter Reset Code",
        submit: "Reset Password",
        toggle_text: "Back to Sign In",
        active_tab: null,
        show_segmented: false,
        show_user: false,
        show_email: true,
        email_read_only: true,
        show_pass: false,
        show_forgot: false,
        show_confirm: true,
        show_otp: true,
        show_new_pass: true
    }
};

export function init_auth_controller(on_change) {
    on_change_callback = on_change;
    setup_account_listeners();
    setup_account_dropdown();
}

function setup_account_dropdown() {
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

    dropdown.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", () => {
            close_dropdown();
        });
    });
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
    const auth_segmented = document.getElementById("auth-segmented-control");
    const auth_tab_login = document.getElementById("auth-tab-login");
    const auth_tab_register = document.getElementById("auth-tab-register");

    const change_user_modal = document.getElementById("change-username-modal");
    const change_user_form = document.getElementById("change-username-form");
    const change_user_error = document.getElementById("change-username-error-msg");
    const change_user_success = document.getElementById("change-username-success-msg");
    const change_user_new = document.getElementById("change-username-new");
    const change_user_password = document.getElementById("change-username-password");
    const change_user_cancel_btn = document.getElementById("change-username-cancel-btn");
    const change_user_submit_btn = document.getElementById("change-username-submit-btn");

    const change_pass_modal = document.getElementById("change-password-modal");
    const change_pass_form = document.getElementById("change-password-form");
    const change_pass_error = document.getElementById("change-pass-error-msg");
    const change_pass_success = document.getElementById("change-pass-success-msg");
    const change_pass_current = document.getElementById("change-pass-current");
    const change_pass_new = document.getElementById("change-pass-new");
    const change_pass_confirm = document.getElementById("change-pass-confirm");
    const change_pass_cancel_btn = document.getElementById("change-pass-cancel-btn");
    const change_pass_submit_btn = document.getElementById("change-pass-submit-btn");

    const verify_modal = document.getElementById("verify-email-modal");
    const verify_form = document.getElementById("verify-email-form");
    const verify_otp_input = document.getElementById("verify-email-otp");
    const verify_resend_btn = document.getElementById("verify-email-resend-btn");
    const verify_change_btn = document.getElementById("verify-email-change-btn");
    const verify_cancel_btn = document.getElementById("verify-email-cancel-btn");
    const verify_error = document.getElementById("verify-email-error-msg");
    const verify_success = document.getElementById("verify-email-success-msg");
    const verify_email_target = document.getElementById("verify-email-target");

    const bind_modal = document.getElementById("bind-email-modal");
    const bind_form = document.getElementById("bind-email-form");
    const bind_title = document.getElementById("bind-email-title");
    const bind_input = document.getElementById("bind-email-input");
    const bind_pass_input = document.getElementById("bind-email-password");
    const bind_cancel_btn = document.getElementById("bind-email-cancel-btn");
    const bind_submit_btn = document.getElementById("bind-email-submit-btn");
    const bind_error = document.getElementById("bind-email-error-msg");

    const delete_modal = document.getElementById("delete-account-modal");
    const delete_form = document.getElementById("delete-account-form");
    const delete_pass_input = document.getElementById("delete-account-password");
    const delete_cancel_btn = document.getElementById("delete-account-cancel-btn");
    const delete_submit_btn = document.getElementById("delete-account-submit-btn");
    const delete_error = document.getElementById("delete-account-error-msg");

    document.querySelectorAll(".btn-toggle-password").forEach((btn) => {
        btn.addEventListener("click", () => {
            const wrap = btn.closest(".password-input-wrap");
            if (!wrap) return;
            const input = wrap.querySelector("input");
            if (!input) return;
            const is_pass = input.type === "password";
            input.type = is_pass ? "text" : "password";
            btn.setAttribute("aria-label", is_pass ? "Hide password" : "Show password");
        });
    });

    const close_dialog = (dialog) => {
        if (dialog) dialog.close();
    };

    document.querySelectorAll("dialog .modal-close-btn").forEach((btn) => {
        btn.addEventListener("click", () => close_dialog(btn.closest("dialog")));
    });

    [auth_cancel_btn, change_user_cancel_btn, change_pass_cancel_btn, verify_cancel_btn, bind_cancel_btn, delete_cancel_btn].forEach((btn) => {
        if (btn) btn.addEventListener("click", () => close_dialog(btn.closest("dialog")));
    });

    async function handle_form_submit({
        submit_btn,
        loading_text,
        default_text,
        error_el,
        success_el,
        action
    }) {
        if (error_el) { error_el.style.display = "none"; error_el.textContent = ""; }
        if (success_el) { success_el.style.display = "none"; success_el.textContent = ""; }
        if (submit_btn) {
            submit_btn.disabled = true;
            if (loading_text) submit_btn.textContent = loading_text;
        }
        try {
            await action();
        } catch (err) {
            if (error_el) {
                error_el.textContent = err.message;
                error_el.style.display = "block";
            }
        } finally {
            if (submit_btn) {
                submit_btn.disabled = false;
                if (default_text) {
                    submit_btn.textContent = typeof default_text === "function" ? await default_text() : default_text;
                }
            }
        }
    }

    function start_resend_cooldown(seconds) {
        if (!verify_resend_btn) return;
        if (resend_timer) clearInterval(resend_timer);
        let rem = seconds;
        verify_resend_btn.disabled = true;
        verify_resend_btn.textContent = `Resend in ${rem}s`;
        resend_timer = setInterval(() => {
            rem -= 1;
            if (rem <= 0) {
                clearInterval(resend_timer);
                resend_timer = null;
                verify_resend_btn.disabled = false;
                verify_resend_btn.textContent = "Resend Code";
            } else {
                verify_resend_btn.textContent = `Resend in ${rem}s`;
            }
        }, 1000);
    }

    async function refresh_ui() {
        if (on_change_callback) {
            await on_change_callback();
        } else {
            await update_sync_status_ui();
            await render_account_section();
        }
    }

    const handle_logout = async () => {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");
        await perform_account_logout();
        await refresh_ui();
    };

    const handle_sync = async () => {
        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");
        await sync_now(on_change_callback);
        await render_account_section();
    };

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-account-action]");
        if (!btn) return;
        const action = btn.dataset.accountAction;
        if (action === "login") open_modal("login");
        else if (action === "register") open_modal("register");
        else if (action === "sync") handle_sync();
        else if (action === "logout") handle_logout();
        else if (action === "verify-email") open_verify_modal();
        else if (action === "bind-email") open_bind_modal();
        else if (action === "change-username") open_change_user_modal();
        else if (action === "change-password") open_change_pass_modal();
        else if (action === "delete-account") open_delete_modal();
        else if (action === "manage") {
            const tab_btn = document.querySelector('.tab-btn[data-tab="settings"]');
            if (tab_btn) tab_btn.click();
            const acc_sec = document.getElementById("settings-account-section");
            if (acc_sec) acc_sec.scrollIntoView({ behavior: "smooth" });
            const container = document.getElementById("account-menu-container");
            if (container) container.classList.remove("open");
        }
    });

    function open_modal(mode, preserve_messages = false) {
        const config = AUTH_MODES[mode];
        if (!config) return;
        current_auth_mode = mode;

        const container = document.getElementById("account-menu-container");
        if (container) container.classList.remove("open");

        if (!preserve_messages) {
            if (auth_error) { auth_error.style.display = "none"; auth_error.textContent = ""; }
            if (auth_success) { auth_success.style.display = "none"; auth_success.textContent = ""; }
        }

        document.querySelectorAll(".password-input-wrap input").forEach((input) => {
            input.type = "password";
        });

        if (auth_title) auth_title.textContent = config.title;
        if (auth_submit_btn) auth_submit_btn.textContent = config.submit;
        if (auth_toggle_btn) {
            auth_toggle_btn.textContent = config.toggle_text;
            auth_toggle_btn.hidden = !config.toggle_text;
        }

        if (auth_segmented) auth_segmented.hidden = !config.show_segmented;
        if (auth_tab_login) {
            const is_login = config.active_tab === "login";
            auth_tab_login.classList.toggle("active", is_login);
            auth_tab_login.setAttribute("aria-selected", is_login ? "true" : "false");
        }
        if (auth_tab_register) {
            const is_reg = config.active_tab === "register";
            auth_tab_register.classList.toggle("active", is_reg);
            auth_tab_register.setAttribute("aria-selected", is_reg ? "true" : "false");
        }

        if (auth_user_group) auth_user_group.hidden = !config.show_user;
        if (auth_user_label && config.user_label) auth_user_label.textContent = config.user_label;
        if (auth_user_input) {
            auth_user_input.required = config.show_user;
            if (config.user_placeholder) auth_user_input.placeholder = config.user_placeholder;
            if (!preserve_messages) auth_user_input.value = "";
        }

        if (auth_email_group) auth_email_group.hidden = !config.show_email;
        if (auth_email_input) {
            auth_email_input.required = config.show_email;
            auth_email_input.readOnly = !!config.email_read_only;
            if (!preserve_messages && !config.email_read_only) auth_email_input.value = "";
        }

        if (auth_pass_group) auth_pass_group.hidden = !config.show_pass;
        if (auth_pass_input) {
            auth_pass_input.required = config.show_pass;
            if (!preserve_messages) auth_pass_input.value = "";
        }

        if (auth_forgot_btn) auth_forgot_btn.hidden = !config.show_forgot;

        if (auth_confirm_group) auth_confirm_group.hidden = !config.show_confirm;
        if (auth_confirm_input) {
            auth_confirm_input.required = config.show_confirm;
            if (!preserve_messages) auth_confirm_input.value = "";
        }

        if (auth_otp_group) auth_otp_group.hidden = !config.show_otp;
        if (auth_otp_input) {
            auth_otp_input.required = config.show_otp;
            if (!preserve_messages) auth_otp_input.value = "";
        }

        if (auth_new_pass_group) auth_new_pass_group.hidden = !config.show_new_pass;
        if (auth_new_pass_input) {
            auth_new_pass_input.required = config.show_new_pass;
            if (!preserve_messages) auth_new_pass_input.value = "";
        }

        if (auth_modal && !auth_modal.open) auth_modal.showModal();
    }

    if (auth_tab_login) auth_tab_login.addEventListener("click", () => open_modal("login"));
    if (auth_tab_register) auth_tab_register.addEventListener("click", () => open_modal("register"));

    if (auth_toggle_btn) {
        auth_toggle_btn.addEventListener("click", () => {
            open_modal(current_auth_mode === "login" ? "register" : "login");
        });
    }

    if (auth_forgot_btn) {
        auth_forgot_btn.addEventListener("click", () => open_modal("forgot_request"));
    }

    async function open_change_user_modal() {
        if (change_user_error) { change_user_error.style.display = "none"; change_user_error.textContent = ""; }
        if (change_user_success) { change_user_success.style.display = "none"; change_user_success.textContent = ""; }
        const curr_username = await get_meta("username");
        if (change_user_new) change_user_new.value = curr_username || "";
        if (change_user_password) change_user_password.value = "";
        if (change_user_modal && !change_user_modal.open) change_user_modal.showModal();
    }

    async function open_change_pass_modal() {
        if (change_pass_error) { change_pass_error.style.display = "none"; change_pass_error.textContent = ""; }
        if (change_pass_success) { change_pass_success.style.display = "none"; change_pass_success.textContent = ""; }
        if (change_pass_current) change_pass_current.value = "";
        if (change_pass_new) change_pass_new.value = "";
        if (change_pass_confirm) change_pass_confirm.value = "";
        if (change_pass_modal && !change_pass_modal.open) change_pass_modal.showModal();
    }

    async function open_verify_modal() {
        if (verify_error) { verify_error.style.display = "none"; verify_error.textContent = ""; }
        if (verify_success) { verify_success.style.display = "none"; verify_success.textContent = ""; }
        if (verify_otp_input) verify_otp_input.value = "";
        const email = await get_meta("email");
        if (verify_email_target) verify_email_target.textContent = email || "your email";
        start_resend_cooldown(60);
        if (verify_modal && !verify_modal.open) verify_modal.showModal();
    }

    async function open_bind_modal() {
        if (bind_error) { bind_error.style.display = "none"; bind_error.textContent = ""; }
        if (bind_pass_input) bind_pass_input.value = "";
        const curr_email = await get_meta("email");
        if (bind_input) bind_input.value = curr_email || "";
        if (bind_title) bind_title.textContent = curr_email ? "Update Email Address" : "Add Email Address";
        if (bind_submit_btn) bind_submit_btn.textContent = curr_email ? "Update Email" : "Save Email";
        if (bind_modal && !bind_modal.open) bind_modal.showModal();
    }

    async function open_delete_modal() {
        if (delete_error) { delete_error.style.display = "none"; delete_error.textContent = ""; }
        if (delete_pass_input) delete_pass_input.value = "";
        if (delete_modal && !delete_modal.open) delete_modal.showModal();
    }

    if (change_user_form) {
        change_user_form.addEventListener("submit", (e) => {
            e.preventDefault();
            const new_username = change_user_new.value.trim();
            const password = change_user_password.value;

            const user_err = validate_client_username(new_username);
            if (user_err) {
                if (change_user_error) {
                    change_user_error.textContent = user_err;
                    change_user_error.style.display = "block";
                }
                return;
            }

            if (!password) {
                if (change_user_error) {
                    change_user_error.textContent = "Current password is required.";
                    change_user_error.style.display = "block";
                }
                return;
            }

            handle_form_submit({
                submit_btn: change_user_submit_btn,
                loading_text: "Updating...",
                default_text: "Update Username",
                error_el: change_user_error,
                success_el: change_user_success,
                action: async () => {
                    const res = await update_user_username({ username: new_username, password });
                    if (change_user_success) {
                        change_user_success.textContent = res.message || "Username updated successfully!";
                        change_user_success.style.display = "block";
                    }
                    await refresh_ui();
                    setTimeout(() => close_dialog(change_user_modal), 1200);
                }
            });
        });
    }

    if (change_pass_form) {
        change_pass_form.addEventListener("submit", (e) => {
            e.preventDefault();
            const current_password = change_pass_current.value;
            const new_password = change_pass_new.value;
            const confirm_password = change_pass_confirm.value;

            if (!current_password) {
                if (change_pass_error) {
                    change_pass_error.textContent = "Current password is required.";
                    change_pass_error.style.display = "block";
                }
                return;
            }

            const pass_err = validate_client_password(new_password);
            if (pass_err) {
                if (change_pass_error) {
                    change_pass_error.textContent = pass_err;
                    change_pass_error.style.display = "block";
                }
                return;
            }

            if (new_password === current_password) {
                if (change_pass_error) {
                    change_pass_error.textContent = "New password cannot be the same as your current password.";
                    change_pass_error.style.display = "block";
                }
                return;
            }

            if (new_password !== confirm_password) {
                if (change_pass_error) {
                    change_pass_error.textContent = "New passwords do not match.";
                    change_pass_error.style.display = "block";
                }
                return;
            }

            handle_form_submit({
                submit_btn: change_pass_submit_btn,
                loading_text: "Updating...",
                default_text: "Update Password",
                error_el: change_pass_error,
                success_el: change_pass_success,
                action: async () => {
                    const res = await api_request("/api/change-password", {
                        body: { current_password, new_password },
                        require_csrf: true
                    });
                    if (change_pass_success) {
                        change_pass_success.textContent = res.message || "Password updated successfully!";
                        change_pass_success.style.display = "block";
                    }
                    setTimeout(() => close_dialog(change_pass_modal), 1200);
                }
            });
        });
    }

    if (auth_form) {
        auth_form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (current_auth_mode === "register") {
                const user_err = validate_client_username(auth_user_input.value);
                if (user_err) {
                    if (auth_error) { auth_error.textContent = user_err; auth_error.style.display = "block"; }
                    return;
                }
                const email_err = validate_client_email(auth_email_input.value);
                if (email_err) {
                    if (auth_error) { auth_error.textContent = email_err; auth_error.style.display = "block"; }
                    return;
                }
                const pass_err = validate_client_password(auth_pass_input.value);
                if (pass_err) {
                    if (auth_error) { auth_error.textContent = pass_err; auth_error.style.display = "block"; }
                    return;
                }
                if (auth_pass_input.value !== auth_confirm_input.value) {
                    if (auth_error) {
                        auth_error.textContent = "Passwords do not match.";
                        auth_error.style.display = "block";
                    }
                    return;
                }
            } else if (current_auth_mode === "forgot_request") {
                const email_err = validate_client_email(auth_email_input.value);
                if (email_err) {
                    if (auth_error) { auth_error.textContent = email_err; auth_error.style.display = "block"; }
                    return;
                }
            } else if (current_auth_mode === "forgot_verify") {
                const pass_err = validate_client_password(auth_new_pass_input.value);
                if (pass_err) {
                    if (auth_error) { auth_error.textContent = pass_err; auth_error.style.display = "block"; }
                    return;
                }
                if (auth_new_pass_input.value !== auth_confirm_input.value) {
                    if (auth_error) {
                        auth_error.textContent = "New passwords do not match.";
                        auth_error.style.display = "block";
                    }
                    return;
                }
            }

            handle_form_submit({
                submit_btn: auth_submit_btn,
                loading_text: "Connecting...",
                default_text: () => (AUTH_MODES[current_auth_mode] ? AUTH_MODES[current_auth_mode].submit : "Submit"),
                error_el: auth_error,
                success_el: auth_success,
                action: async () => {
                    if (current_auth_mode === "login") {
                        const user_data = await perform_account_login({
                            username: auth_user_input.value.trim(),
                            password: auth_pass_input.value,
                            is_register: false
                        });
                        close_dialog(auth_modal);
                        if (user_data.email_verified === 1) {
                            await sync_now(on_change_callback);
                        }
                        await refresh_ui();
                    } else if (current_auth_mode === "register") {
                        await perform_account_login({
                            username: auth_user_input.value.trim(),
                            email: auth_email_input.value.trim(),
                            password: auth_pass_input.value,
                            is_register: true
                        });
                        close_dialog(auth_modal);
                        await refresh_ui();
                        await open_verify_modal();
                    } else if (current_auth_mode === "forgot_request") {
                        const email = auth_email_input.value.trim();
                        const res = await api_request("/api/forgot-password/request-otp", { body: { email } });
                        open_modal("forgot_verify", true);
                        if (auth_email_input) auth_email_input.value = email;
                        if (auth_success) {
                            auth_success.textContent = res.message || "Reset code sent! Enter the 6-digit code below.";
                            auth_success.style.display = "block";
                        }
                    } else if (current_auth_mode === "forgot_verify") {
                        const res = await api_request("/api/forgot-password/reset", {
                            body: {
                                email: auth_email_input.value.trim(),
                                otp: auth_otp_input.value.trim(),
                                new_password: auth_new_pass_input.value
                            }
                        });
                        open_modal("login", true);
                        if (auth_success) {
                            auth_success.textContent = res.message || "Password reset successfully. You can now log in.";
                            auth_success.style.display = "block";
                        }
                    }
                }
            });
        });
    }

    if (verify_change_btn) {
        verify_change_btn.addEventListener("click", async () => {
            close_dialog(verify_modal);
            await open_bind_modal();
        });
    }

    if (verify_resend_btn) {
        verify_resend_btn.addEventListener("click", async () => {
            if (verify_error) { verify_error.style.display = "none"; verify_error.textContent = ""; }
            if (verify_success) { verify_success.style.display = "none"; verify_success.textContent = ""; }
            try {
                const res = await api_request("/api/resend-verification", { require_csrf: true });
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
        verify_form.addEventListener("submit", (e) => {
            e.preventDefault();
            const otp = verify_otp_input.value.trim();
            const submit_btn = document.getElementById("verify-email-submit-btn");

            handle_form_submit({
                submit_btn,
                loading_text: "Verifying...",
                default_text: "Verify Email",
                error_el: verify_error,
                success_el: verify_success,
                action: async () => {
                    const res = await verify_account_email(otp);
                    if (verify_success) {
                        verify_success.textContent = res.message || "Email verified successfully!";
                        verify_success.style.display = "block";
                    }
                    await sync_now(on_change_callback);
                    await refresh_ui();
                    setTimeout(() => close_dialog(verify_modal), 1200);
                }
            });
        });
    }

    if (bind_form) {
        bind_form.addEventListener("submit", (e) => {
            e.preventDefault();
            const email = bind_input.value.trim();
            const password = bind_pass_input ? bind_pass_input.value : "";
            const submit_btn = document.getElementById("bind-email-submit-btn");

            const email_err = validate_client_email(email);
            if (email_err) {
                if (bind_error) {
                    bind_error.textContent = email_err;
                    bind_error.style.display = "block";
                }
                return;
            }

            if (!password) {
                if (bind_error) {
                    bind_error.textContent = "Current password is required.";
                    bind_error.style.display = "block";
                }
                return;
            }

            handle_form_submit({
                submit_btn,
                loading_text: "Linking...",
                default_text: async () => {
                    const curr_email = await get_meta("email");
                    return curr_email ? "Update Email" : "Save Email";
                },
                error_el: bind_error,
                action: async () => {
                    await bind_account_email({ email, password });
                    close_dialog(bind_modal);
                    await refresh_ui();
                    await open_verify_modal();
                    const v_success = document.getElementById("verify-email-success-msg");
                    if (v_success) {
                        v_success.textContent = "Code sent! Check your inbox.";
                        v_success.style.display = "block";
                    }
                }
            });
        });
    }

    if (delete_form) {
        delete_form.addEventListener("submit", (e) => {
            e.preventDefault();
            const password = delete_pass_input.value;
            const submit_btn = document.getElementById("delete-account-submit-btn");

            handle_form_submit({
                submit_btn,
                loading_text: "Deleting...",
                default_text: "Permanently Delete",
                error_el: delete_error,
                action: async () => {
                    await delete_user_account(password);
                    close_dialog(delete_modal);
                    await refresh_ui();
                }
            });
        });
    }
}