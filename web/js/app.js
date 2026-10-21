import {
    get_all_catalog_cards,
    get_all_own_cards,
    get_all_progress_rows,
    get_today_date,
    get_user_settings,
    get_meta,
    set_meta_batch,
    load_catalog_if_needed
} from "./models/localdb.js";
import { count_session_cards } from "./models/session.js";
import { populate_category_dropdown, render_cards_view } from "./views/cards_view.js";
import { setup_cards_listeners } from "./controllers/cards_controller.js";
import { init_review_controller, render_review_view } from "./controllers/review_controller.js";
import { render_settings_view, render_account_section } from "./views/settings_view.js";
import { init_settings_controller } from "./controllers/settings_controller.js";
import { init_auth_controller } from "./controllers/auth_controller.js";
import { init_sync_engine, update_sync_status_ui, sync_now } from "./controllers/sync_controller.js";
import { init_import_controller } from "./controllers/import_controller.js";
import { init_theme } from "./controllers/theme_controller.js";

function update_tab_indicator(active_btn, animate = true) {
    const indicator = document.querySelector(".tab-indicator");
    if (!indicator || !active_btn) return;
    if (!animate) {
        indicator.style.transition = "none";
    } else {
        indicator.style.transition = "";
    }
    indicator.style.transform = `translateX(${active_btn.offsetLeft}px)`;
    indicator.style.width = `${active_btn.offsetWidth}px`;
    indicator.style.height = `${active_btn.offsetHeight}px`;
    indicator.style.top = `${active_btn.offsetTop}px`;
}

const tabs = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");

tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => (p.hidden = true));

        btn.classList.add("active");
        update_tab_indicator(btn, true);
        const panel = document.getElementById(`tab-${btn.dataset.tab}`);
        if (panel) {
            panel.hidden = false;
            if (btn.dataset.tab === "cards") {
                refresh_cards_view();
            } else if (btn.dataset.tab === "review") {
                render_review_view();
            } else if (btn.dataset.tab === "dashboard") {
                update_dashboard_stats();
            } else if (btn.dataset.tab === "settings") {
                render_settings_view();
            }
        }
    });
});

const initial_active_tab = document.querySelector(".tab-btn.active");
if (initial_active_tab) {
    update_tab_indicator(initial_active_tab, false);
}

window.addEventListener("resize", () => {
    const current = document.querySelector(".tab-btn.active");
    if (current) update_tab_indicator(current, false);
});

if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
        const current = document.querySelector(".tab-btn.active");
        if (current) update_tab_indicator(current, false);
    });
}

const logo_btn = document.getElementById("brand-logo");
if (logo_btn) {
    logo_btn.addEventListener("click", async () => {
        const dashboard_tab_btn = document.querySelector('.tab-btn[data-tab="dashboard"]');
        if (dashboard_tab_btn) {
            dashboard_tab_btn.click();
        }
        await update_sync_status_ui();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
}

async function refresh_cards_view() {
    await populate_category_dropdown();
    await render_cards_view(update_dashboard_stats, true);
}

async function update_dashboard_stats() {
    try {
        const [catalog_cards, own_cards, progress_rows, settings] = await Promise.all([
            get_all_catalog_cards(),
            get_all_own_cards(false),
            get_all_progress_rows(),
            get_user_settings()
        ]);
        const today = get_today_date();

        const counts = count_session_cards({
            catalog_cards,
            own_cards,
            progress_rows,
            settings,
            today
        });

        const due_el = document.querySelector(".due-count");
        const new_el = document.querySelector(".new-count");
        const total_el = document.querySelector(".total-count");
        const unseen_el = document.querySelector(".unseen-count");

        if (due_el) due_el.textContent = counts.due_count;
        if (new_el) new_el.textContent = counts.new_left_count;
        if (total_el) total_el.textContent = counts.total_visible;
        if (unseen_el) unseen_el.textContent = counts.unseen_count;

        const box_items = document.querySelectorAll(".box-item strong");
        if (box_items.length === 5) {
            for (let i = 1; i <= 5; i++) {
                box_items[i - 1].textContent = counts.box_counts[i] || 0;
            }
        }

        render_dashboard_message(counts);
    } catch (err) {
        console.error("Failed to update dashboard stats:", err);
        const container = document.getElementById("dashboard-message");
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>Unable to load dashboard data. Please refresh the page.</p></div>';
        }
    }
}

function render_dashboard_message(counts) {
    const container = document.getElementById("dashboard-message");
    if (!container) return;

    container.innerHTML = "";

    const active_ready_count = counts.due_count + counts.new_left_count + counts.unseen_own_count;

    if (counts.total_visible === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const p = document.createElement("p");
        p.textContent = "No cards available in your collection. Check back once catalog is loaded or add your own cards in the Cards tab.";
        empty.appendChild(p);
        container.appendChild(empty);
    } else if (active_ready_count === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const p = document.createElement("p");
        p.textContent = "You're all caught up for today! No cards are due for review.";
        empty.appendChild(p);
        container.appendChild(empty);
    } else {
        const action_card = document.createElement("div");
        action_card.className = "dashboard-action-card";

        const p = document.createElement("p");
        p.textContent = `${counts.due_count} card(s) due, ${counts.new_left_count + counts.unseen_own_count} new card(s) ready for study today.`;

        const btn = document.createElement("button");
        btn.id = "btn-dashboard-start-review";
        btn.className = "btn btn-primary";
        btn.textContent = "Start Review";
        btn.addEventListener("click", () => {
            const review_tab_btn = document.querySelector('.tab-btn[data-tab="review"]');
            if (review_tab_btn) {
                review_tab_btn.click();
            }
        });

        action_card.appendChild(p);
        action_card.appendChild(btn);
        container.appendChild(action_card);
    }
}
async function init_app() {
    async function refresh_all() {
        await update_dashboard_stats();
        await refresh_cards_view();
        await render_review_view();
        await render_account_section();
        await update_sync_status_ui();
    }

    try {
        init_theme();
        setup_cards_listeners(refresh_all);
        init_import_controller(refresh_all);
        init_review_controller(async () => {
            await update_dashboard_stats();
            await update_sync_status_ui();
            await render_account_section();
            await sync_now(refresh_all);
        });
        init_auth_controller(refresh_all);
        init_settings_controller(refresh_all);

        if (navigator.onLine) {
            try {
                const me_res = await fetch("/api/me");
                if (me_res.ok) {
                    const me_data = await me_res.json();
                    await set_meta_batch({
                        mode: "account",
                        username: me_data.username,
                        email: me_data.email || null,
                        email_verified: me_data.email_verified || 0,
                        csrf_token: me_data.csrf_token || null
                    });
                } else if (me_res.status === 401) {
                    const current_mode = await get_meta("mode");
                    if (current_mode === "account") {
                        await set_meta_batch({
                            mode: "local",
                            username: null,
                            email: null,
                            email_verified: 0,
                            csrf_token: null
                        });
                    }
                }
            } catch (_) {}
        }

        await update_sync_status_ui();
        await render_account_section();

        try {
            await load_catalog_if_needed();
        } catch (cat_err) {
            console.error("Failed to check/load catalog:", cat_err);
        }

        await update_dashboard_stats();
        await refresh_cards_view();
        await init_sync_engine(refresh_all);
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

init_app();