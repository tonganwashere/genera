import { build_session_for_mode } from "../models/session.js";
import { schedule_card } from "../models/scheduler.js";
import {
    save_progress_row,
    get_user_decks,
    get_all_own_cards,
    get_today_date
} from "../models/localdb.js";
import { record_study_activity } from "../models/streak.js";
import {
    create_study_start_screen,
    create_study_active_card,
    render_study_actions,
    create_study_finished_screen
} from "../views/study_view.js";
import { show_toast } from "../views/toast.js";
import { show_confirm_dialog } from "../views/confirm_dialog.js";
let current_session = [];
let current_card_index = 0;
let is_flipped = false;
let session_stats = { right: 0, wrong: 0 };
let current_deck = "all";
let current_sub_mode = "scheduled";
let is_session_active = false;
let is_rating = false;
let on_data_change_callback = null;
let on_navigate_home_callback = null;
export function init_study_controller({ on_data_change, on_navigate_home } = {}) {
    on_data_change_callback = on_data_change;
    on_navigate_home_callback = on_navigate_home;
    setup_study_keyboard_shortcuts();
    render_study_view();
}
export function set_study_deck(deck_name) {
    current_deck = deck_name || "all";
    if (!is_session_active) {
        render_study_view();
    }
}
export async function render_study_view() {
    const container = document.getElementById("study-container");
    if (!container) return;
    container.innerHTML = "";
    if (!is_session_active) {
        const [decks, all_cards] = await Promise.all([
            get_user_decks(),
            get_all_own_cards(false)
        ]);
        const total_due = decks.reduce((acc, d) => acc + (d.due_count || 0), 0);
        const start_el = create_study_start_screen({
            decks,
            selected_deck: current_deck,
            sub_mode: current_sub_mode,
            due_info: { due_count: total_due, total_count: all_cards.length },
            on_deck_change: (deck) => {
                current_deck = deck;
                render_study_view();
            },
            on_mode_change: (mode) => {
                current_sub_mode = mode;
            },
            on_start: async (btn) => {
                btn.disabled = true;
                btn.textContent = "Loading cards...";
                try {
                    const session_res = await build_session_for_mode({
                        session_type: "study",
                        deck_name: current_deck === "all" ? null : current_deck,
                        sub_mode: current_sub_mode,
                        today: get_today_date()
                    });
                    if (!session_res.cards || session_res.cards.length === 0) {
                        const msg = current_sub_mode === "scheduled" ?
                            "No cards due or eligible for scheduled study right now! Try Freestyle mode to review anytime." :
                            "No cards available in this deck.";
                        show_toast(msg, "info");
                        btn.disabled = false;
                        btn.textContent = "Start Studying";
                        return;
                    }
                    current_session = session_res.cards;
                    current_card_index = 0;
                    is_flipped = false;
                    session_stats = { right: 0, wrong: 0 };
                    is_session_active = true;
                    render_study_view();
                } catch (err) {
                    show_toast("Failed to build session: " + err.message, "error");
                    btn.disabled = false;
                    btn.textContent = "Start Studying";
                }
            }
        });
        container.appendChild(start_el);
    } else if (current_card_index >= current_session.length) {
        const finished_el = create_study_finished_screen({
            stats: session_stats,
            sub_mode: current_sub_mode,
            on_restart: () => {
                is_session_active = false;
                current_session = [];
                render_study_view();
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
        const card_fragment = create_study_active_card({
            card,
            index: current_card_index,
            total: current_session.length,
            is_flipped,
            sub_mode: current_sub_mode,
            on_quit: async () => {
                const confirmed = await show_confirm_dialog({
                    title: "Quit Study Session?",
                    message: "Quit study session? Completed cards will remain recorded.",
                    confirm_text: "Quit Session",
                    cancel_text: "Continue Studying",
                    danger: false
                });
                if (confirmed) {
                    is_session_active = false;
                    current_session = [];
                    render_study_view();
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
function toggle_flip() {
    if (!is_session_active) return;
    is_flipped = !is_flipped;
    const flashcard = document.getElementById("active-flashcard");
    if (flashcard) {
        flashcard.classList.toggle("flipped", is_flipped);
        const front = flashcard.querySelector(".card-front");
        const back = flashcard.querySelector(".card-back");
        if (front) front.setAttribute("aria-hidden", is_flipped ? "true" : "false");
        if (back) back.setAttribute("aria-hidden", is_flipped ? "false" : "true");
    }
    const actions_bar = document.getElementById("review-actions-bar");
    if (actions_bar) {
        render_study_actions(actions_bar, is_flipped, toggle_flip, rate_card);
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
            await record_study_activity(today);
        }
        if (was_correct) {
            session_stats.right += 1;
        } else {
            session_stats.wrong += 1;
        }
        current_card_index += 1;
        is_flipped = false;
        render_study_view();
        if (current_sub_mode === "scheduled" && on_data_change_callback) {
            on_data_change_callback();
        }
    } finally {
        is_rating = false;
    }
}
let study_shortcuts_initialized = false;
function setup_study_keyboard_shortcuts() {
    if (study_shortcuts_initialized) return;
    study_shortcuts_initialized = true;
    window.addEventListener("keydown", (e) => {
        if (typeof document !== "undefined" && typeof document.querySelector === "function" && document.querySelector("dialog[open]")) return;
        const study_panel = document.getElementById("tab-study");
        if (!study_panel || study_panel.hidden) return;
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