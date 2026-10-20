import { build_session } from "../models/session.js";
import { schedule_card } from "../models/scheduler.js";
import { save_progress_row, get_today_date } from "../models/localdb.js";
import {
    create_start_screen,
    create_active_card_elements,
    render_actions_bar_content,
    create_finished_screen
} from "../views/review_view.js";

let current_session = [];
let current_card_index = 0;
let is_flipped = false;
let session_stats = { right: 0, wrong: 0 };
let current_mode = "everything";
let is_session_active = false;
let is_rating = false;
let session_update_callback = null;

export function init_review_view(on_update) {
    session_update_callback = on_update;
    setup_keyboard_shortcuts();
    render_review_view();
}

export async function render_review_view() {
    const container = document.getElementById("review-container");
    if (!container) return;

    container.innerHTML = "";

    if (!is_session_active) {
        const start_el = await create_start_screen({
            current_mode,
            on_mode_change: (mode) => {
                current_mode = mode;
            },
            on_start: async (btn) => {
                btn.disabled = true;
                btn.textContent = "Building session...";
                const session = await build_session({ mode: current_mode, today: get_today_date() });
                if (session.length === 0) {
                    alert("No cards due or eligible for review right now!");
                    btn.disabled = false;
                    btn.textContent = "Start Review";
                    return;
                }

                current_session = session;
                current_card_index = 0;
                is_flipped = false;
                session_stats = { right: 0, wrong: 0 };
                is_session_active = true;
                render_review_view();
            }
        });
        container.appendChild(start_el);
    } else if (current_card_index >= current_session.length) {
        const finished_el = create_finished_screen({
            stats: session_stats,
            on_done: () => {
                is_session_active = false;
                current_session = [];
                render_review_view();
                if (session_update_callback) session_update_callback();
            }
        });
        container.appendChild(finished_el);
    } else {
        const card = current_session[current_card_index];
        const card_fragment = create_active_card_elements({
            card,
            index: current_card_index,
            total: current_session.length,
            is_flipped,
            on_quit: () => {
                if (confirm("Quit review session? Cards already answered will remain saved.")) {
                    is_session_active = false;
                    current_session = [];
                    render_review_view();
                    if (session_update_callback) session_update_callback();
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
    }

    const actions_bar = document.getElementById("review-actions-bar");
    if (actions_bar) {
        render_actions_bar_content(actions_bar, is_flipped, toggle_flip, rate_card);
    }
}

async function rate_card(was_correct) {
    if (!is_session_active || !is_flipped || is_rating) return;
    is_rating = true;

    try {
        const card = current_session[current_card_index];
        const today = get_today_date();

        const progress_input = card.progress || {
            card_kind: card.card_kind,
            card_id: card.card_id,
            box: 1,
            times_right: 0,
            times_wrong: 0,
            hidden: 0
        };

        const updated = schedule_card(progress_input, was_correct, today);
        await save_progress_row(updated);

        if (was_correct) {
            session_stats.right += 1;
        } else {
            session_stats.wrong += 1;
        }

        current_card_index += 1;
        is_flipped = false;

        render_review_view();
        if (session_update_callback) session_update_callback();
    } finally {
        is_rating = false;
    }
}

function setup_keyboard_shortcuts() {
    window.addEventListener("keydown", (e) => {
        const review_panel = document.getElementById("tab-review");
        if (!review_panel || review_panel.hidden) return;
        if (!is_session_active) return;
        if (current_card_index >= current_session.length) return;

        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        if (e.code === "Space" || e.key === " ") {
            e.preventDefault();
            toggle_flip();
        } else if (is_flipped) {
            if (e.key === "1") {
                e.preventDefault();
                rate_card(false);
            } else if (e.key === "2") {
                e.preventDefault();
                rate_card(true);
            }
        }
    });
}