import { escape_html } from "./view_utils.js";
import { show_confirm_dialog } from "./confirm_dialog.js";

export function render_home_overview({
    streak = 0,
    box_distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unintroduced: 0 },
    decks = [],
    on_add_card,
    on_create_deck,
    on_import,
    on_open_deck
}) {
    const container = document.getElementById("home-container");
    if (!container) return;
    container.innerHTML = "";
    const total_cards = (box_distribution[1] || 0) +
        (box_distribution[2] || 0) +
        (box_distribution[3] || 0) +
        (box_distribution[4] || 0) +
        (box_distribution[5] || 0) +
        (box_distribution.unintroduced || 0);
    const total_due = (decks || []).reduce((sum, d) => sum + (d.due_count || 0), 0);
    const metrics_grid = document.createElement("div");
    metrics_grid.className = "home-metrics-grid";
    const streak_card = document.createElement("div");
    streak_card.className = "home-metric-card";
    streak_card.innerHTML = `
        <div class="metric-top">
            <span class="metric-label">Streak</span>
            <span class="metric-icon" aria-hidden="true">&#128293;</span>
        </div>
        <div class="metric-value-row">
            <span class="metric-number" id="home-streak-val">${streak}</span>
            <span class="metric-unit">${streak === 1 ? "day" : "days"}</span>
        </div>
        <div class="metric-subtext">${streak > 0 ? "Daily streak active" : "Study today to start"}</div>
    `;
    metrics_grid.appendChild(streak_card);
    const due_card = document.createElement("div");
    due_card.className = "home-metric-card";
    due_card.innerHTML = `
        <div class="metric-top">
            <span class="metric-label">Due for Review</span>
        </div>
        <div class="metric-value-row">
            <span class="metric-number" id="home-due-val">${total_due}</span>
            <span class="metric-unit">${total_due === 1 ? "card" : "cards"}</span>
        </div>
        <div class="metric-subtext">${total_due > 0 ? "Ready to practice" : "All caught up"}</div>
    `;
    metrics_grid.appendChild(due_card);
    const total_card = document.createElement("div");
    total_card.className = "home-metric-card";
    total_card.innerHTML = `
        <div class="metric-top">
            <span class="metric-label">Total Cards</span>
        </div>
        <div class="metric-value-row">
            <span class="metric-number" id="home-total-cards-val">${total_cards}</span>
            <span class="metric-unit">${total_cards === 1 ? "card" : "cards"}</span>
        </div>
        <div class="metric-subtext">${box_distribution.unintroduced || 0} unstudied</div>
    `;
    metrics_grid.appendChild(total_card);
    container.appendChild(metrics_grid);
    const leitner_card = document.createElement("div");
    leitner_card.className = "home-leitner-card";
    const b1 = box_distribution[1] || 0;
    const b2 = box_distribution[2] || 0;
    const b3 = box_distribution[3] || 0;
    const b4 = box_distribution[4] || 0;
    const b5 = box_distribution[5] || 0;
    const bNew = box_distribution.unintroduced || 0;
    const p1 = total_cards > 0 ? (b1 / total_cards) * 100 : 0;
    const p2 = total_cards > 0 ? (b2 / total_cards) * 100 : 0;
    const p3 = total_cards > 0 ? (b3 / total_cards) * 100 : 0;
    const p4 = total_cards > 0 ? (b4 / total_cards) * 100 : 0;
    const p5 = total_cards > 0 ? (b5 / total_cards) * 100 : 0;
    const pNew = total_cards > 0 ? (bNew / total_cards) * 100 : 0;
    leitner_card.innerHTML = `
        <div class="leitner-card-header">
            <div>
                <h3 class="leitner-card-title">Leitner Progress</h3>
                <p class="leitner-card-subtext">Cards advance through intervals as you answer correctly</p>
            </div>
            <span class="leitner-card-badge">${total_cards} ${total_cards === 1 ? "card" : "cards"}</span>
        </div>
        <div class="leitner-distribution-bar" role="progressbar" aria-label="Leitner box distribution" aria-valuenow="${total_cards}" aria-valuemin="0" aria-valuemax="${total_cards}" aria-valuetext="${total_cards} cards: Box 1: ${b1}, Box 2: ${b2}, Box 3: ${b3}, Box 4: ${b4}, Box 5: ${b5}, New: ${bNew}">
            ${total_cards > 0 ? `
                <div class="leitner-seg seg-b1" style="width: ${p1}%;" title="Box 1: ${b1}"></div>
                <div class="leitner-seg seg-b2" style="width: ${p2}%;" title="Box 2: ${b2}"></div>
                <div class="leitner-seg seg-b3" style="width: ${p3}%;" title="Box 3: ${b3}"></div>
                <div class="leitner-seg seg-b4" style="width: ${p4}%;" title="Box 4: ${b4}"></div>
                <div class="leitner-seg seg-b5" style="width: ${p5}%;" title="Box 5: ${b5}"></div>
                <div class="leitner-seg seg-new" style="width: ${pNew}%;" title="New: ${bNew}"></div>
            ` : `<div class="leitner-seg-empty"></div>`}
        </div>
        <div class="leitner-boxes-grid">
            <div class="leitner-box-col box-col-1">
                <span class="box-col-name">Box 1</span>
                <span class="box-col-interval">1 day</span>
                <span class="box-col-count">${b1}</span>
            </div>
            <div class="leitner-box-col box-col-2">
                <span class="box-col-name">Box 2</span>
                <span class="box-col-interval">2 days</span>
                <span class="box-col-count">${b2}</span>
            </div>
            <div class="leitner-box-col box-col-3">
                <span class="box-col-name">Box 3</span>
                <span class="box-col-interval">4 days</span>
                <span class="box-col-count">${b3}</span>
            </div>
            <div class="leitner-box-col box-col-4">
                <span class="box-col-name">Box 4</span>
                <span class="box-col-interval">8 days</span>
                <span class="box-col-count">${b4}</span>
            </div>
            <div class="leitner-box-col box-col-5">
                <span class="box-col-name">Box 5</span>
                <span class="box-col-interval">16 days</span>
                <span class="box-col-count">${b5}</span>
            </div>
            <div class="leitner-box-col box-col-new">
                <span class="box-col-name">New</span>
                <span class="box-col-interval">Unstudied</span>
                <span class="box-col-count">${bNew}</span>
            </div>
        </div>
    `;
    container.appendChild(leitner_card);
    const section_header = document.createElement("div");
    section_header.className = "home-section-header";
    section_header.innerHTML = `
        <div class="home-section-title-wrap">
            <h2 class="home-section-title">Decks</h2>
            <span class="badge">${decks.length}</span>
        </div>
    `;
    const actions_wrap = document.createElement("div");
    actions_wrap.className = "home-section-actions";
    const add_card_btn = document.createElement("button");
    add_card_btn.type = "button";
    add_card_btn.id = "btn-home-add-card";
    add_card_btn.className = "btn btn-primary";
    add_card_btn.textContent = "+ Add Card";
    add_card_btn.addEventListener("click", () => {
        if (on_add_card) on_add_card();
    });
    actions_wrap.appendChild(add_card_btn);
    const create_btn = document.createElement("button");
    create_btn.type = "button";
    create_btn.id = "btn-create-deck";
    create_btn.className = "btn";
    create_btn.textContent = "Create Deck";
    create_btn.addEventListener("click", () => {
        if (on_create_deck) on_create_deck();
    });
    actions_wrap.appendChild(create_btn);
    const import_btn = document.createElement("button");
    import_btn.type = "button";
    import_btn.id = "btn-import-decks";
    import_btn.className = "btn";
    import_btn.textContent = "Import";
    import_btn.addEventListener("click", () => {
        if (on_import) on_import();
    });
    actions_wrap.appendChild(import_btn);
    section_header.appendChild(actions_wrap);
    container.appendChild(section_header);
    if (!decks || decks.length === 0) {
        const empty_card = document.createElement("div");
        empty_card.id = "home-empty-state";
        empty_card.className = "home-empty-card";
        empty_card.innerHTML = `
            <div class="home-empty-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                </svg>
            </div>
            <h3 class="home-empty-title">No flashcard decks yet</h3>
            <p class="home-empty-desc">Create your first deck, add flashcards, or import existing decks to start studying with spaced repetition.</p>
        `;
        const empty_actions = document.createElement("div");
        empty_actions.className = "home-empty-actions";
        const empty_create_btn = document.createElement("button");
        empty_create_btn.type = "button";
        empty_create_btn.id = "btn-empty-create-deck";
        empty_create_btn.className = "btn btn-primary";
        empty_create_btn.textContent = "+ Create Deck";
        empty_create_btn.addEventListener("click", () => {
            if (on_create_deck) on_create_deck();
        });
        empty_actions.appendChild(empty_create_btn);
        const empty_add_btn = document.createElement("button");
        empty_add_btn.type = "button";
        empty_add_btn.id = "btn-empty-add-card";
        empty_add_btn.className = "btn";
        empty_add_btn.textContent = "Add Card";
        empty_add_btn.addEventListener("click", () => {
            if (on_add_card) on_add_card();
        });
        empty_actions.appendChild(empty_add_btn);
        const empty_import_btn = document.createElement("button");
        empty_import_btn.type = "button";
        empty_import_btn.id = "btn-empty-import";
        empty_import_btn.className = "btn";
        empty_import_btn.textContent = "Import Decks";
        empty_import_btn.addEventListener("click", () => {
            if (on_import) on_import();
        });
        empty_actions.appendChild(empty_import_btn);
        empty_card.appendChild(empty_actions);
        container.appendChild(empty_card);
    } else {
        const grid = document.createElement("div");
        grid.id = "home-deck-grid";
        grid.className = "deck-grid";
        for (const deck of decks) {
            const card = document.createElement("div");
            card.className = "deck-card";
            card.dataset.deck = deck.name;
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `Deck: ${deck.name}, ${deck.card_count} cards, ${deck.due_count} due`);
            const due_class = deck.due_count > 0 ? "deck-due-badge" : "deck-due-badge zero";
            const due_text = deck.due_count > 0 ? `${deck.due_count} due` : "All caught up";
            card.innerHTML = `
                <div class="deck-card-header">
                    <h3 class="deck-card-name">${escape_html(deck.name)}</h3>
                    <span class="${due_class}">${due_text}</span>
                </div>
                <div class="deck-card-footer">
                    <span>${deck.card_count} ${deck.card_count === 1 ? "card" : "cards"}</span>
                    <span>${deck.unintroduced_count} new</span>
                </div>
            `;
            const trigger_open = () => {
                if (on_open_deck) on_open_deck(deck.name);
            };
            card.addEventListener("click", trigger_open);
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    trigger_open();
                }
            });
            grid.appendChild(card);
        }
        container.appendChild(grid);
    }
}
export function render_deck_detail_view({
    deck_name,
    deck_info,
    cards = [],
    on_back,
    on_study,
    on_add_card,
    on_import,
    on_export_csv,
    on_export_json,
    on_delete_deck,
    on_edit_card,
    on_delete_card
}) {
    const container = document.getElementById("home-container");
    if (!container) return;
    container.innerHTML = "";
    const detail_wrap = document.createElement("div");
    detail_wrap.className = "deck-detail-view";
    const top_nav = document.createElement("div");
    top_nav.className = "deck-detail-top-nav";
    const back_btn = document.createElement("button");
    back_btn.type = "button";
    back_btn.id = "btn-deck-detail-back";
    back_btn.className = "btn btn-sm";
    back_btn.innerHTML = "&larr; Back to Decks";
    back_btn.addEventListener("click", () => {
        if (on_back) on_back();
    });
    top_nav.appendChild(back_btn);
    detail_wrap.appendChild(top_nav);
    const header_card = document.createElement("div");
    header_card.className = "deck-detail-header-card";
    const title_row = document.createElement("div");
    title_row.className = "deck-detail-title-row";
    const title_el = document.createElement("h2");
    title_el.className = "deck-detail-title";
    title_el.textContent = deck_name;
    const badges_el = document.createElement("div");
    badges_el.className = "deck-detail-badges";
    const card_count = cards.length;
    const due_count = deck_info ? deck_info.due_count : 0;
    const due_badge = document.createElement("span");
    due_badge.className = due_count > 0 ? "deck-due-badge" : "deck-due-badge zero";
    due_badge.textContent = due_count > 0 ? `${due_count} due today` : "All caught up";
    badges_el.appendChild(due_badge);
    const count_badge = document.createElement("span");
    count_badge.className = "badge";
    count_badge.textContent = `${card_count} ${card_count === 1 ? "card" : "cards"}`;
    badges_el.appendChild(count_badge);
    title_row.appendChild(title_el);
    title_row.appendChild(badges_el);
    header_card.appendChild(title_row);
    const actions_row = document.createElement("div");
    actions_row.className = "deck-detail-actions";
    const primary_group = document.createElement("div");
    primary_group.className = "deck-actions-group";
    const study_btn = document.createElement("button");
    study_btn.type = "button";
    study_btn.id = "btn-deck-detail-study";
    study_btn.className = "btn btn-primary";
    study_btn.textContent = "Start Studying";
    study_btn.addEventListener("click", () => {
        if (on_study) on_study(deck_name);
    });
    primary_group.appendChild(study_btn);
    const add_card_btn = document.createElement("button");
    add_card_btn.type = "button";
    add_card_btn.id = "btn-deck-detail-add-card";
    add_card_btn.className = "btn";
    add_card_btn.textContent = "+ Add Card";
    add_card_btn.addEventListener("click", () => {
        if (on_add_card) on_add_card(deck_name);
    });
    primary_group.appendChild(add_card_btn);
    const import_btn = document.createElement("button");
    import_btn.type = "button";
    import_btn.id = "btn-deck-detail-import";
    import_btn.className = "btn";
    import_btn.textContent = "Import";
    import_btn.addEventListener("click", () => {
        if (on_import) on_import(deck_name);
    });
    primary_group.appendChild(import_btn);
    actions_row.appendChild(primary_group);
    const secondary_group = document.createElement("div");
    secondary_group.className = "deck-actions-secondary";
    const export_csv_btn = document.createElement("button");
    export_csv_btn.type = "button";
    export_csv_btn.id = "btn-deck-detail-export-csv";
    export_csv_btn.className = "btn btn-sm";
    export_csv_btn.textContent = "Export CSV";
    export_csv_btn.addEventListener("click", () => {
        if (on_export_csv) on_export_csv(deck_name);
    });
    secondary_group.appendChild(export_csv_btn);
    const export_json_btn = document.createElement("button");
    export_json_btn.type = "button";
    export_json_btn.id = "btn-deck-detail-export-json";
    export_json_btn.className = "btn btn-sm";
    export_json_btn.textContent = "Export JSON";
    export_json_btn.addEventListener("click", () => {
        if (on_export_json) on_export_json(deck_name);
    });
    secondary_group.appendChild(export_json_btn);
    actions_row.appendChild(secondary_group);
    const delete_deck_btn = document.createElement("button");
    delete_deck_btn.type = "button";
    delete_deck_btn.id = "btn-deck-detail-delete";
    delete_deck_btn.className = "btn btn-sm btn-danger";
    delete_deck_btn.style.marginLeft = "auto";
    delete_deck_btn.textContent = "Delete Deck";
    delete_deck_btn.addEventListener("click", async () => {
        const confirmed = await show_confirm_dialog({
            title: "Delete Deck",
            message: `Are you sure you want to delete "${deck_name}" and all its cards? This action cannot be undone.`,
            confirm_text: "Delete Deck",
            danger: true
        });
        if (confirmed) {
            if (on_delete_deck) on_delete_deck(deck_name);
        }
    });
    actions_row.appendChild(delete_deck_btn);
    header_card.appendChild(actions_row);
    detail_wrap.appendChild(header_card);
    const search_row = document.createElement("div");
    search_row.className = "deck-detail-search-row";
    const search_input = document.createElement("input");
    search_input.type = "text";
    search_input.id = "deck-detail-search-input";
    search_input.className = "search-input";
    search_input.placeholder = "Search cards in this deck...";
    search_input.style.maxWidth = "360px";
    const count_indicator = document.createElement("span");
    count_indicator.id = "deck-detail-cards-count";
    count_indicator.className = "stat-label";
    count_indicator.textContent = `Showing ${cards.length} cards`;
    search_row.appendChild(search_input);
    search_row.appendChild(count_indicator);
    detail_wrap.appendChild(search_row);
    const cards_container = document.createElement("div");
    cards_container.id = "deck-detail-cards-list";
    cards_container.className = "deck-detail-cards-container";
    function render_card_rows(filter_text = "") {
        cards_container.innerHTML = "";
        const query = (filter_text || "").trim().toLowerCase();
        const filtered = cards.filter((c) => {
            if (!query) return true;
            return (c.question || "").toLowerCase().includes(query) ||
                   (c.answer || "").toLowerCase().includes(query);
        });
        count_indicator.textContent = `Showing ${filtered.length} of ${cards.length} cards`;
        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = `<p>${cards.length === 0 ? "No cards in this deck yet. Add one above!" : "No cards match your search."}</p>`;
            cards_container.appendChild(empty);
            return;
        }
        for (const card of filtered) {
            const row = document.createElement("div");
            row.className = "card-row";
            row.dataset.id = card.id;
            const content = document.createElement("div");
            content.className = "card-content";
            const q = document.createElement("div");
            q.className = "card-question";
            q.textContent = card.question;
            const a = document.createElement("div");
            a.className = "card-answer";
            a.textContent = card.answer;
            content.appendChild(q);
            content.appendChild(a);
            row.appendChild(content);
            const card_actions = document.createElement("div");
            card_actions.className = "card-actions";
            const edit_btn = document.createElement("button");
            edit_btn.type = "button";
            edit_btn.className = "btn btn-sm";
            edit_btn.textContent = "Edit";
            edit_btn.addEventListener("click", () => {
                if (on_edit_card) on_edit_card(card);
            });
            card_actions.appendChild(edit_btn);
            const delete_btn = document.createElement("button");
            delete_btn.type = "button";
            delete_btn.className = "btn btn-sm btn-danger";
            delete_btn.textContent = "Delete";
            delete_btn.addEventListener("click", async () => {
                const confirmed = await show_confirm_dialog({
                    title: "Delete Card",
                    message: "Are you sure you want to delete this card?",
                    confirm_text: "Delete",
                    danger: true
                });
                if (confirmed) {
                    if (on_delete_card) on_delete_card(card.id, deck_name);
                }
            });
            card_actions.appendChild(delete_btn);
            row.appendChild(card_actions);
            cards_container.appendChild(row);
        }
    }
    search_input.addEventListener("input", (e) => {
        render_card_rows(e.target.value);
    });
    render_card_rows();
    detail_wrap.appendChild(cards_container);
    container.appendChild(detail_wrap);
}