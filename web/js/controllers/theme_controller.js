function get_saved_theme_choice() {
    return localStorage.getItem("genera_theme") || "system";
}
function get_effective_theme(choice) {
    if (choice === "dark" || choice === "light") {
        return choice;
    }
    const prefers_dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefers_dark ? "dark" : "light";
}
function apply_theme(choice) {
    const effective = get_effective_theme(choice);
    document.documentElement.setAttribute("data-theme", effective);
    if (choice === "system") {
        localStorage.removeItem("genera_theme");
    } else {
        localStorage.setItem("genera_theme", choice);
    }
    update_theme_ui(choice, effective);
}
const SUN_ICON_SVG = `<svg class="theme-icon theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const MOON_ICON_SVG = `<svg class="theme-icon theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
function update_theme_ui(choice, effective) {
    const toggle_btn = document.getElementById("btn-theme-toggle");
    if (toggle_btn) {
        const is_dark = effective === "dark";
        if (!toggle_btn.querySelector(".theme-icon")) {
            toggle_btn.innerHTML = `${SUN_ICON_SVG}${MOON_ICON_SVG}`;
        }
        toggle_btn.setAttribute("aria-label", is_dark ? "Switch to light mode" : "Switch to dark mode");
        toggle_btn.setAttribute("aria-pressed", is_dark ? "true" : "false");
        toggle_btn.title = is_dark ? "Switch to light mode" : "Switch to dark mode";
    }
    const badge = document.getElementById("settings-theme-badge");
    if (badge) {
        if (choice === "system") {
            badge.textContent = `System (${effective === "dark" ? "Dark" : "Light"})`;
        } else {
            badge.textContent = choice === "dark" ? "Dark" : "Light";
        }
    }
    const btn_light = document.getElementById("btn-theme-light");
    const btn_dark = document.getElementById("btn-theme-dark");
    const btn_system = document.getElementById("btn-theme-system");
    if (btn_light) {
        btn_light.classList.toggle("active", choice === "light");
        btn_light.setAttribute("aria-selected", choice === "light" ? "true" : "false");
        btn_light.setAttribute("tabindex", choice === "light" ? "0" : "-1");
    }
    if (btn_dark) {
        btn_dark.classList.toggle("active", choice === "dark");
        btn_dark.setAttribute("aria-selected", choice === "dark" ? "true" : "false");
        btn_dark.setAttribute("tabindex", choice === "dark" ? "0" : "-1");
    }
    if (btn_system) {
        btn_system.classList.toggle("active", choice === "system");
        btn_system.setAttribute("aria-selected", choice === "system" ? "true" : "false");
        btn_system.setAttribute("tabindex", choice === "system" ? "0" : "-1");
    }
}
export function init_theme() {
    const choice = get_saved_theme_choice();
    apply_theme(choice);
    const toggle_btn = document.getElementById("btn-theme-toggle");
    if (toggle_btn) {
        toggle_btn.addEventListener("click", () => {
            const current_effective = document.documentElement.getAttribute("data-theme") || "light";
            const new_choice = current_effective === "dark" ? "light" : "dark";
            apply_theme(new_choice);
        });
    }
    const btn_light = document.getElementById("btn-theme-light");
    const btn_dark = document.getElementById("btn-theme-dark");
    const btn_system = document.getElementById("btn-theme-system");
    if (btn_light) btn_light.addEventListener("click", () => apply_theme("light"));
    if (btn_dark) btn_dark.addEventListener("click", () => apply_theme("dark"));
    if (btn_system) btn_system.addEventListener("click", () => apply_theme("system"));
    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (get_saved_theme_choice() === "system") {
                apply_theme("system");
            }
        });
    }
}