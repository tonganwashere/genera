import {
    render_cards_view,
    set_cards_filter,
    set_cards_category,
    set_cards_search,
    set_cards_page
} from "../views/cards_view.js";

export function setup_cards_listeners(on_change) {
    const search_input = document.getElementById("cards-search-input");
    if (search_input) {
        search_input.addEventListener("input", (e) => {
            set_cards_search(e.target.value.trim());
            set_cards_page(1);
            render_cards_view(on_change);
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