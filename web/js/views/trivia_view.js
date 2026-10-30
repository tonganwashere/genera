import { escape_html } from "./view_utils.js";

export function create_trivia_start_screen({
    categories = [],
    selected_categories = new Set(),
    sub_mode = "scheduled",
    daily_limit = 10,
    on_toggle_category,
    on_select_all_categories,
    on_clear_all_categories,
    on_mode_change,
    on_start
}) {
    const card = document.createElement("div");
    card.className = "trivia-start-card";
    card.innerHTML = `
        <div class="trivia-header-block">
            <h2 class="trivia-title">Open Trivia Quiz</h2>
            <p class="trivia-desc">Test your general knowledge across ~4,500 questions from the Open Trivia Database.</p>
        </div>
    `;
    const chips_section = document.createElement("div");
    chips_section.className = "trivia-chips-container";
    const chips_header = document.createElement("div");
    chips_header.className = "trivia-chips-header";
    chips_header.innerHTML = `
        <label style="font-weight: 600;">Trivia Categories</label>
        <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-trivia-select-all" class="btn btn-sm">Select All</button>
            <button type="button" id="btn-trivia-clear-all" class="btn btn-sm">Clear All</button>
        </div>
    `;
    chips_section.appendChild(chips_header);
    const chips_grid = document.createElement("div");
    chips_grid.className = "trivia-chips-grid";
    for (const cat of categories) {
        const chip = document.createElement("button");
        chip.type = "button";
        const is_active = selected_categories.size === 0 || selected_categories.has(cat);
        chip.className = `trivia-chip ${is_active ? "active" : ""}`;
        if (typeof chip.setAttribute === "function") {
            chip.setAttribute("role", "button");
            chip.setAttribute("aria-pressed", is_active ? "true" : "false");
        }
        chip.textContent = cat;
        chip.dataset.category = cat;
        chip.addEventListener("click", () => {
            const next_state = on_toggle_category(cat);
            if (chip.classList) chip.classList.toggle("active", !!next_state);
            if (typeof chip.setAttribute === "function") {
                chip.setAttribute("aria-pressed", next_state ? "true" : "false");
            }
        });
        chips_grid.appendChild(chip);
    }
    chips_section.appendChild(chips_grid);
    const select_all_btn = chips_header.querySelector("#btn-trivia-select-all");
    if (select_all_btn) {
        select_all_btn.addEventListener("click", () => {
            on_select_all_categories();
            const all_chips = chips_grid.querySelectorAll ? chips_grid.querySelectorAll(".trivia-chip") : [];
            all_chips.forEach((c) => {
                if (c.classList) c.classList.add("active");
                if (typeof c.setAttribute === "function") c.setAttribute("aria-pressed", "true");
            });
        });
    }
    const clear_all_btn = chips_header.querySelector("#btn-trivia-clear-all");
    if (clear_all_btn) {
        clear_all_btn.addEventListener("click", () => {
            on_clear_all_categories();
            const all_chips = chips_grid.querySelectorAll ? chips_grid.querySelectorAll(".trivia-chip") : [];
            all_chips.forEach((c) => {
                if (c.classList) c.classList.remove("active");
                if (typeof c.setAttribute === "function") c.setAttribute("aria-pressed", "false");
            });
        });
    }
    card.appendChild(chips_section);
    const mode_wrap = document.createElement("div");
    mode_wrap.className = "sub-mode-selector";
    mode_wrap.innerHTML = `<label id="trivia-mode-label" style="font-weight: 600;">Quiz Mode</label>`;
    const pills = document.createElement("div");
    pills.className = "sub-mode-pills";
    if (typeof pills.setAttribute === "function") {
        pills.setAttribute("role", "radiogroup");
        pills.setAttribute("aria-labelledby", "trivia-mode-label");
    }
    const modes = [
        { id: "scheduled", name: "Scheduled", desc: `SRS · Max ${daily_limit} new/day` },
        { id: "freestyle", name: "Freestyle", desc: "Browse questions" },
        { id: "random", name: "Random", desc: "Quick 20 Qs" }
    ];
    const pill_elements = [];
    for (const m of modes) {
        const pill = document.createElement("button");
        pill.type = "button";
        const is_selected = sub_mode === m.id;
        pill.className = `sub-mode-pill ${is_selected ? "active" : ""}`;
        if (typeof pill.setAttribute === "function") {
            pill.setAttribute("role", "radio");
            pill.setAttribute("aria-checked", is_selected ? "true" : "false");
            pill.setAttribute("tabindex", is_selected ? "0" : "-1");
        }
        pill.dataset.mode = m.id;
        pill.innerHTML = `
            <span class="sub-mode-pill-name">${m.name}</span>
            <span class="sub-mode-pill-caption">${m.desc}</span>
        `;
        pill.addEventListener("click", () => {
            const all_pills = pills.querySelectorAll ? pills.querySelectorAll(".sub-mode-pill") : [];
            all_pills.forEach((p) => {
                if (p.classList) p.classList.remove("active");
                if (typeof p.setAttribute === "function") {
                    p.setAttribute("aria-checked", "false");
                    p.setAttribute("tabindex", "-1");
                }
            });
            if (pill.classList) pill.classList.add("active");
            if (typeof pill.setAttribute === "function") {
                pill.setAttribute("aria-checked", "true");
                pill.setAttribute("tabindex", "0");
            }
            if (on_mode_change) on_mode_change(m.id);
        });
        pill_elements.push(pill);
        pills.appendChild(pill);
    }
    pill_elements.forEach((pill, idx) => {
        pill.addEventListener("keydown", (e) => {
            let next_idx = null;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                next_idx = (idx + 1) % pill_elements.length;
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                next_idx = (idx - 1 + pill_elements.length) % pill_elements.length;
            }
            if (next_idx !== null) {
                e.preventDefault();
                const target_pill = pill_elements[next_idx];
                if (typeof target_pill.focus === "function") {
                    target_pill.focus();
                }
                target_pill.click();
            }
        });
    });
    mode_wrap.appendChild(pills);
    card.appendChild(mode_wrap);
    const start_btn = document.createElement("button");
    start_btn.type = "button";
    start_btn.id = "btn-trivia-start";
    start_btn.className = "btn btn-primary btn-block";
    start_btn.textContent = "Start Trivia Quiz";
    start_btn.addEventListener("click", () => {
        if (on_start) on_start(start_btn);
    });
    card.appendChild(start_btn);
    return card;
}
export function create_trivia_active_card({
    card,
    index,
    total,
    is_flipped,
    sub_mode = "scheduled",
    on_quit,
    on_flip,
    on_rate
}) {
    const fragment = document.createDocumentFragment();
    const top_bar = document.createElement("div");
    top_bar.className = "review-top-bar";
    const progress_span = document.createElement("span");
    progress_span.className = "review-progress-text";
    progress_span.textContent = `Question ${index + 1} of ${total}`;
    const mode_badge = document.createElement("span");
    mode_badge.className = "badge";
    mode_badge.textContent = sub_mode === "scheduled" ? "Catalog SRS" : (sub_mode === "freestyle" ? "Trivia Freestyle" : "Trivia Random");
    const quit_btn = document.createElement("button");
    quit_btn.className = "btn btn-sm";
    quit_btn.textContent = "Quit Quiz";
    quit_btn.addEventListener("click", on_quit);
    top_bar.appendChild(progress_span);
    top_bar.appendChild(mode_badge);
    top_bar.appendChild(quit_btn);
    fragment.appendChild(top_bar);
    const scene = document.createElement("div");
    scene.className = "flashcard-scene";
    const flashcard = document.createElement("div");
    flashcard.id = "active-trivia-card";
    flashcard.className = `flashcard ${is_flipped ? "flipped" : ""}`;
    flashcard.addEventListener("click", on_flip);
    const front = document.createElement("div");
    front.className = "card-face card-front";
    if (typeof front.setAttribute === "function") {
        front.setAttribute("aria-hidden", is_flipped ? "true" : "false");
    }
    front.innerHTML = `
        <div class="card-face-header">
            <span class="badge badge-trivia">${escape_html(card.category || "Trivia")}</span>
        </div>
        <div class="card-face-body">
            <p class="card-text">${escape_html(card.question)}</p>
        </div>
        <div class="card-face-footer">
            <span class="hint-text">Click or press Space to see answer</span>
        </div>
    `;
    const back = document.createElement("div");
    back.className = "card-face card-back";
    if (typeof back.setAttribute === "function") {
        back.setAttribute("aria-hidden", is_flipped ? "false" : "true");
    }
    back.innerHTML = `
        <div class="card-face-header">
            <span class="badge badge-trivia">${escape_html(card.category || "Trivia")}</span>
        </div>
        <div class="card-face-body">
            <p class="card-text">${escape_html(card.answer)}</p>
        </div>
        <div class="card-face-footer">
            <span class="hint-text">1 = Incorrect, 2 = Correct</span>
        </div>
    `;
    flashcard.appendChild(front);
    flashcard.appendChild(back);
    scene.appendChild(flashcard);
    fragment.appendChild(scene);
    const actions_bar = document.createElement("div");
    actions_bar.id = "review-actions-bar";
    actions_bar.className = "review-actions-bar";
    render_trivia_actions(actions_bar, is_flipped, on_flip, on_rate);
    fragment.appendChild(actions_bar);
    return fragment;
}
export function render_trivia_actions(bar, is_flipped, on_flip, on_rate) {
    bar.innerHTML = "";
    if (!is_flipped) {
        const flip_btn = document.createElement("button");
        flip_btn.type = "button";
        flip_btn.className = "btn btn-primary";
        flip_btn.textContent = "Show Answer (Space)";
        flip_btn.addEventListener("click", on_flip);
        bar.appendChild(flip_btn);
    } else {
        const wrong_btn = document.createElement("button");
        wrong_btn.type = "button";
        wrong_btn.className = "btn btn-danger";
        wrong_btn.textContent = "Incorrect (1)";
        wrong_btn.addEventListener("click", () => on_rate(false));
        const right_btn = document.createElement("button");
        right_btn.type = "button";
        right_btn.className = "btn btn-success";
        right_btn.textContent = "Correct (2)";
        right_btn.addEventListener("click", () => on_rate(true));
        bar.appendChild(wrong_btn);
        bar.appendChild(right_btn);
    }
}
export function create_trivia_finished_screen({ stats, sub_mode, on_restart, on_home }) {
    const card = document.createElement("div");
    card.className = "review-finished-card";
    const total = stats.right + stats.wrong;
    const accuracy = total > 0 ? Math.round((stats.right / total) * 100) : 0;
    card.innerHTML = `
        <div class="finished-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        </div>
        <h2 class="finished-title">Trivia Round Finished!</h2>
        <p class="finished-desc">${sub_mode === "scheduled" ? "Your trivia Leitner schedule has been updated." : "Casual trivia completed."}</p>
        <div class="finished-stats">
            <div class="finished-stat-item">
                <span class="stat-number stat-correct">${stats.right}</span>
                <span class="stat-label">Correct</span>
            </div>
            <div class="finished-stat-item">
                <span class="stat-number stat-wrong">${stats.wrong}</span>
                <span class="stat-label">Incorrect</span>
            </div>
            <div class="finished-stat-item">
                <span class="stat-number">${accuracy}%</span>
                <span class="stat-label">Score</span>
            </div>
        </div>
        <div class="modal-actions" style="justify-content: center; margin-top: var(--space-4);">
            <button type="button" id="btn-trivia-again" class="btn">Play Again</button>
            <button type="button" id="btn-trivia-back-home" class="btn btn-primary">Back to Home</button>
        </div>
    `;
    const again_btn = card.querySelector("#btn-trivia-again");
    if (again_btn) again_btn.onclick = on_restart;
    const home_btn = card.querySelector("#btn-trivia-back-home");
    if (home_btn) home_btn.onclick = on_home;
    return card;
}