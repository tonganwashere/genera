import { save_user_settings } from "../models/localdb.js";
import { render_settings_view } from "../views/settings_view.js";

let on_change_callback = null;

export function init_settings_controller(on_change) {
    on_change_callback = on_change;
    setup_settings_listeners();
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