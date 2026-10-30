/**
 * Toast View: Non-blocking transient notification feedback.
 */
import { escape_html } from "./view_utils.js";

/**
 * Displays a non-blocking toast notification.
 *
 * @param {string} message - Notification text to display.
 * @param {"info" | "success" | "warning" | "error"} [type="info"] - Severity/style.
 * @param {number} [duration=3500] - Duration in ms before auto-dismiss (0 for persistent).
 * @returns {HTMLElement|null} The created toast element, or null if DOM is unavailable.
 */
export function show_toast(message, type = "info", duration = 3500) {
    if (typeof document === "undefined" || !message) {
        return null;
    }

    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        container.setAttribute("role", "region");
        container.setAttribute("aria-live", "polite");
        container.setAttribute("aria-label", "Notifications");
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "status");

    const icons = {
        info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
    };

    const iconSvg = icons[type] || icons.info;

    toast.innerHTML = `
        <span class="toast-icon">${iconSvg}</span>
        <span class="toast-text">${escape_html(message)}</span>
        <button type="button" class="toast-close-btn" aria-label="Dismiss notification">&times;</button>
    `;

    function dismiss() {
        if (!toast.classList.contains("toast-leaving")) {
            toast.classList.add("toast-leaving");
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 250);
        }
    }

    const close_btn = toast.querySelector(".toast-close-btn");
    if (close_btn) {
        close_btn.onclick = dismiss;
    }

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(dismiss, duration);
    }

    return toast;
}
