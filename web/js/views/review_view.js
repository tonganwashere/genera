import { count_session_cards } from "../models/session.js";
import {
    get_today_date,
    get_all_catalog_cards,
    get_all_own_cards,
    get_all_progress_rows,
    get_user_settings
} from "../models/localdb.js";

export async function create_start_screen({ current_mode, on_mode_change, on_start }) {
    const start_card = document.createElement("div");
    start_card.className = "review-start-card";

    const title = document.createElement("h2");
    title.textContent = "Start Review Session";

    const desc = document.createElement("p");
    desc.className = "review-start-desc";
    desc.textContent = "Cards are selected based on your Leitner spaced-repetition schedule.";

    const options_div = document.createElement("div");
    options_div.className = "segmented-control review-mode-toggle";
    options_div.setAttribute("role", "tablist");

    const btn_all = document.createElement("button");
    btn_all.type = "button";
    btn_all.className = `segmented-btn ${current_mode === "everything" ? "active" : ""}`;
    btn_all.textContent = "Everything (Official + Mine)";
    btn_all.setAttribute("role", "tab");
    btn_all.setAttribute("aria-selected", current_mode === "everything" ? "true" : "false");
    btn_all.addEventListener("click", () => {
        btn_all.classList.add("active");
        btn_all.setAttribute("aria-selected", "true");
        btn_mine.classList.remove("active");
        btn_mine.setAttribute("aria-selected", "false");
        if (on_mode_change) on_mode_change("everything");
    });

    const btn_mine = document.createElement("button");
    btn_mine.type = "button";
    btn_mine.className = `segmented-btn ${current_mode === "only_mine" ? "active" : ""}`;
    btn_mine.textContent = "Only My Cards";
    btn_mine.setAttribute("role", "tab");
    btn_mine.setAttribute("aria-selected", current_mode === "only_mine" ? "true" : "false");
    btn_mine.addEventListener("click", () => {
        btn_mine.classList.add("active");
        btn_mine.setAttribute("aria-selected", "true");
        btn_all.classList.remove("active");
        btn_all.setAttribute("aria-selected", "false");
        if (on_mode_change) on_mode_change("only_mine");
    });

    options_div.appendChild(btn_all);
    options_div.appendChild(btn_mine);

    const catalog_cards = await get_all_catalog_cards();
    const own_cards = await get_all_own_cards(false);
    const progress_rows = await get_all_progress_rows();
    const settings = await get_user_settings();
    const today = get_today_date();

    const counts = count_session_cards({
        catalog_cards: current_mode === "only_mine" ? [] : catalog_cards,
        own_cards,
        progress_rows,
        settings,
        today
    });

    start_card.appendChild(title);
    start_card.appendChild(desc);
    start_card.appendChild(options_div);

    if (counts.total_visible === 0) {
        const empty_p = document.createElement("p");
        empty_p.className = "review-start-desc";
        empty_p.style.textAlign = "center";
        empty_p.style.padding = "var(--space-4) 0";
        empty_p.textContent = current_mode === "only_mine"
            ? "You have not created any custom cards yet. Switch to Everything or add cards in the Cards tab."
            : "Your collection has no cards available for review. Check back once catalog is loaded or add cards in the Cards tab.";
        start_card.appendChild(empty_p);
        return start_card;
    }

    const eligible_count = counts.due_count + counts.new_left_count + counts.unseen_own_count;
    if (eligible_count === 0) {
        const empty_p = document.createElement("p");
        empty_p.className = "review-start-desc";
        empty_p.style.textAlign = "center";
        empty_p.style.padding = "var(--space-4) 0";
        empty_p.textContent = "All caught up! No cards are due for review right now, and you have reached your daily limit for new cards. Check back tomorrow!";
        start_card.appendChild(empty_p);
        return start_card;
    }

    const stats_row = document.createElement("div");
    stats_row.className = "review-stats-badge-row";

    const due_badge = document.createElement("span");
    due_badge.className = "badge badge-mine review-stat-badge";
    due_badge.textContent = `${counts.due_count} Due Today`;

    const new_badge = document.createElement("span");
    new_badge.className = "badge badge-official review-stat-badge";
    new_badge.textContent = `${counts.new_left_count + counts.unseen_own_count} New Ready`;

    stats_row.appendChild(due_badge);
    stats_row.appendChild(new_badge);

    const start_btn = document.createElement("button");
    start_btn.id = "btn-start-session";
    start_btn.className = "btn btn-primary btn-block";
    start_btn.textContent = "Start Review";
    start_btn.addEventListener("click", async () => {
        if (on_start) await on_start(start_btn);
    });

    start_card.appendChild(stats_row);
    start_card.appendChild(start_btn);
    return start_card;
}

export function create_active_card_elements({ card, index, total, is_flipped, on_quit, on_flip, on_rate }) {
    const fragment = document.createDocumentFragment();

    const header = document.createElement("div");
    header.className = "review-header";

    const badges = document.createElement("div");
    badges.className = "review-meta-badges";

    const cat_badge = document.createElement("span");
    cat_badge.className = "badge";
    cat_badge.textContent = card.category;
    badges.appendChild(cat_badge);

    const source_badge = document.createElement("span");
    source_badge.className = card.card_kind === "catalog" ? "badge badge-official" : "badge badge-mine";
    source_badge.textContent = card.card_kind === "catalog" ? "Official" : "Mine";
    badges.appendChild(source_badge);

    const box_badge = document.createElement("span");
    box_badge.className = "badge";
    box_badge.textContent = card.is_new ? "New" : `Box ${card.progress?.box || 1}`;
    badges.appendChild(box_badge);

    const progress_indicator = document.createElement("div");
    progress_indicator.className = "review-progress-text";
    progress_indicator.textContent = `${index + 1} of ${total}`;

    const quit_btn = document.createElement("button");
    quit_btn.className = "btn btn-sm";
    quit_btn.textContent = "Quit";
    quit_btn.addEventListener("click", () => {
        if (on_quit) on_quit();
    });

    header.appendChild(badges);
    header.appendChild(progress_indicator);
    header.appendChild(quit_btn);
    fragment.appendChild(header);

    const scene = document.createElement("div");
    scene.className = "flashcard-scene";

    const flashcard = document.createElement("div");
    flashcard.id = "active-flashcard";
    flashcard.className = `flashcard-card ${is_flipped ? "flipped" : ""}`;
    flashcard.setAttribute("role", "button");
    flashcard.setAttribute("tabindex", "0");
    flashcard.setAttribute("aria-label", "Flashcard. Click or press Space to flip.");

    const front = document.createElement("div");
    front.className = "flashcard-face flashcard-front";

    const q_el = document.createElement("div");
    q_el.className = "review-question";
    q_el.textContent = card.question;

    const front_hint = document.createElement("div");
    front_hint.className = "flashcard-hint";
    front_hint.textContent = "Click or Space to flip";

    front.appendChild(q_el);
    front.appendChild(front_hint);

    const back = document.createElement("div");
    back.className = "flashcard-face flashcard-back";

    const a_el = document.createElement("div");
    a_el.className = "review-answer";
    a_el.textContent = card.answer;

    const back_hint = document.createElement("div");
    back_hint.className = "flashcard-hint";
    back_hint.textContent = "Click or Space to flip back";

    back.appendChild(a_el);
    back.appendChild(back_hint);

    flashcard.appendChild(front);
    flashcard.appendChild(back);
    scene.appendChild(flashcard);
    fragment.appendChild(scene);

    const actions_bar = document.createElement("div");
    actions_bar.id = "review-actions-bar";
    actions_bar.className = "review-actions-bar";
    render_actions_bar_content(actions_bar, is_flipped, on_flip, on_rate);
    fragment.appendChild(actions_bar);

    flashcard.addEventListener("click", () => {
        if (on_flip) on_flip();
    });

    flashcard.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (on_flip) on_flip();
        }
    });

    return fragment;
}

export function render_actions_bar_content(actions_bar, is_flipped, on_flip, on_rate) {
    actions_bar.innerHTML = "";

    if (!is_flipped) {
        const flip_btn = document.createElement("button");
        flip_btn.id = "btn-flip-card";
        flip_btn.className = "btn btn-primary";
        flip_btn.textContent = "Flip (Space)";
        flip_btn.addEventListener("click", () => {
            if (on_flip) on_flip();
        });
        actions_bar.appendChild(flip_btn);
    } else {
        const wrong_btn = document.createElement("button");
        wrong_btn.id = "btn-rate-wrong";
        wrong_btn.className = "btn btn-danger";
        wrong_btn.textContent = "Wrong (1)";
        wrong_btn.addEventListener("click", async () => {
            if (on_rate) await on_rate(false);
        });

        const right_btn = document.createElement("button");
        right_btn.id = "btn-rate-right";
        right_btn.className = "btn btn-success";
        right_btn.textContent = "Right (2)";
        right_btn.addEventListener("click", async () => {
            if (on_rate) await on_rate(true);
        });

        const flip_back_btn = document.createElement("button");
        flip_back_btn.id = "btn-flip-back";
        flip_back_btn.className = "btn";
        flip_back_btn.textContent = "Flip Back";
        flip_back_btn.title = "Flip back to question";
        flip_back_btn.addEventListener("click", () => {
            if (on_flip) on_flip();
        });

        actions_bar.appendChild(wrong_btn);
        actions_bar.appendChild(right_btn);
        actions_bar.appendChild(flip_back_btn);
    }
}

export function create_finished_screen({ stats, on_done }) {
    const finished_card = document.createElement("div");
    finished_card.className = "review-finished-card";

    const title = document.createElement("h2");
    title.textContent = "Session Complete!";

    const total_reviewed = stats.right + stats.wrong;
    const msg = document.createElement("p");
    msg.className = "card-answer";
    msg.textContent = `You reviewed ${total_reviewed} card(s).`;

    const stats_row = document.createElement("div");
    stats_row.className = "review-finished-stats";

    const right_stat = document.createElement("span");
    right_stat.style.color = "var(--color-green)";
    right_stat.style.fontWeight = "600";
    right_stat.textContent = `${stats.right} Right`;

    const wrong_stat = document.createElement("span");
    wrong_stat.style.color = "var(--color-red)";
    wrong_stat.style.fontWeight = "600";
    wrong_stat.textContent = `${stats.wrong} Wrong`;

    stats_row.appendChild(right_stat);
    stats_row.appendChild(wrong_stat);

    const action_btn = document.createElement("button");
    action_btn.className = "btn btn-primary";
    action_btn.textContent = "Done";
    action_btn.addEventListener("click", () => {
        if (on_done) on_done();
    });

    finished_card.appendChild(title);
    finished_card.appendChild(msg);
    finished_card.appendChild(stats_row);
    finished_card.appendChild(action_btn);
    return finished_card;
}