import {
    get_user_decks,
    get_deck_cards,
    delete_deck,
    delete_own_card,
    save_own_card,
    get_user_box_distribution,
    get_today_date
} from "../models/localdb.js";
import { get_study_streak } from "../models/streak.js";
import { render_home_overview, render_deck_detail_view } from "../views/home_view.js";
import { show_toast } from "../views/toast.js";
import { export_deck_csv, export_deck_json } from "./export_controller.js";
import { open_import_dialog } from "./import_controller.js";
import { open_create_deck_modal } from "./deck_wizard_controller.js";
let current_open_deck = null;
let navigate_to_study_fn = null;
let global_refresh_fn = null;
export function init_home_controller({ on_navigate_to_study, on_data_change } = {}) {
    navigate_to_study_fn = on_navigate_to_study;
    global_refresh_fn = on_data_change;
    setup_card_modal_listeners();
    render_home_tab();
}
export function open_home_deck_detail(deck_name) {
    current_open_deck = deck_name;
    render_home_tab();
}
export function close_home_deck_detail() {
    current_open_deck = null;
    render_home_tab();
}
export async function render_home_tab() {
    const today = get_today_date();
    if (current_open_deck) {
        const [decks, cards] = await Promise.all([
            get_user_decks(today),
            get_deck_cards(current_open_deck)
        ]);
        const target_lower = current_open_deck.toLowerCase();
        const deck_info = decks.find((d) => (d.name || "").toLowerCase() === target_lower) || {
            name: current_open_deck,
            card_count: cards.length,
            due_count: 0,
            unintroduced_count: 0
        };
        render_deck_detail_view({
            deck_name: current_open_deck,
            deck_info,
            cards,
            on_back: () => {
                current_open_deck = null;
                render_home_tab();
            },
            on_study: (deck_name) => {
                if (navigate_to_study_fn) {
                    navigate_to_study_fn(deck_name);
                }
            },
            on_add_card: (deck_name) => {
                show_card_modal("deck_add", deck_name);
            },
            on_import: async (deck_name) => {
                open_import_dialog({ default_deck: deck_name, on_imported: on_data_mutated });
            },
            on_export_csv: (deck_name) => {
                export_deck_csv(deck_name, cards);
            },
            on_export_json: (deck_name) => {
                export_deck_json(deck_name, cards);
            },
            on_delete_deck: async (deck_name) => {
                await delete_deck(deck_name);
                current_open_deck = null;
                await on_data_mutated();
                show_toast(`Deck "${deck_name}" deleted.`, "info");
            },
            on_edit_card: (card) => {
                show_card_modal("edit", card);
            },
            on_delete_card: async (card_id) => {
                await delete_own_card(card_id);
                await on_data_mutated();
                show_toast("Card deleted.", "info");
            }
        });
    } else {
        const [streak, box_dist, decks] = await Promise.all([
            get_study_streak(today),
            get_user_box_distribution(),
            get_user_decks(today)
        ]);
        render_home_overview({
            streak,
            box_distribution: box_dist,
            decks,
            on_add_card: () => {
                show_card_modal("quick_add", decks.length > 0 ? decks[0].name : "Default");
            },
            on_create_deck: () => {
                open_create_deck_modal(async (new_deck_name) => {
                    await on_data_mutated();
                    if (new_deck_name) {
                        current_open_deck = new_deck_name;
                        render_home_tab();
                    }
                });
            },
            on_import: () => {
                open_import_dialog({ on_imported: on_data_mutated });
            },
            on_open_deck: (deck_name) => {
                current_open_deck = deck_name;
                render_home_tab();
            }
        });
    }
}
async function on_data_mutated() {
    await render_home_tab();
    if (global_refresh_fn) {
        await global_refresh_fn();
    }
}
export async function show_card_modal(mode, card = null) {
    const modal = document.getElementById("card-modal");
    if (!modal) return;
    const title = document.getElementById("modal-title");
    const edit_id = document.getElementById("card-edit-id");
    const q_input = document.getElementById("card-question-input");
    const a_input = document.getElementById("card-answer-input");
    const c_input = document.getElementById("card-category-input");
    const datalist = document.getElementById("deck-list-suggestions");
    const error_el = document.getElementById("card-error-msg") || document.getElementById("card-modal-error-msg");

    if (error_el) {
        error_el.textContent = "";
        error_el.style.display = "none";
    }

    if (mode === "edit" && card) {
        if (title) title.textContent = "Edit Card";
        if (edit_id) edit_id.value = card.id || "";
        if (q_input) q_input.value = card.question || "";
        if (a_input) a_input.value = card.answer || "";
        if (c_input) {
            c_input.value = card.category || "";
            c_input.readOnly = false;
        }
    } else if (mode === "deck_add" || (mode === "add" && typeof card === "string" && card && card !== "Default")) {
        const deck_name = typeof card === "string" ? card : (card?.category || "Default");
        if (title) title.textContent = `Add Card to "${deck_name}"`;
        if (edit_id) edit_id.value = "";
        if (q_input) q_input.value = "";
        if (a_input) a_input.value = "";
        if (c_input) {
            c_input.value = deck_name;
            c_input.readOnly = true;
        }
    } else {
        const default_deck = (typeof card === "string" ? card : card?.category) || "Default";
        if (title) title.textContent = "Add Card";
        if (edit_id) edit_id.value = "";
        if (q_input) q_input.value = "";
        if (a_input) a_input.value = "";
        if (c_input) {
            c_input.value = default_deck;
            c_input.readOnly = false;
        }
        if (datalist) {
            try {
                const today = get_today_date();
                const decks = await get_user_decks(today);
                datalist.innerHTML = decks.map((d) => `<option value="${d.name}">`).join("");
            } catch (_) {
                datalist.innerHTML = "";
            }
        }
    }
    modal.showModal();
    if (q_input) q_input.focus();
}

export const open_quick_add_card = (default_deck = "Default") => show_card_modal("quick_add", default_deck);

function setup_card_modal_listeners() {
    const modal = document.getElementById("card-modal");
    const form = document.getElementById("card-form");
    const cancel_btn = document.getElementById("modal-cancel-btn");
    const close_icon = document.getElementById("modal-close-icon");

    const clear_error = () => {
        const err_el = document.getElementById("card-error-msg") || document.getElementById("card-modal-error-msg");
        if (err_el) {
            err_el.textContent = "";
            err_el.style.display = "none";
        }
    };

    if (cancel_btn && modal) {
        cancel_btn.onclick = () => {
            clear_error();
            modal.close();
        };
    }
    if (close_icon && modal) {
        close_icon.onclick = () => {
            clear_error();
            modal.close();
        };
    }
    if (modal) {
        modal.addEventListener("close", clear_error);
    }
    if (form && modal) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            clear_error();
            const edit_id = document.getElementById("card-edit-id")?.value;
            const q = document.getElementById("card-question-input")?.value || "";
            const a = document.getElementById("card-answer-input")?.value || "";
            const c = document.getElementById("card-category-input")?.value || "";

            const trimmed_q = q.trim();
            const trimmed_a = a.trim();
            const cur_error_el = document.getElementById("card-error-msg") || document.getElementById("card-modal-error-msg");
            if (!trimmed_q) {
                if (cur_error_el) {
                    cur_error_el.textContent = "Question must be between 1 and 500 characters.";
                    cur_error_el.style.display = "block";
                }
                return;
            }
            if (!trimmed_a) {
                if (cur_error_el) {
                    cur_error_el.textContent = "Answer must be between 1 and 500 characters.";
                    cur_error_el.style.display = "block";
                }
                return;
            }
            try {
                await save_own_card({
                    id: edit_id || null,
                    question: trimmed_q,
                    answer: trimmed_a,
                    category: c
                });
                modal.close();
                await on_data_mutated();
                show_toast(edit_id ? "Card updated successfully." : "Card added successfully.", "success");
            } catch (err) {
                const err_el = document.getElementById("card-error-msg") || document.getElementById("card-modal-error-msg");
                if (err_el) {
                    err_el.textContent = err.message;
                    err_el.style.display = "block";
                } else {
                    show_toast(err.message, "error");
                }
            }
        };
    }
}