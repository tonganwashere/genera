import {
    render_cards_view,
    populate_category_dropdown,
    open_card_modal,
    open_add_modal,
    open_edit_modal,
    set_cards_filter,
    set_cards_category,
    set_cards_search,
    set_cards_page
} from "../views/cards_view.js";

export function setup_cards_listeners(on_change) {
    const add_card_btn = document.getElementById("btn-add-card");
    if (add_card_btn) {
        add_card_btn.addEventListener("click", () => {
            open_card_modal(null, async () => {
                await populate_category_dropdown();
                await render_cards_view(on_change, true);
                if (on_change) on_change();
            });
        });
    }

    const modal = document.getElementById("card-modal");
    const cancel_btn = document.getElementById("modal-cancel-btn");
    if (cancel_btn && modal) {
        cancel_btn.addEventListener("click", () => modal.close());
    }

    const close_icon = document.getElementById("modal-close-icon");
    if (close_icon && modal) {
        close_icon.addEventListener("click", () => modal.close());
    }

    const search_input = document.getElementById("cards-search-input");
    if (search_input) {
        let debounce_timer = null;
        search_input.addEventListener("input", (e) => {
            clearTimeout(debounce_timer);
            debounce_timer = setTimeout(() => {
                set_cards_search(e.target.value.trim());
                set_cards_page(1);
                render_cards_view(on_change);
            }, 150);
        });
    }

    const filter_buttons = document.querySelectorAll(".filter-btn");
    filter_buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            filter_buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            set_cards_filter(btn.dataset.filter);
            set_cards_page(1);
            render_cards_view(on_change);
        });
    });

    const category_select = document.getElementById("cards-category-select");
    if (category_select) {
        category_select.addEventListener("change", (e) => {
            set_cards_category(e.target.value);
            set_cards_page(1);
            render_cards_view(on_change);
        });
    }
}

export {
    setup_cards_listeners as init_cards_controller,
    open_card_modal,
    open_add_modal,
    open_edit_modal
};

