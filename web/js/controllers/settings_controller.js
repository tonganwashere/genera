import { save_user_settings } from "../models/localdb.js";
import { render_settings_view } from "../views/settings_view.js";
import { show_toast } from "../views/toast.js";
let on_change_callback = null;
export function init_settings_controller(on_change) {
    on_change_callback = on_change;
    setup_settings_listeners();
    setup_legal_dialogs();
    render_settings_view();
}
export function open_privacy_modal() {
    const modal = document.getElementById("privacy-modal");
    if (modal && typeof modal.showModal === "function") {
        modal.showModal();
    }
}
export function open_terms_modal() {
    const modal = document.getElementById("terms-modal");
    if (modal && typeof modal.showModal === "function") {
        modal.showModal();
    }
}
function setup_legal_dialogs() {
    const privacy_modal = document.getElementById("privacy-modal");
    const terms_modal = document.getElementById("terms-modal");
    const btn_privacy = document.getElementById("btn-open-privacy");
    const btn_terms = document.getElementById("btn-open-terms");
    const privacy_close_icon = document.getElementById("privacy-modal-close-icon");
    const privacy_close_btn = document.getElementById("privacy-modal-close-btn");
    const terms_close_icon = document.getElementById("terms-modal-close-icon");
    const terms_close_btn = document.getElementById("terms-modal-close-btn");
    if (btn_privacy && privacy_modal) {
        btn_privacy.addEventListener("click", () => open_privacy_modal());
    }
    if (privacy_close_icon && privacy_modal) {
        privacy_close_icon.addEventListener("click", () => privacy_modal.close());
    }
    if (privacy_close_btn && privacy_modal) {
        privacy_close_btn.addEventListener("click", () => privacy_modal.close());
    }
    if (btn_terms && terms_modal) {
        btn_terms.addEventListener("click", () => open_terms_modal());
    }
    if (terms_close_icon && terms_modal) {
        terms_close_icon.addEventListener("click", () => terms_modal.close());
    }
    if (terms_close_btn && terms_modal) {
        terms_close_btn.addEventListener("click", () => terms_modal.close());
    }
    [privacy_modal, terms_modal].forEach((m) => {
        if (!m) return;
        m.addEventListener("click", (e) => {
            const rect = m.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
                m.close();
            }
        });
    });
}
function setup_settings_listeners() {
    const form = document.getElementById("settings-form");
    const saved_msg = document.getElementById("settings-saved-msg");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const err_msg = document.getElementById("settings-error-msg");
            if (err_msg) {
                err_msg.style.display = "none";
                err_msg.textContent = "";
            }
            const limit_input = document.getElementById("setting-daily-limit");
            const raw_limit = parseInt(limit_input.value, 10);
            if (isNaN(raw_limit) || raw_limit < 0 || raw_limit > 100) {
                const msg = "Daily new cards limit must be an integer between 0 and 100.";
                if (err_msg) {
                    err_msg.textContent = msg;
                    err_msg.style.display = "block";
                }
                show_toast(msg, "error");
                return;
            }
            const payload = {
                daily_new_limit: raw_limit
            };
            try {
                await save_user_settings(payload);
                if (saved_msg) {
                    saved_msg.style.display = "inline-block";
                    setTimeout(() => {
                        saved_msg.style.display = "none";
                    }, 2000);
                }
                show_toast("Settings saved successfully.", "success");
                if (on_change_callback) {
                    on_change_callback();
                }
            } catch (err) {
                const msg = "Failed to save settings: " + err.message;
                if (err_msg) {
                    err_msg.textContent = msg;
                    err_msg.style.display = "block";
                }
                show_toast(msg, "error");
            }
        });
    }
}