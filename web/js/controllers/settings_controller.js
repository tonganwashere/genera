import { save_user_settings } from "../models/localdb.js";
import { render_settings_view } from "../views/settings_view.js";
import { show_toast } from "../views/toast.js";
let on_change_callback = null;
export function init_settings_controller(on_change) {
    on_change_callback = on_change;
    setup_settings_listeners();
    render_settings_view();
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