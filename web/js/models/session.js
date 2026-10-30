import {
    get_all_catalog_cards,
    get_all_own_cards,
    get_all_progress_rows,
    get_user_settings,
    get_today_date
} from "./localdb.js";
import { is_due } from "./scheduler.js";
export function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
export function build_session_for_mode_from_data({
    session_type = "study",
    deck_name = null,
    categories = null,
    sub_mode = "scheduled",
    today,
    limit = 20,
    catalog_cards = [],
    own_cards = [],
    progress_rows = [],
    settings = {}
}) {
    if (!today || typeof today !== "string") {
        throw new Error("today date string (YYYY-MM-DD) is required.");
    }
    if (session_type !== "study" && session_type !== "trivia") {
        throw new Error(`Unsupported session_type: "${session_type}". Must be "study" or "trivia".`);
    }
    if (sub_mode !== "scheduled" && sub_mode !== "freestyle" && sub_mode !== "random") {
        throw new Error(`Unsupported sub_mode: "${sub_mode}". Must be "scheduled", "freestyle", or "random".`);
    }
    const daily_new_limit = typeof settings.daily_new_limit === "number" ? Math.max(0, settings.daily_new_limit) : 10;
    const effective_deck = (deck_name && String(deck_name).trim().toLowerCase() !== "all") ? String(deck_name).trim() : null;
    const progress_map = new Map();
    for (const p of progress_rows) {
        progress_map.set(`${p.card_kind}:${p.card_id}`, p);
    }
    let pool = [];
    let card_kind = "";
    if (session_type === "study") {
        card_kind = "own";
        pool = own_cards.filter((c) => {
            if (c.deleted === 1) return false;
            if (effective_deck) {
                const card_cat = ((c.category || "").trim() || "Uncategorized").toLowerCase();
                if (card_cat !== effective_deck.toLowerCase()) {
                    return false;
                }
            }
            return true;
        });
    } else {
        card_kind = "catalog";
        let enabled_set = null;
        if (Array.isArray(categories)) {
            if (categories.length > 0) {
                enabled_set = new Set(categories);
            }
        } else if (Array.isArray(settings.enabled_categories) && settings.enabled_categories.length > 0) {
            enabled_set = new Set(settings.enabled_categories);
        }
        pool = catalog_cards.filter((c) => {
            if (enabled_set && !enabled_set.has(c.category)) return false;
            return true;
        });
    }
    pool = pool.filter((c) => {
        const p = progress_map.get(`${card_kind}:${c.id}`);
        return !p || p.hidden !== 1;
    });
    let session_cards = [];
    if (sub_mode === "scheduled") {
        const due_cards = [];
        const unseen_cards = [];
        let introduced_today_count = 0;
        const pool_ids = new Set(pool.map((c) => c.id));
        for (const p of progress_rows) {
            if (p.card_kind === card_kind && p.introduced_on === today) {
                if (session_type === "study" && effective_deck) {
                    if (pool_ids.has(p.card_id)) introduced_today_count += 1;
                } else if (session_type === "study") {
                    introduced_today_count += 1;
                } else if (session_type === "trivia") {
                    if (pool_ids.has(p.card_id)) {
                        introduced_today_count += 1;
                    }
                }
            }
        }
        for (const c of pool) {
            const p = progress_map.get(`${card_kind}:${c.id}`);
            if (p && p.introduced_on) {
                if (is_due(p, today)) {
                    due_cards.push({
                        card_kind,
                        card_id: c.id,
                        question: c.question,
                        answer: c.answer,
                        category: c.category,
                        is_new: false,
                        progress: p
                    });
                }
            } else {
                unseen_cards.push({
                    card_kind,
                    card_id: c.id,
                    question: c.question,
                    answer: c.answer,
                    category: c.category,
                    is_new: true,
                    progress: p || null
                });
            }
        }
        const remaining_quota = Math.max(0, daily_new_limit - introduced_today_count);
        let picked_new = [];
        if (remaining_quota > 0 && unseen_cards.length > 0) {
            picked_new = shuffle(unseen_cards).slice(0, remaining_quota);
        }
        session_cards = shuffle([...due_cards, ...picked_new]);
    } else if (sub_mode === "freestyle") {
        session_cards = shuffle(pool.map((c) => {
            const p = progress_map.get(`${card_kind}:${c.id}`);
            return {
                card_kind,
                card_id: c.id,
                question: c.question,
                answer: c.answer,
                category: c.category,
                is_new: !p || !p.introduced_on,
                progress: p || null
            };
        }));
    } else if (sub_mode === "random") {
        const sample_size = (typeof limit === "number" && limit > 0) ? Math.min(limit, pool.length) : Math.min(20, pool.length);
        const shuffled_pool = shuffle(pool).slice(0, sample_size);
        session_cards = shuffled_pool.map((c) => {
            const p = progress_map.get(`${card_kind}:${c.id}`);
            return {
                card_kind,
                card_id: c.id,
                question: c.question,
                answer: c.answer,
                category: c.category,
                is_new: !p || !p.introduced_on,
                progress: p || null
            };
        });
    }
    return {
        cards: session_cards,
        session_type,
        sub_mode,
        deck_name: session_type === "study" ? effective_deck : null,
        total_count: session_cards.length
    };
}
export async function build_session_for_mode({
    session_type = "study",
    deck_name = null,
    categories = null,
    sub_mode = "scheduled",
    today = get_today_date(),
    limit = 20
} = {}) {
    const [catalog_cards, own_cards, progress_rows, settings] = await Promise.all([
        get_all_catalog_cards(),
        get_all_own_cards(false),
        get_all_progress_rows(),
        get_user_settings()
    ]);
    return build_session_for_mode_from_data({
        session_type,
        deck_name,
        categories,
        sub_mode,
        today,
        limit,
        catalog_cards,
        own_cards,
        progress_rows,
        settings
    });
}