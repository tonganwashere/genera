import { build_session_for_mode } from "../models/session.js";
import { schedule_card } from "../models/scheduler.js";
import {
    save_progress_row,
    get_all_catalog_cards,
    get_user_settings,
    save_user_settings,
    get_today_date
} from "../models/localdb.js";
import {
    create_trivia_start_screen,
    create_trivia_active_card,
    render_trivia_actions,
    create_trivia_finished_screen
} from "../views/trivia_view.js";
import { show_toast } from "../views/toast.js";
import { show_confirm_dialog } from "../views/confirm_dialog.js";
let current_session = [];
let current_card_index = 0;
let is_flipped = false;
let session_stats = { right: 0, wrong: 0 };
let current_sub_mode = "scheduled";
let selected_categories = new Set();
let categories_explicitly_cleared = false;
let is_session_active = false;
let is_rating = false;
let on_data_change_callback = null;
let on_navigate_home_callback = null;
export function init_trivia_controller({ on_data_change, on_navigate_home } = {}) {
    on_data_change_callback = on_data_change;
    on_navigate_home_callback = on_navigate_home;
    setup_trivia_keyboard_shortcuts();
    render_trivia_view();
}
export async function render_trivia_view() {
    const container = document.getElementById("trivia-container");
    if (!container) return;
    container.innerHTML = "";
    if (!is_session_active) {
        const [catalog_cards, settings] = await Promise.all([
            get_all_catalog_cards(),
            get_user_settings()
        ]);
        const cat_set = new Set();
        for (const c of catalog_cards) {
            if (c.category) cat_set.add(c.category);
        }
        const categories = Array.from(cat_set).sort();
        if (selected_categories.size === 0 && !categories_explicitly_cleared) {
            if (Array.isArray(settings.enabled_categories) && settings.enabled_categories.length > 0) {
                selected_categories = new Set(settings.enabled_categories);
            } else {
                selected_categories = new Set(categories);
            }
        }
        const start_el = create_trivia_start_screen({
            categories,
            selected_categories,
            sub_mode: current_sub_mode,
            daily_limit: settings.daily_new_limit ?? 10,
            on_toggle_category: (cat) => {
                let next_active = false;
                if (selected_categories.size === 0 && !categories_explicitly_cleared) {
                    selected_categories = new Set(categories.filter(c => c !== cat));
                    next_active = false;
                } else if (selected_categories.has(cat)) {
                    selected_categories.delete(cat);
                    next_active = false;
                } else {
                    selected_categories.add(cat);
                    next_active = true;
                }
                categories_explicitly_cleared = (selected_categories.size === 0);
                persist_category_preferences(categories);
                return next_active;
            },
            on_select_all_categories: () => {
                selected_categories = new Set(categories);
                categories_explicitly_cleared = false;
                persist_category_preferences(categories);
            },
            on_clear_all_categories: () => {
                selected_categories = new Set();
                categories_explicitly_cleared = true;
                persist_category_preferences(categories);
            },
            on_mode_change: (mode) => {
                current_sub_mode = mode;
            },
            on_start: async (btn) => {
                if (selected_categories.size === 0) {
                    show_toast("No questions match the selected categories.", "info");
                    return;
                }
                btn.disabled = true;
                btn.textContent = "Loading questions...";
                try {
                    const chosen_cats = selected_categories.size === categories.length
                        ? null
                        : Array.from(selected_categories);
                    const session_res = await build_session_for_mode({
                        session_type: "trivia",
                        categories: chosen_cats,
                        sub_mode: current_sub_mode,
                        today: get_today_date()
                    });
                    if (!session_res.cards || session_res.cards.length === 0) {
                        const msg = current_sub_mode === "scheduled" ?
                            "No trivia cards due or available today under your daily limit. Try Freestyle mode to quiz anytime!" :
                            "No questions match the selected categories.";
                        show_toast(msg, "info");
                        btn.disabled = false;
                        btn.textContent = "Start Trivia Quiz";
                        return;
                    }
                    current_session = session_res.cards;
                    current_card_index = 0;
                    is_flipped = false;
                    session_stats = { right: 0, wrong: 0 };
                    is_session_active = true;
                    render_trivia_view();
                } catch (err) {
                    show_toast("Failed to build quiz session: " + err.message, "error");
                    btn.disabled = false;
                    btn.textContent = "Start Trivia Quiz";
                }
            }
        });
        container.appendChild(start_el);
    } else if (current_card_index >= current_session.length) {
        const finished_el = create_trivia_finished_screen({
            stats: session_stats,
            sub_mode: current_sub_mode,
            on_restart: () => {
                is_session_active = false;
                current_session = [];
                render_trivia_view();
            },
            on_home: () => {
                is_session_active = false;
                current_session = [];
                if (on_navigate_home_callback) {
                    on_navigate_home_callback();
                }
            }
        });
        container.appendChild(finished_el);
    } else {
        const card = current_session[current_card_index];
        const card_fragment = create_trivia_active_card({
            card,
            index: current_card_index,
            total: current_session.length,
            is_flipped,
            sub_mode: current_sub_mode,
            on_quit: async () => {
                const confirmed = await show_confirm_dialog({
                    title: "Quit Trivia Quiz?",
                    message: "Quit trivia quiz? Your score so far will be dismissed.",
                    confirm_text: "Quit Quiz",
                    cancel_text: "Keep Playing",
                    danger: false
                });
                if (confirmed) {
                    is_session_active = false;
                    current_session = [];
                    render_trivia_view();
                    if (on_data_change_callback) on_data_change_callback();
                }
            },
            on_flip: () => {
                toggle_flip();
            },
            on_rate: async (was_correct) => {
                await rate_card(was_correct);
            }
        });
        container.appendChild(card_fragment);
    }
}
async function persist_category_preferences(all_categories) {
    try {
        const enabled = (selected_categories.size === all_categories.length || (selected_categories.size === 0 && !categories_explicitly_cleared))
            ? []
            : Array.from(selected_categories);
        await save_user_settings({ enabled_categories: enabled });
    } catch (_) {}
}
function toggle_flip() {
    if (!is_session_active) return;
    is_flipped = !is_flipped;
    const flashcard = document.getElementById("active-trivia-card");
    if (flashcard) {
        flashcard.classList.toggle("flipped", is_flipped);
        const front = flashcard.querySelector(".card-front");
        const back = flashcard.querySelector(".card-back");
        if (front) front.setAttribute("aria-hidden", is_flipped ? "true" : "false");
        if (back) back.setAttribute("aria-hidden", is_flipped ? "false" : "true");
    }
    const actions_bar = document.getElementById("review-actions-bar");
    if (actions_bar) {
        render_trivia_actions(actions_bar, is_flipped, toggle_flip, rate_card);
    }
}
async function rate_card(was_correct) {
    if (!is_session_active || !is_flipped || is_rating) return;
    is_rating = true;
    try {
        const card = current_session[current_card_index];
        const today = get_today_date();
        if (current_sub_mode === "scheduled") {
            const progress_input = card.progress || { card_kind: card.card_kind, card_id: card.card_id };
            const updated = schedule_card(progress_input, was_correct, today);
            await save_progress_row(updated);
        }
        if (was_correct) {
            session_stats.right += 1;
        } else {
            session_stats.wrong += 1;
        }
        current_card_index += 1;
        is_flipped = false;
        render_trivia_view();
        if (current_sub_mode === "scheduled" && on_data_change_callback) {
            on_data_change_callback();
        }
    } finally {
        is_rating = false;
    }
}
let trivia_shortcuts_initialized = false;
function setup_trivia_keyboard_shortcuts() {
    if (trivia_shortcuts_initialized) return;
    trivia_shortcuts_initialized = true;
    window.addEventListener("keydown", (e) => {
        if (typeof document !== "undefined" && typeof document.querySelector === "function" && document.querySelector("dialog[open]")) return;
        const trivia_panel = document.getElementById("tab-trivia");
        if (!trivia_panel || trivia_panel.hidden) return;
        if (!is_session_active || is_rating) return;
        if (current_card_index >= current_session.length) return;
        const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            toggle_flip();
        } else if (is_flipped) {
            if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
                e.preventDefault();
                rate_card(false);
            } else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
                e.preventDefault();
                rate_card(true);
            }
        }
    });
}