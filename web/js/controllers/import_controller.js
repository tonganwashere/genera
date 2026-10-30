import {
    add_own_cards_batch,
    get_all_own_cards,
    get_today_date,
    get_utc_now,
    get_user_decks
} from "../models/localdb.js";
import { show_toast } from "../views/toast.js";
const max_file_size = 1024 * 1024;
const max_own_cards = 5000;
export function format_bytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
export function parse_csv(csv_text) {
    const rows = [];
    let current_row = [];
    let current_field = "";
    let inside_quotes = false;
    for (let i = 0; i < csv_text.length; i++) {
        const c = csv_text[i];
        if (inside_quotes) {
            if (c === '"') {
                if (csv_text[i + 1] === '"') {
                    current_field += '"';
                    i++;
                } else {
                    inside_quotes = false;
                }
            } else {
                current_field += c;
            }
        } else if (c === '"') {
            inside_quotes = true;
        } else if (c === ',') {
            current_row.push(current_field);
            current_field = "";
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && csv_text[i + 1] === '\n') {
                i++;
            }
            current_row.push(current_field);
            rows.push(current_row);
            current_row = [];
            current_field = "";
        } else {
            current_field += c;
        }
    }
    if (inside_quotes) {
        throw new Error("Malformed CSV: unclosed quote detected. Nothing was imported.");
    }
    if (current_field !== "" || current_row.length > 0) {
        current_row.push(current_field);
        rows.push(current_row);
    }
    return rows;
}
export async function validate_and_save_cards(card_rows, scoped_deck = null) {
    const target_category = scoped_deck ? String(scoped_deck).trim() : null;
    if (target_category && target_category.length > 50) {
        throw new Error("Scoped deck name must not exceed 50 characters.");
    }
    const existing_cards = await get_all_own_cards(false);
    const existing_keys = new Set();
    for (const card of existing_cards) {
        const key = card.question.trim().toLowerCase() + "::" + card.category.trim().toLowerCase();
        existing_keys.add(key);
    }
    const valid_cards = [];
    const skipped_reports = [];
    for (const item of card_rows) {
        const row_num = item.row_num;
        if (item.invalid_item) {
            skipped_reports.push(`Row ${row_num}: item is not an object.`);
            continue;
        }
        const question = String(item.question || "").trim();
        const answer = String(item.answer || "").trim();
        let category = target_category || String(item.category || "").trim();
        if (!question || question.length > 500) {
            skipped_reports.push(`Row ${row_num}: question must be between 1 and 500 characters.`);
            continue;
        }
        if (!answer || answer.length > 500) {
            skipped_reports.push(`Row ${row_num}: answer must be between 1 and 500 characters.`);
            continue;
        }
        if (!category) {
            category = "Uncategorized";
        } else if (category.length > 50) {
            skipped_reports.push(`Row ${row_num}: category must be between 1 and 50 characters.`);
            continue;
        }
        const card_key = question.toLowerCase() + "::" + category.toLowerCase();
        if (existing_keys.has(card_key)) {
            skipped_reports.push(`Row ${row_num}: duplicate card.`);
            continue;
        }
        existing_keys.add(card_key);
        valid_cards.push({
            id: crypto.randomUUID(),
            question: question,
            answer: answer,
            category: category,
            created_at: get_today_date(),
            updated_at: get_utc_now(),
            deleted: 0,
            dirty: 1
        });
    }
    if (existing_cards.length + valid_cards.length > max_own_cards) {
        throw new Error(`Import would exceed the limit of ${max_own_cards} own cards per account.`);
    }
    if (valid_cards.length > 0) {
        await add_own_cards_batch(valid_cards);
    }
    return {
        added: valid_cards.length,
        errors: skipped_reports,
        imported_count: valid_cards.length,
        skipped_count: skipped_reports.length,
        skipped_details: skipped_reports
    };
}
export async function import_json_string(json_string, scoped_deck = null) {
    if (!json_string || json_string.trim() === "") {
        throw new Error("File is empty. Nothing was imported.");
    }
    let parsed_data;
    try {
        parsed_data = JSON.parse(json_string);
    } catch (_) {
        throw new Error("Malformed JSON file. Nothing was imported.");
    }
    if (!Array.isArray(parsed_data)) {
        throw new Error("JSON file must contain an array of cards. Nothing was imported.");
    }
    if (parsed_data.length === 0) {
        throw new Error("JSON array is empty. Nothing was imported.");
    }
    const card_rows = [];
    for (let i = 0; i < parsed_data.length; i++) {
        const item = parsed_data[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            card_rows.push({ row_num: i + 1, invalid_item: true });
        } else {
            card_rows.push({
                row_num: i + 1,
                question: item.question,
                answer: item.answer,
                category: item.category
            });
        }
    }
    return await validate_and_save_cards(card_rows, scoped_deck);
}
export async function import_csv_string(csv_string, scoped_deck = null) {
    if (!csv_string || csv_string.trim() === "") {
        throw new Error("File is empty. Nothing was imported.");
    }
    if (csv_string.charCodeAt(0) === 0xFEFF) {
        csv_string = csv_string.slice(1);
    }
    const raw_rows = parse_csv(csv_string);
    const rows = raw_rows.filter((r) => r.some((f) => f.trim() !== ""));
    if (rows.length === 0) {
        throw new Error("CSV file is empty. Nothing was imported.");
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const q_index = header.indexOf("question");
    const a_index = header.indexOf("answer");
    const c_index = header.indexOf("category");
    if (q_index === -1 || a_index === -1) {
        throw new Error("Missing CSV header ('question' and 'answer' columns required). Nothing was imported.");
    }
    if (rows.length === 1) {
        throw new Error("CSV file contains no data rows. Nothing was imported.");
    }
    const card_rows = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        card_rows.push({
            row_num: i + 1,
            question: row[q_index],
            answer: row[a_index],
            category: c_index !== -1 ? row[c_index] : ""
        });
    }
    return await validate_and_save_cards(card_rows, scoped_deck);
}
export async function process_import_file(file, scoped_deck = null) {
    if (file.size > max_file_size) {
        throw new Error("File exceeds 1 MB limit. Nothing was imported.");
    }
    if (file.size === 0) {
        throw new Error("File is empty. Nothing was imported.");
    }
    const file_name = (file.name || "").toLowerCase();
    const content = await file.text();
    if (file_name.endsWith(".json")) {
        return await import_json_string(content, scoped_deck);
    } else if (file_name.endsWith(".csv")) {
        return await import_csv_string(content, scoped_deck);
    } else {
        throw new Error("Unsupported file format. Please upload a JSON or CSV file.");
    }
}
export function show_import_report(title, summary, details) {
    const import_modal = document.getElementById("import-modal");
    const form_view = document.getElementById("import-form-view");
    const report_view = document.getElementById("import-report-view");
    const report_title = document.getElementById("import-report-title");
    const import_modal_summary = document.getElementById("import-modal-summary");
    const import_modal_details = document.getElementById("import-modal-details");
    const report_done_btn = document.getElementById("import-modal-close-btn");
    const status_icon = document.getElementById("import-status-icon");
    if (!import_modal) return;
    if (form_view) form_view.style.display = "none";
    if (report_view) report_view.style.display = "block";
    if (report_title) report_title.textContent = title;
    if (import_modal_summary) import_modal_summary.textContent = summary;
    if (status_icon) {
        status_icon.className = title.toLowerCase().includes("fail") ? "finished-icon error" : "finished-icon";
    }
    if (import_modal_details) {
        if (details && details.length > 0) {
            import_modal_details.textContent = details.join("\n");
            import_modal_details.style.display = "block";
        } else {
            import_modal_details.textContent = "";
            import_modal_details.style.display = "none";
        }
    }
    if (report_done_btn) {
        report_done_btn.onclick = () => {
            if (typeof import_modal.close === "function") {
                import_modal.close();
            }
        };
    }
    if (typeof import_modal.showModal === "function") {
        import_modal.showModal();
    }
}
export async function open_import_dialog({ default_deck = null, on_imported = null } = {}) {
    if (typeof document === "undefined") return;
    const modal = document.getElementById("import-modal");
    if (!modal) return;
    const form_view = document.getElementById("import-form-view");
    const report_view = document.getElementById("import-report-view");
    const deck_input = document.getElementById("import-deck-input");
    const datalist = document.getElementById("deck-list-suggestions");
    const dropzone = document.getElementById("import-dropzone");
    const file_input = document.getElementById("import-file-input");
    const file_preview = document.getElementById("import-file-preview");
    const file_name_el = document.getElementById("import-file-name");
    const remove_file_btn = document.getElementById("btn-remove-import-file");
    const cancel_btn = document.getElementById("import-cancel-btn");
    const submit_btn = document.getElementById("import-submit-btn");
    const close_icon = document.getElementById("import-modal-close-icon");
    const report_title = document.getElementById("import-report-title");
    const report_summary = document.getElementById("import-modal-summary");
    const report_details = document.getElementById("import-modal-details");
    const report_done_btn = document.getElementById("import-modal-close-btn");
    const status_icon = document.getElementById("import-status-icon");
    let selected_file = null;
    let last_imported_result = null;
    let on_imported_called = false;

    function reset_import_modal_state() {
        selected_file = null;
        if (form_view) form_view.style.display = "block";
        if (report_view) report_view.style.display = "none";
        if (file_preview) file_preview.style.display = "none";
        if (file_input) file_input.value = "";
        if (file_name_el) file_name_el.textContent = "";
        if (deck_input) deck_input.value = "";
        if (submit_btn) {
            submit_btn.disabled = true;
            submit_btn.textContent = "Import Cards";
        }
        if (dropzone) dropzone.classList.remove("dragover");
        if (report_title) report_title.textContent = "";
        if (report_summary) report_summary.textContent = "";
        if (report_details) {
            report_details.textContent = "";
            report_details.style.display = "none";
        }
    }

    async function handle_dismiss() {
        if (last_imported_result && (last_imported_result.added > 0 || last_imported_result.imported_count > 0) && !on_imported_called) {
            on_imported_called = true;
            if (typeof on_imported === "function") {
                try {
                    await on_imported(last_imported_result);
                } catch (err) {
                    console.error("Failed to execute on_imported callback:", err);
                }
            }
        }
        reset_import_modal_state();
    }

    reset_import_modal_state();
    try {
        const today = get_today_date();
        const decks = await get_user_decks(today);
        if (datalist) {
            datalist.innerHTML = decks.map((d) => `<option value="${d.name}">`).join("");
        }
    } catch (_) {}
    if (deck_input) {
        deck_input.value = default_deck ? String(default_deck).trim() : "";
    }
    function set_file(file) {
        if (!file) return;
        const name_lower = (file.name || "").toLowerCase();
        if (!name_lower.endsWith(".csv") && !name_lower.endsWith(".json")) {
            show_toast("Unsupported file format. Please upload a JSON or CSV file.", "error");
            return;
        }
        if (file.size > max_file_size) {
            show_toast("File exceeds 1 MB limit. Please select a smaller file.", "error");
            return;
        }
        selected_file = file;
        if (file_name_el) {
            file_name_el.textContent = `${file.name} (${format_bytes(file.size)})`;
        }
        if (file_preview) {
            file_preview.style.display = "inline-flex";
        }
        if (submit_btn) {
            submit_btn.disabled = false;
        }
    }
    function clear_file() {
        selected_file = null;
        if (file_input) file_input.value = "";
        if (file_preview) file_preview.style.display = "none";
        if (file_name_el) file_name_el.textContent = "";
        if (submit_btn) submit_btn.disabled = true;
    }
    if (dropzone) {
        dropzone.onclick = (e) => {
            if (remove_file_btn && (e.target === remove_file_btn || remove_file_btn.contains(e.target))) {
                return;
            }
            if (file_input) file_input.click();
        };
        dropzone.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (file_input) file_input.click();
            }
        };
        dropzone.ondragover = (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        };
        dropzone.ondragenter = (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        };
        dropzone.ondragleave = (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
        };
        dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                set_file(e.dataTransfer.files[0]);
            }
        };
    }
    if (file_input) {
        file_input.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                set_file(e.target.files[0]);
            }
        };
    }
    if (remove_file_btn) {
        remove_file_btn.onclick = (e) => {
            e.stopPropagation();
            clear_file();
        };
    }
    if (cancel_btn) {
        cancel_btn.onclick = async () => {
            await handle_dismiss();
            if (typeof modal.close === "function") modal.close();
        };
    }
    if (close_icon) {
        close_icon.onclick = async () => {
            await handle_dismiss();
            if (typeof modal.close === "function") modal.close();
        };
    }
    if (submit_btn) {
        submit_btn.onclick = async () => {
            if (!selected_file) return;
            submit_btn.disabled = true;
            let target_deck = null;
            if (deck_input) {
                const val = (deck_input.value || "").trim();
                if (val) target_deck = val;
            }
            try {
                const result = await process_import_file(selected_file, target_deck);
                last_imported_result = result;
                if (form_view) form_view.style.display = "none";
                if (report_view) report_view.style.display = "block";
                if (status_icon) {
                    status_icon.className = "finished-icon";
                }
                if (report_title) report_title.textContent = "Import Completed";
                const deck_label = target_deck ? ` into "${target_deck}"` : "";
                const summary_text = `Imported ${result.added} card(s)${deck_label}.` +
                    (result.skipped_count > 0 ? ` ${result.skipped_count} row(s) skipped.` : "");
                if (report_summary) report_summary.textContent = summary_text;
                if (report_details) {
                    if (result.skipped_details && result.skipped_details.length > 0) {
                        report_details.textContent = result.skipped_details.join("\n");
                        report_details.style.display = "block";
                    } else {
                        report_details.textContent = "";
                        report_details.style.display = "none";
                    }
                }
                if (report_done_btn) {
                    report_done_btn.onclick = async () => {
                        await handle_dismiss();
                        if (typeof modal.close === "function") modal.close();
                    };
                }
            } catch (err) {
                last_imported_result = null;
                if (form_view) form_view.style.display = "none";
                if (report_view) report_view.style.display = "block";
                if (status_icon) {
                    status_icon.className = "finished-icon error";
                }
                if (report_title) report_title.textContent = "Import Failed";
                if (report_summary) report_summary.textContent = err.message || "Failed to process import file.";
                if (report_details) {
                    report_details.textContent = "";
                    report_details.style.display = "none";
                }
                if (report_done_btn) {
                    report_done_btn.onclick = () => {
                        if (form_view) form_view.style.display = "block";
                        if (report_view) report_view.style.display = "none";
                        if (submit_btn) {
                            submit_btn.disabled = false;
                            submit_btn.textContent = "Import Cards";
                        }
                    };
                }
            }
        };
    }
    modal.oncancel = async () => {
        await handle_dismiss();
    };
    modal.onclose = async () => {
        await handle_dismiss();
    };
    if (typeof modal.addEventListener === "function") {
        modal.addEventListener("keydown", async (e) => {
            if (e.key === "Escape") {
                await handle_dismiss();
                if (typeof modal.close === "function") modal.close();
            }
        });
    }
    modal.showModal();
}