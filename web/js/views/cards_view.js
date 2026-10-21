import {
    save_own_card,
    add_own_card,
    update_own_card,
    delete_own_card,
    get_all_own_cards,
    get_all_catalog_cards,
    get_all_progress_rows,
    get_all_categories,
    set_card_hidden
} from "../models/localdb.js";

let current_filter = "all";
let current_category = "all";
let current_search = "";
let current_page = 1;
const page_size = 50;
let cached_merged_cards = null;

export function invalidate_cards_cache() {
    cached_merged_cards = null;
}

export function create_card_element(card, is_official_or_cb, is_hidden_or_cb, on_change_cb) {
    let is_official = card.is_official ?? false;
    let is_hidden = card.is_hidden ?? false;
    let on_change = on_change_cb;

    if (typeof is_official_or_cb === "function") {
        on_change = is_official_or_cb;
    } else {
        if (typeof is_official_or_cb === "boolean") is_official = is_official_or_cb;
        if (typeof is_hidden_or_cb === "boolean") is_hidden = is_hidden_or_cb;
    }
    const row = document.createElement("div");
    row.className = "card-row";
    row.dataset.id = card.id;

    const content_div = document.createElement("div");
    content_div.className = "card-content";

    const badge_row = document.createElement("div");
    badge_row.className = "badge-row";

    const cat_badge = document.createElement("span");
    cat_badge.className = "badge";
    cat_badge.textContent = card.category;
    badge_row.appendChild(cat_badge);

    const source_badge = document.createElement("span");
    source_badge.className = card.is_official ? "badge badge-official" : "badge badge-mine";
    source_badge.textContent = card.is_official ? "Official" : "Mine";
    badge_row.appendChild(source_badge);

    if (card.is_hidden) {
        const hidden_badge = document.createElement("span");
        hidden_badge.className = "badge badge-hidden";
        hidden_badge.textContent = "Hidden";
        badge_row.appendChild(hidden_badge);
    }

    const q_el = document.createElement("div");
    q_el.className = "card-question";
    q_el.textContent = card.question;

    const a_el = document.createElement("div");
    a_el.className = "card-answer";
    a_el.textContent = card.answer;

    content_div.appendChild(badge_row);
    content_div.appendChild(q_el);
    content_div.appendChild(a_el);
    row.appendChild(content_div);

    const actions_div = document.createElement("div");
    actions_div.className = "card-actions";

    if (card.is_official) {
        const hide_btn = document.createElement("button");
        hide_btn.className = "btn btn-sm";
        hide_btn.textContent = card.is_hidden ? "Unhide" : "Hide";
        hide_btn.addEventListener("click", async () => {
            await set_card_hidden("catalog", card.id, !card.is_hidden);
            invalidate_cards_cache();
            if (on_change) on_change();
        });
        actions_div.appendChild(hide_btn);
    } else {
        if (card.is_hidden) {
            const unhide_btn = document.createElement("button");
            unhide_btn.className = "btn btn-sm";
            unhide_btn.textContent = "Unhide";
            unhide_btn.addEventListener("click", async () => {
                await set_card_hidden("own", card.id, false);
                invalidate_cards_cache();
                if (on_change) on_change();
            });
            actions_div.appendChild(unhide_btn);
        }

        const edit_btn = document.createElement("button");
        edit_btn.className = "btn btn-sm";
        edit_btn.textContent = "Edit";
        edit_btn.addEventListener("click", () => {
            open_card_modal(card, on_change);
        });

        const delete_btn = document.createElement("button");
        delete_btn.className = "btn btn-sm btn-danger";
        delete_btn.textContent = "Delete";
        delete_btn.addEventListener("click", async () => {
            if (confirm("Delete this card?")) {
                await delete_own_card(card.id);
                invalidate_cards_cache();
                if (on_change) on_change();
            }
        });

        actions_div.appendChild(edit_btn);
        actions_div.appendChild(delete_btn);
    }

    row.appendChild(actions_div);
    return row;
}

export function open_card_modal(card = null, on_saved) {
    const modal = document.getElementById("card-modal");
    const title = document.getElementById("modal-title");
    const edit_id = document.getElementById("card-edit-id");
    const q_input = document.getElementById("card-question-input");
    const a_input = document.getElementById("card-answer-input");
    const c_input = document.getElementById("card-category-input");

    title.textContent = card ? "Edit Card" : "Add Card";
    edit_id.value = card ? card.id : "";
    q_input.value = card ? card.question : "";
    a_input.value = card ? card.answer : "";
    c_input.value = card ? card.category : "";

    modal.showModal();

    const form = document.getElementById("card-form");
    form.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await save_own_card({
                id: card ? card.id : null,
                question: q_input.value,
                answer: a_input.value,
                category: c_input.value
            });
            invalidate_cards_cache();
            modal.close();
            if (on_saved) on_saved();
        } catch (err) {
            alert(err.message);
        }
    };
}

export function open_add_modal(on_saved) {
    return open_card_modal(null, on_saved);
}

export function open_edit_modal(card, on_saved) {
    return open_card_modal(card, on_saved);
}

export async function populate_category_dropdown() {
    const select = document.getElementById("cards-category-select");
    if (!select) return;

    const previous_val = select.value;
    const categories = await get_all_categories();

    select.innerHTML = '<option value="all">All Categories</option>';
    for (const cat of categories) {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    }

    if (categories.includes(previous_val)) {
        select.value = previous_val;
    } else {
        select.value = "all";
        current_category = "all";
    }
}

export async function fetch_filtered_cards(force_reload = false) {
    if (!cached_merged_cards || force_reload) {
        const [catalog_cards, own_cards, progress_rows] = await Promise.all([
            get_all_catalog_cards(),
            get_all_own_cards(false),
            get_all_progress_rows()
        ]);

        const hidden_set = new Set();
        for (const p of progress_rows) {
            if (p.hidden === 1) {
                hidden_set.add(`${p.card_kind}:${p.card_id}`);
            }
        }

        cached_merged_cards = [
            ...catalog_cards.map((c) => ({ ...c, is_official: true, is_hidden: hidden_set.has(`catalog:${c.id}`) })),
            ...own_cards.map((c) => ({ ...c, is_official: false, is_hidden: hidden_set.has(`own:${c.id}`) }))
        ];
    }

    const query = current_search.toLowerCase();
    return cached_merged_cards.filter((item) => {
        if (current_filter === "all" && item.is_hidden) return false;
        if (current_filter === "official" && (!item.is_official || item.is_hidden)) return false;
        if (current_filter === "mine" && item.is_official) return false;
        if (current_filter === "hidden" && !item.is_hidden) return false;

        if (current_category !== "all" && item.category !== current_category) return false;

        if (query && !item.question.toLowerCase().includes(query) && !item.answer.toLowerCase().includes(query)) {
            return false;
        }

        return true;
    });
}

export async function render_cards_view(on_change, force_reload = false) {
    const container = document.getElementById("cards-container");
    const count_bar = document.getElementById("cards-count-bar");
    const pagination_bar = document.getElementById("cards-pagination");
    if (!container) return;

    const cards = await fetch_filtered_cards(force_reload);
    container.innerHTML = "";
    if (pagination_bar) pagination_bar.innerHTML = "";

    if (cards.length === 0) {
        if (count_bar) count_bar.textContent = "";
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const p = document.createElement("p");
        p.textContent = "No cards match the selected filter.";
        empty.appendChild(p);
        container.appendChild(empty);
        return;
    }

    const total_matching = cards.length;
    const visible_count = Math.min(current_page * page_size, total_matching);
    const visible_slice = cards.slice(0, visible_count);

    if (count_bar) {
        count_bar.textContent = `Showing ${visible_count} of ${total_matching} cards`;
    }

    for (const card of visible_slice) {
        const el = create_card_element(card, async () => {
            invalidate_cards_cache();
            await render_cards_view(on_change);
            if (on_change) on_change();
        });
        container.appendChild(el);
    }

    if (visible_count < total_matching && pagination_bar) {
        const load_more_btn = document.createElement("button");
        load_more_btn.className = "btn";
        load_more_btn.textContent = "Load More";
        load_more_btn.addEventListener("click", () => {
            current_page += 1;
            render_cards_view(on_change);
        });
        pagination_bar.appendChild(load_more_btn);
    }
}

export function set_cards_filter(val) { current_filter = val; }
export function set_cards_category(val) { current_category = val; }
export function set_cards_search(val) { current_search = val; }
export function set_cards_page(val) { current_page = val; }