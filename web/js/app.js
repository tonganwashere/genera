import {
    get_meta,
    set_meta_batch,
    load_catalog_if_needed
} from "./models/localdb.js";
import { init_home_controller, render_home_tab } from "./controllers/home_controller.js";
import { init_study_controller, render_study_view, set_study_deck } from "./controllers/study_controller.js";
import { init_trivia_controller, render_trivia_view } from "./controllers/trivia_controller.js";
import { render_settings_view, render_account_section } from "./views/settings_view.js";
import {
    init_settings_controller,
    open_privacy_modal,
    open_terms_modal
} from "./controllers/settings_controller.js";
import { init_auth_controller } from "./controllers/auth_controller.js";
import { init_sync_engine, update_sync_status_ui, sync_now } from "./controllers/sync_controller.js";
import { init_theme } from "./controllers/theme_controller.js";
const VALID_TABS = ["home", "study", "trivia", "settings"];
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
export function set_page_title(tab_name, options = {}) {
    if (tab_name === "home") {
        document.title = "Genera · Spaced Repetition Flashcards";
    } else if (tab_name === "study") {
        if (options.deck_name) {
            document.title = `Study: ${options.deck_name} · Genera`;
        } else {
            document.title = "Study · Genera";
        }
    } else if (tab_name === "trivia") {
        document.title = "Trivia Challenge · Genera";
    } else if (tab_name === "settings") {
        document.title = "Settings · Genera";
    } else if (tab_name === "404") {
        document.title = "404 Not Found · Genera";
    }
}
export function show_404_view() {
    const tabs = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".tab-panel");
    tabs.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
        b.setAttribute("tabindex", "-1");
    });
    panels.forEach((p) => {
        p.hidden = p.id !== "tab-not-found";
    });
    const indicator = document.querySelector(".tab-indicator");
    if (indicator) {
        indicator.style.width = "0px";
    }
    set_page_title("404");
    window.scrollTo({ top: 0, behavior: "smooth" });
}
export function navigate_to_tab(tab_name, options = {}) {
    if (!VALID_TABS.includes(tab_name)) {
        throw new Error(`Invalid tab name: ${tab_name}. Expected one of: ${VALID_TABS.join(", ")}`);
    }
    const not_found_panel = document.getElementById("tab-not-found");
    if (not_found_panel) not_found_panel.hidden = true;
    const tabs = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".tab-panel");
    tabs.forEach((b) => {
        const is_active = b.dataset.tab === tab_name;
        b.classList.toggle("active", is_active);
        b.setAttribute("aria-selected", is_active ? "true" : "false");
        b.setAttribute("tabindex", is_active ? "0" : "-1");
        if (is_active) {
            update_tab_indicator(b, true);
        }
    });
    panels.forEach((p) => {
        p.hidden = p.id !== `tab-${tab_name}`;
    });
    set_page_title(tab_name, options);
    if (options.update_hash !== false) {
        let target_hash = `#${tab_name}`;
        if (tab_name === "study" && options.deck_name) {
            target_hash = `#study?deck=${encodeURIComponent(options.deck_name)}`;
        }
        if (window.location.hash !== target_hash) {
            history.pushState(null, "", target_hash);
        }
    }
    if (tab_name === "home") {
        render_home_tab();
    } else if (tab_name === "study") {
        if (options.deck_name) {
            set_study_deck(options.deck_name);
        } else {
            render_study_view();
        }
    } else if (tab_name === "trivia") {
        render_trivia_view();
    } else if (tab_name === "settings") {
        render_settings_view();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}
export function handle_hash_route() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw || raw === "home") {
        navigate_to_tab("home", { update_hash: false });
        return;
    }
    if (raw.startsWith("study")) {
        const parts = raw.split("?");
        const params = new URLSearchParams(parts[1] || "");
        const deck_name = params.get("deck");
        navigate_to_tab("study", { deck_name, update_hash: false });
        return;
    }
    if (raw === "trivia") {
        navigate_to_tab("trivia", { update_hash: false });
        return;
    }
    if (raw === "settings") {
        navigate_to_tab("settings", { update_hash: false });
        return;
    }
    if (raw === "privacy") {
        navigate_to_tab("settings", { update_hash: false });
        open_privacy_modal();
        return;
    }
    if (raw === "terms") {
        navigate_to_tab("settings", { update_hash: false });
        open_terms_modal();
        return;
    }
    show_404_view();
}
function setup_tab_navigation() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach((btn, index) => {
        const is_active = btn.classList.contains("active");
        btn.setAttribute("tabindex", is_active ? "0" : "-1");
        btn.setAttribute("aria-selected", is_active ? "true" : "false");
        btn.addEventListener("click", () => {
            navigate_to_tab(btn.dataset.tab);
        });
        btn.addEventListener("keydown", (e) => {
            let target_index = null;
            if (e.key === "ArrowRight") {
                target_index = (index + 1) % tabs.length;
            } else if (e.key === "ArrowLeft") {
                target_index = (index - 1 + tabs.length) % tabs.length;
            } else if (e.key === "Home") {
                target_index = 0;
            } else if (e.key === "End") {
                target_index = tabs.length - 1;
            }
            if (target_index !== null) {
                e.preventDefault();
                const target_btn = tabs[target_index];
                target_btn.focus();
                target_btn.click();
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
            navigate_to_tab("home");
            await update_sync_status_ui();
        });
    }
    const btn_404_home = document.getElementById("btn-not-found-home");
    if (btn_404_home) {
        btn_404_home.addEventListener("click", () => {
            navigate_to_tab("home");
        });
    }
    window.addEventListener("popstate", handle_hash_route);
    window.addEventListener("hashchange", handle_hash_route);
}
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.update();
    });
}
async function init_app() {
    async function refresh_all() {
        await render_home_tab();
        await render_account_section();
        await update_sync_status_ui();
    }
    try {
        init_theme();
        setup_tab_navigation();
        init_home_controller({
            on_navigate_to_study: (deck) => navigate_to_tab("study", { deck_name: deck }),
            on_data_change: refresh_all
        });
        init_study_controller({
            on_data_change: async () => {
                await render_home_tab();
                await update_sync_status_ui();
                await sync_now(refresh_all);
            },
            on_navigate_home: () => navigate_to_tab("home")
        });
        init_trivia_controller({
            on_data_change: async () => {
                await render_home_tab();
                await update_sync_status_ui();
                await sync_now(refresh_all);
            },
            on_navigate_home: () => navigate_to_tab("home")
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
        if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
            history.replaceState(null, "", "#home");
        }
        handle_hash_route();
        await init_sync_engine(refresh_all);
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}
init_app();