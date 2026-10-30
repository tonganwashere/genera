import {
    get_meta,
    set_meta,
    get_all_progress_rows,
    get_today_date
} from "./localdb.js";
import { add_days } from "./scheduler.js";
export function normalize_date(val) {
    if (!val) return null;
    if (typeof val === "string") {
        const trimmed = val.trim();
        const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) {
            return match[1];
        }
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, "0");
            const day = String(d.getUTCDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }
        return null;
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
        const year = val.getUTCFullYear();
        const month = String(val.getUTCMonth() + 1).padStart(2, "0");
        const day = String(val.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    return null;
}
export function calculate_streak(active_dates, today) {
    const norm_today = normalize_date(today);
    if (!norm_today) return 0;
    if (!active_dates) return 0;
    const dates_set = new Set();
    for (const d of active_dates) {
        const norm = normalize_date(d);
        if (norm) {
            dates_set.add(norm);
        }
    }
    if (dates_set.size === 0) return 0;
    let streak = 0;
    let check_date = norm_today;
    if (!dates_set.has(norm_today)) {
        const yesterday = add_days(norm_today, -1);
        if (!dates_set.has(yesterday)) {
            return 0;
        }
        check_date = yesterday;
    }
    while (dates_set.has(check_date)) {
        streak += 1;
        check_date = add_days(check_date, -1);
    }
    return streak;
}
export async function get_study_streak(today = get_today_date()) {
    const norm_today = normalize_date(today) || get_today_date();
    const active_dates = new Set();
    try {
        const stored_days = await get_meta("study_days");
        if (Array.isArray(stored_days)) {
            for (const d of stored_days) {
                const norm = normalize_date(d);
                if (norm) active_dates.add(norm);
            }
        }
    } catch (_) {
    }
    try {
        const progress_rows = await get_all_progress_rows();
        if (Array.isArray(progress_rows)) {
            for (const p of progress_rows) {
                if (p && p.last_reviewed) {
                    const norm = normalize_date(p.last_reviewed);
                    if (norm) active_dates.add(norm);
                }
            }
        }
    } catch (_) {
    }
    return calculate_streak(active_dates, norm_today);
}
export async function record_study_activity(today = get_today_date()) {
    const norm_today = normalize_date(today) || get_today_date();
    let stored_days = [];
    try {
        const meta_val = await get_meta("study_days");
        if (Array.isArray(meta_val)) {
            stored_days = meta_val;
        }
    } catch (_) {
        stored_days = [];
    }
    const set = new Set(stored_days.map(normalize_date).filter(Boolean));
    if (!set.has(norm_today)) {
        set.add(norm_today);
        const sorted = Array.from(set).sort();
        await set_meta("study_days", sorted);
    }
}