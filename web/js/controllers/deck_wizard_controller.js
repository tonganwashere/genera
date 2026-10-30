import {
    get_user_decks,
    create_empty_deck
} from "../models/localdb.js";
let on_finish_callback = null;
export function open_create_deck_modal(on_finish) {
    on_finish_callback = on_finish;
    if (typeof document === "undefined") return;
    const modal = document.getElementById("create-deck-modal");
    if (!modal) return;
    const input = document.getElementById("create-deck-name-input");
    const error_el = document.getElementById("create-deck-error-msg");
    if (input) input.value = "";
    if (error_el) {
        error_el.textContent = "";
        error_el.style.display = "none";
    }
    setup_create_deck_listeners();
    modal.showModal();
    if (input) input.focus();
}
export const open_create_deck_wizard = open_create_deck_modal;
function setup_create_deck_listeners() {
    const modal = document.getElementById("create-deck-modal");
    const form = document.getElementById("create-deck-form");
    const close_icon = document.getElementById("create-deck-close-icon");
    const cancel_btn = document.getElementById("create-deck-cancel-btn");
    const input = document.getElementById("create-deck-name-input");
    const error_el = document.getElementById("create-deck-error-msg");
    const close_modal = () => {
        if (modal) modal.close();
    };
    if (close_icon) close_icon.onclick = close_modal;
    if (cancel_btn) cancel_btn.onclick = close_modal;
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const raw_name = input ? input.value : "";
            const trimmed = (raw_name || "").trim();
            if (!trimmed) {
                if (error_el) {
                    error_el.textContent = "Deck name is required.";
                    error_el.style.display = "block";
                }
                return;
            }
            if (trimmed.length > 50) {
                if (error_el) {
                    error_el.textContent = "Deck name cannot exceed 50 characters.";
                    error_el.style.display = "block";
                }
                return;
            }
            try {
                const decks = await get_user_decks();
                const dupe = decks.some((d) => (d.name || "").trim().toLowerCase() === trimmed.toLowerCase());
                if (dupe) {
                    if (error_el) {
                        error_el.textContent = "A deck with this name already exists.";
                        error_el.style.display = "block";
                    }
                    return;
                }
                await create_empty_deck(trimmed);
                if (modal) modal.close();
                if (on_finish_callback) {
                    await on_finish_callback(trimmed);
                }
            } catch (err) {
                if (error_el) {
                    error_el.textContent = err.message || "Failed to create deck.";
                    error_el.style.display = "block";
                }
            }
        };
    }
}