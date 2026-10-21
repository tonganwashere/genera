const db_name = "genera";
const db_version = 2;
let db_instance = null;
let cached_catalog_categories = null;

function open_db() {
    if (db_instance) {
        return Promise.resolve(db_instance);
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(db_name, db_version);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("catalog")) {
                db.createObjectStore("catalog", { keyPath: "id" });
            }
            let card_store;
            if (!db.objectStoreNames.contains("own_cards")) {
                card_store = db.createObjectStore("own_cards", { keyPath: "id" });
            } else {
                card_store = request.transaction.objectStore("own_cards");
            }
            if (!card_store.indexNames.contains("dirty")) {
                card_store.createIndex("dirty", "dirty");
            }

            let prog_store;
            if (!db.objectStoreNames.contains("progress")) {
                prog_store = db.createObjectStore("progress", { keyPath: ["card_kind", "card_id"] });
            } else {
                prog_store = request.transaction.objectStore("progress");
            }
            if (!prog_store.indexNames.contains("dirty")) {
                prog_store.createIndex("dirty", "dirty");
            }

            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta", { keyPath: "key" });
            }
        };

        request.onsuccess = (event) => {
            db_instance = event.target.result;
            resolve(db_instance);
        };

        request.onerror = (event) => {
            reject(new Error("Failed to open IndexedDB: " + event.target.error));
        };
    });
}

function promisify_req(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function get_meta(key) {
    const db = await open_db();
    const res = await promisify_req(db.transaction("meta", "readonly").objectStore("meta").get(key));
    return res ? res.value : null;
}

export async function set_meta(key, value) {
    return set_meta_batch({ [key]: value });
}

export async function set_meta_batch(entries) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("meta", "readwrite");
        const store = tx.objectStore("meta");
        for (const [key, value] of Object.entries(entries)) {
            store.put({ key, value });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function count_store(store_name) {
    const db = await open_db();
    return promisify_req(db.transaction(store_name, "readonly").objectStore(store_name).count());
}

async function store_catalog_data(db, cards, version) {
    cached_catalog_categories = null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(["catalog", "meta"], "readwrite");
        const catalog_store = tx.objectStore("catalog");
        const meta_store = tx.objectStore("meta");
        catalog_store.clear();
        for (const card of cards) {
            catalog_store.put(card);
        }
        meta_store.put({ key: "catalogVersion", value: version });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function load_catalog_if_needed() {
    const db = await open_db();
    const current_version = (await get_meta("catalogVersion")) || 0;
    const existing_count = await count_store("catalog");

    if (current_version > 0 && existing_count > 0) {
        const fallback = { downloaded: false, count: existing_count, version: current_version };
        if (!navigator.onLine) {
            return fallback;
        }

        try {
            const manifest_res = await fetch("/data/catalog-manifest.json", { cache: "no-cache" });
            if (!manifest_res.ok) {
                return fallback;
            }

            const manifest = await manifest_res.json();
            const manifest_version = typeof manifest.version === "number" ? manifest.version : 0;

            if (manifest_version <= current_version) {
                return fallback;
            }

            const cat_res = await fetch("/data/catalog.json", { cache: "no-cache" });
            if (!cat_res.ok) {
                return fallback;
            }

            const data = await cat_res.json();
            const cards = data.cards || [];
            const new_version = typeof data.version === "number" ? data.version : manifest_version;

            await store_catalog_data(db, cards, new_version);
            return { downloaded: true, count: cards.length, version: new_version };
        } catch (_) {
            return fallback;
        }
    }

    try {
        const response = await fetch("/data/catalog.json");
        if (!response.ok) {
            return { downloaded: false, count: 0, version: 0 };
        }

        const data = await response.json();
        const cards = data.cards || [];
        const initial_version = typeof data.version === "number" ? data.version : 1;

        await store_catalog_data(db, cards, initial_version);
        return { downloaded: true, count: cards.length, version: initial_version };
    } catch (_) {
        return { downloaded: false, count: 0, version: 0 };
    }
}

export function get_today_date() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function get_utc_now() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function save_own_card({ id = null, question, answer, category }) {
    const q = (question || "").trim();
    const a = (answer || "").trim();
    const c = (category || "").trim() || "Uncategorized";

    if (!q || q.length > 500) {
        throw new Error("Question must be between 1 and 500 characters.");
    }
    if (!a || a.length > 500) {
        throw new Error("Answer must be between 1 and 500 characters.");
    }
    if (c.length > 50) {
        throw new Error("Category must be between 1 and 50 characters.");
    }

    const db = await open_db();
    let existing = null;
    if (id) {
        existing = await get_own_card(id);
        if (!existing || existing.deleted === 1) {
            throw new Error("Card not found.");
        }
    } else {
        const all_existing = await get_all_own_cards(false);
        const is_dupe = all_existing.some((card) => {
            return card.question.trim().toLowerCase() === q.toLowerCase() &&
                   card.category.trim().toLowerCase() === c.toLowerCase();
        });
        if (is_dupe) {
            throw new Error("A card with this question and category already exists.");
        }
    }

    const card_id = id || crypto.randomUUID();
    const to_save = {
        id: card_id,
        question: q,
        answer: a,
        category: c,
        created_at: existing ? existing.created_at : get_today_date(),
        updated_at: get_utc_now(),
        deleted: 0,
        dirty: 1
    };
    await promisify_req(db.transaction("own_cards", "readwrite").objectStore("own_cards").put(to_save));
    return to_save;
}

export async function add_own_card(question, answer, category) {
    return save_own_card({ question, answer, category });
}

export async function update_own_card(id, question, answer, category) {
    return save_own_card({ id, question, answer, category });
}

export async function add_own_cards_batch(cards) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("own_cards", "readwrite");
        const store = tx.objectStore("own_cards");
        for (const card of cards) {
            store.put({ ...card, dirty: 1 });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function delete_own_card(id) {
    const db = await open_db();
    const existing = await get_own_card(id);
    if (!existing) return;

    existing.deleted = 1;
    existing.updated_at = get_utc_now();
    existing.dirty = 1;

    await promisify_req(db.transaction("own_cards", "readwrite").objectStore("own_cards").put(existing));
}

export async function get_own_card(id) {
    const db = await open_db();
    return (await promisify_req(db.transaction("own_cards", "readonly").objectStore("own_cards").get(id))) || null;
}

export async function get_catalog_card(id) {
    const db = await open_db();
    const card_id = typeof id === "string" && !isNaN(Number(id)) ? Number(id) : id;
    return (await promisify_req(db.transaction("catalog", "readonly").objectStore("catalog").get(card_id))) || null;
}

export async function get_all_own_cards(include_deleted = false) {
    const db = await open_db();
    const all = (await promisify_req(db.transaction("own_cards", "readonly").objectStore("own_cards").getAll())) || [];
    return include_deleted ? all : all.filter((c) => c.deleted !== 1);
}

async function get_progress(card_kind, card_id) {
    const db = await open_db();
    return (await promisify_req(db.transaction("progress", "readonly").objectStore("progress").get([card_kind, card_id]))) || null;
}

export async function set_card_hidden(card_kind, card_id, hidden) {
    const row = (await get_progress(card_kind, card_id)) || {
        card_kind,
        card_id,
        box: 1,
        due_date: get_today_date(),
        last_reviewed: null,
        introduced_on: null,
        times_right: 0,
        times_wrong: 0
    };
    row.hidden = hidden ? 1 : 0;
    return await save_progress_row(row);
}

export async function save_progress_row(row) {
    const db = await open_db();
    const to_save = {
        ...row,
        updated_at: get_utc_now(),
        dirty: 1
    };
    await promisify_req(db.transaction("progress", "readwrite").objectStore("progress").put(to_save));
    return to_save;
}

export async function get_all_catalog_cards() {
    const db = await open_db();
    return (await promisify_req(db.transaction("catalog", "readonly").objectStore("catalog").getAll())) || [];
}

export async function get_all_progress_rows() {
    const db = await open_db();
    return (await promisify_req(db.transaction("progress", "readonly").objectStore("progress").getAll())) || [];
}

export async function get_all_categories() {
    if (!cached_catalog_categories) {
        const catalog_cards = await get_all_catalog_cards();
        cached_catalog_categories = new Set();
        for (const c of catalog_cards) {
            if (c.category) cached_catalog_categories.add(c.category);
        }
    }
    const categories = new Set(cached_catalog_categories);
    const own_cards = await get_all_own_cards(false);
    for (const c of own_cards) {
        if (c.category) categories.add(c.category);
    }
    return Array.from(categories).sort();
}

export async function get_user_settings() {
    const db = await open_db();
    const settings = await promisify_req(db.transaction("settings", "readonly").objectStore("settings").get("user_settings"));
    return settings || {
        id: "user_settings",
        daily_new_limit: 10,
        enabled_categories: [],
        updated_at: get_utc_now(),
        dirty: 0
    };
}

export async function save_user_settings(new_settings) {
    const db = await open_db();
    const existing = await get_user_settings();
    const merged = {
        ...existing,
        ...new_settings,
        id: "user_settings",
        updated_at: get_utc_now(),
        dirty: 1
    };
    await promisify_req(db.transaction("settings", "readwrite").objectStore("settings").put(merged));
    return merged;
}

export async function get_dirty_own_cards() {
    const db = await open_db();
    const tx = db.transaction("own_cards", "readonly");
    const store = tx.objectStore("own_cards");
    return (await promisify_req(store.index("dirty").getAll(IDBKeyRange.only(1)))) || [];
}

export async function get_dirty_progress_rows() {
    const db = await open_db();
    const tx = db.transaction("progress", "readonly");
    const store = tx.objectStore("progress");
    return (await promisify_req(store.index("dirty").getAll(IDBKeyRange.only(1)))) || [];
}

export async function get_dirty_settings() {
    const settings = await get_user_settings();
    if (settings.dirty !== 1) return null;
    return {
        daily_new_limit: settings.daily_new_limit,
        enabled_categories: settings.enabled_categories,
        updated_at: settings.updated_at
    };
}

export async function count_dirty_rows() {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(["own_cards", "progress", "settings"], "readonly");
        const store1 = tx.objectStore("own_cards");
        const store2 = tx.objectStore("progress");
        const store3 = tx.objectStore("settings");

        let cards_count = 0;
        let prog_count = 0;
        let settings_count = 0;

        const req1 = store1.index("dirty").count(IDBKeyRange.only(1));
        req1.onsuccess = () => { cards_count = req1.result; };

        const req2 = store2.index("dirty").count(IDBKeyRange.only(1));
        req2.onsuccess = () => { prog_count = req2.result; };

        const req3 = store3.get("user_settings");
        req3.onsuccess = () => {
            const s = req3.result;
            settings_count = s && s.dirty === 1 ? 1 : 0;
        };

        tx.oncomplete = () => resolve(cards_count + prog_count + settings_count);
        tx.onerror = () => reject(tx.error);
    });
}

export async function apply_sync_batch({
    server_cards = [],
    server_progress = [],
    server_settings = null,
    pushed_cards = [],
    pushed_progress = [],
    pushed_settings = null,
    server_version = 0
}) {
    const db = await open_db();
    const pushed_cards_map = new Map();
    for (const c of pushed_cards) {
        pushed_cards_map.set(c.id, c.updated_at);
    }

    const pushed_progress_map = new Map();
    for (const p of pushed_progress) {
        pushed_progress_map.set(`${p.card_kind}:${p.card_id}`, p.updated_at);
    }

    const conflicts = [];

    return new Promise((resolve, reject) => {
        const tx = db.transaction(["own_cards", "progress", "settings", "meta"], "readwrite");
        const card_store = tx.objectStore("own_cards");
        const prog_store = tx.objectStore("progress");
        const settings_store = tx.objectStore("settings");
        const meta_store = tx.objectStore("meta");

        for (const sc of server_cards) {
            const pushed_at = pushed_cards_map.get(sc.id);
            if (pushed_at !== undefined) {
                if (sc.updated_at !== pushed_at) {
                    conflicts.push({ type: "card", id: sc.id, question: sc.question });
                }
            }
            card_store.put({
                ...sc,
                dirty: 0
            });
        }

        for (const sp of server_progress) {
            const key = `${sp.card_kind}:${sp.card_id}`;
            const pushed_at = pushed_progress_map.get(key);
            if (pushed_at !== undefined) {
                if (sp.updated_at !== pushed_at) {
                    conflicts.push({ type: "progress", card_kind: sp.card_kind, card_id: sp.card_id });
                }
            }
            prog_store.put({
                ...sp,
                dirty: 0
            });
        }

        if (server_settings) {
            if (pushed_settings) {
                if (server_settings.updated_at !== pushed_settings.updated_at) {
                    conflicts.push({ type: "settings" });
                }
            }
            settings_store.put({
                id: "user_settings",
                daily_new_limit: server_settings.daily_new_limit,
                enabled_categories: server_settings.enabled_categories || [],
                updated_at: server_settings.updated_at,
                dirty: 0
            });
        }

        if (server_version > 0) {
            meta_store.put({ key: "lastSyncVersion", value: server_version });
        }

        tx.oncomplete = () => resolve({ conflicts });
        tx.onerror = () => reject(tx.error);
    });
}

export async function merge_local_into_account({
    server_cards = [],
    server_progress = [],
    server_settings = null,
    server_version = 0,
    username = ""
}) {
    const db = await open_db();
    const local_own_cards = await get_all_own_cards(true);
    const local_progress = await get_all_progress_rows();
    const local_settings = await get_user_settings();

    const normalize = (q, c) => `${(q || "").trim().toLowerCase()}:::${(c || "").trim().toLowerCase()}`;
    const server_card_map = new Map();
    for (const sc of server_cards) {
        server_card_map.set(normalize(sc.question, sc.category), sc);
    }

    const remapped_uuids = new Map();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(["own_cards", "progress", "settings", "meta"], "readwrite");
        const card_store = tx.objectStore("own_cards");
        const prog_store = tx.objectStore("progress");
        const settings_store = tx.objectStore("settings");
        const meta_store = tx.objectStore("meta");

        for (const sc of server_cards) {
            card_store.put({
                ...sc,
                dirty: 0
            });
        }

        for (const lc of local_own_cards) {
            const match = server_card_map.get(normalize(lc.question, lc.category));
            if (match) {
                remapped_uuids.set(lc.id, match.id);

                if (lc.id !== match.id) {
                    card_store.delete(lc.id);
                }

                if (lc.updated_at > match.updated_at) {
                    card_store.put({
                        id: match.id,
                        question: lc.question,
                        answer: lc.answer,
                        category: lc.category,
                        created_at: match.created_at || lc.created_at,
                        updated_at: lc.updated_at,
                        deleted: lc.deleted ? 1 : 0,
                        dirty: 1
                    });
                }
            } else {
                card_store.put({
                    ...lc,
                    dirty: 1
                });
            }
        }

        const server_prog_map = new Map();
        for (const sp of server_progress) {
            server_prog_map.set(`${sp.card_kind}:${sp.card_id}`, sp);
            prog_store.put({
                ...sp,
                dirty: 0
            });
        }

        for (const lp of local_progress) {
            const is_remapped = lp.card_kind === "own" && remapped_uuids.has(lp.card_id);
            const target_card_id = is_remapped ? remapped_uuids.get(lp.card_id) : lp.card_id;

            if (is_remapped && lp.card_id !== target_card_id) {
                prog_store.delete(["own", lp.card_id]);
            }

            const key = `${lp.card_kind}:${target_card_id}`;
            const server_prog = server_prog_map.get(key);

            if (!server_prog || lp.updated_at > server_prog.updated_at) {
                prog_store.put({
                    ...lp,
                    card_id: target_card_id,
                    dirty: 1
                });
            }
        }

        if (server_settings && local_settings && local_settings.dirty !== 1) {
            settings_store.put({
                id: "user_settings",
                daily_new_limit: server_settings.daily_new_limit,
                enabled_categories: server_settings.enabled_categories || [],
                updated_at: server_settings.updated_at,
                dirty: 0
            });
        } else if (local_settings) {
            settings_store.put({
                ...local_settings,
                dirty: 1
            });
        }

        meta_store.put({ key: "mode", value: "account" });
        if (username) {
            meta_store.put({ key: "username", value: username });
        }
        if (server_version > 0) {
            meta_store.put({ key: "lastSyncVersion", value: server_version });
        }

        tx.oncomplete = () => resolve({ remapped_uuids });
        tx.onerror = () => reject(tx.error);
    });
}

export async function clear_account_local_data() {
    const db = await open_db();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(["own_cards", "progress", "settings", "meta"], "readwrite");
        tx.objectStore("own_cards").clear();
        tx.objectStore("progress").clear();
        tx.objectStore("settings").clear();
        const meta_store = tx.objectStore("meta");
        meta_store.put({ key: "mode", value: "local" });
        meta_store.put({ key: "username", value: null });
        meta_store.put({ key: "email", value: null });
        meta_store.put({ key: "email_verified", value: 0 });
        meta_store.put({ key: "csrf_token", value: null });
        meta_store.put({ key: "lastSyncVersion", value: 0 });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}