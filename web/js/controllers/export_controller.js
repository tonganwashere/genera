export function escape_csv_field(val) {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
export function generate_deck_csv(deck_name, cards = []) {
    const raw_deck = typeof deck_name === "string" ? deck_name.trim() : "";
    const is_all = raw_deck.toLowerCase() === "all";
    const safe_deck = raw_deck || "Uncategorized";
    const target = safe_deck.toLowerCase();
    const non_deleted = (cards || []).filter((c) => {
        if (!c || c.deleted === 1) return false;
        if (is_all) return true;
        const cat = ((c.category || "").trim() || "Uncategorized").toLowerCase();
        return cat === target;
    });
    const lines = ["question,answer,category"];
    for (const card of non_deleted) {
        const q = escape_csv_field(card.question);
        const a = escape_csv_field(card.answer);
        const card_cat = (card.category || "").trim() || (is_all ? "Uncategorized" : safe_deck);
        const c = escape_csv_field(card_cat);
        lines.push(`${q},${a},${c}`);
    }
    return "\uFEFF" + lines.join("\r\n");
}
export function generate_deck_json(deck_name, cards = []) {
    const raw_deck = typeof deck_name === "string" ? deck_name.trim() : "";
    const is_all = raw_deck.toLowerCase() === "all";
    const safe_deck = raw_deck || "Uncategorized";
    const target = safe_deck.toLowerCase();
    const non_deleted = (cards || []).filter((c) => {
        if (!c || c.deleted === 1) return false;
        if (is_all) return true;
        const cat = ((c.category || "").trim() || "Uncategorized").toLowerCase();
        return cat === target;
    });
    const payload = non_deleted.map((c) => {
        const card_cat = (c.category || "").trim() || (is_all ? "Uncategorized" : safe_deck);
        return {
            question: String(c.question || ""),
            answer: String(c.answer || ""),
            category: String(card_cat)
        };
    });
    return JSON.stringify(payload, null, 2);
}
function get_safe_filename(deck_name, extension) {
    const sanitized = String(deck_name || "deck")
        .trim()
        .replace(/[/\\?%*:|"<>]/g, "_")
        .replace(/\s+/g, "_");
    return `${sanitized || "deck"}.${extension}`;
}
function trigger_download(content, filename, mime_type) {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return null;
    }
    const blob = new Blob([content], { type: mime_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return blob;
}
export function export_deck_csv(deck_name, cards = []) {
    const csv_text = generate_deck_csv(deck_name, cards);
    const filename = get_safe_filename(deck_name, "csv");
    trigger_download(csv_text, filename, "text/csv;charset=utf-8;");
}
export function export_deck_json(deck_name, cards = []) {
    const json_text = generate_deck_json(deck_name, cards);
    const filename = get_safe_filename(deck_name, "json");
    trigger_download(json_text, filename, "application/json;charset=utf-8;");
}