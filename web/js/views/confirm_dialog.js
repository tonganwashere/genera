/**
 * Dialog View: Non-blocking in-app confirmation modal.
 * Uses standard HTML5 <dialog id="confirm-modal">.
 */

/**
 * Displays an in-app non-blocking confirmation dialog.
 * Returns a Promise that resolves to true if the user confirmed, or false if cancelled/closed.
 *
 * @param {Object} options
 * @param {string} [options.title="Confirm Action"] - Dialog title.
 * @param {string} [options.message=""] - Message body describing the action.
 * @param {string} [options.confirm_text="Confirm"] - Text for confirmation button.
 * @param {string} [options.cancel_text="Cancel"] - Text for cancel button.
 * @param {boolean} [options.danger=false] - If true, styles confirm button with .btn-danger; else .btn-primary.
 * @returns {Promise<boolean>}
 */
export function show_confirm_dialog({
    title = "Confirm Action",
    message = "",
    confirm_text = "Confirm",
    cancel_text = "Cancel",
    danger = false
} = {}) {
    if (typeof document === "undefined") {
        return Promise.resolve(true);
    }

    const modal = document.getElementById("confirm-modal");
    if (!modal || typeof modal.showModal !== "function") {
        return Promise.resolve(true);
    }

    const title_el = document.getElementById("confirm-modal-title");
    const msg_el = document.getElementById("confirm-modal-message");
    const confirm_btn = document.getElementById("confirm-modal-confirm-btn");
    const cancel_btn = document.getElementById("confirm-modal-cancel-btn");
    const close_icon = document.getElementById("confirm-modal-close-icon");

    if (title_el) title_el.textContent = title;
    if (msg_el) msg_el.textContent = message;
    if (confirm_btn) {
        confirm_btn.textContent = confirm_text;
        confirm_btn.className = danger ? "btn btn-danger" : "btn btn-primary";
    }
    if (cancel_btn) {
        cancel_btn.textContent = cancel_text;
    }

    return new Promise((resolve) => {
        let settled = false;

        function cleanup(result) {
            if (settled) return;
            settled = true;
            if (confirm_btn) confirm_btn.onclick = null;
            if (cancel_btn) cancel_btn.onclick = null;
            if (close_icon) close_icon.onclick = null;
            modal.onclose = null;
            modal.oncancel = null;
            if (modal.open) {
                modal.close();
            }
            resolve(result);
        }

        if (confirm_btn) {
            confirm_btn.onclick = () => cleanup(true);
        }
        if (cancel_btn) {
            cancel_btn.onclick = () => cleanup(false);
        }
        if (close_icon) {
            close_icon.onclick = () => cleanup(false);
        }

        modal.oncancel = (e) => {
            e.preventDefault();
            cleanup(false);
        };
        modal.onclose = () => {
            cleanup(false);
        };

        modal.showModal();

        if (danger && cancel_btn && typeof cancel_btn.focus === "function") {
            cancel_btn.focus();
        } else if (confirm_btn && typeof confirm_btn.focus === "function") {
            confirm_btn.focus();
        }
    });
}
