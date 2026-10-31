# Genera

Genera is a flashcard web app built around the Leitner spaced-repetition system. You can create and organize your own custom flashcard decks, import and export cards from CSV or JSON, track your daily study streaks, or practice with a built-in library of ~4,500 trivia questions.

---

## Features

- **Custom Decks**: Organize cards into decks with a 3-step creation process or CSV/JSON import.
- **Study Modes**:
  - **Scheduled**: Reviews due cards using the 5-box Leitner system.
  - **Freestyle**: Quick flip through all cards in a deck without affecting your review schedule.
  - **Random**: Quick quiz sample from a selected deck.
- **Trivia Mode**: Built-in catalog of ~4,500 questions across 24 categories with category filters and daily new card limits.
- **Study Streak & Progress**: Tracks consecutive study days and your cards across Leitner boxes.
- **Keyboard Shortcuts**: Space to flip, 1 for wrong, 2 for right, Esc to dismiss dialogs.
- **Works Offline**: Works in the browser via IndexedDB and service worker caching with optional account sync via Flask backend.

---

## How It Works

### 1. Spaced Repetition (The Leitner System)

Genera uses a 5-box Leitner scheduling system with expanding review intervals:

- **Box 1**: 1 day
- **Box 2**: 2 days
- **Box 3**: 4 days
- **Box 4**: 8 days
- **Box 5**: 16 days

When you answer a card correctly, it moves up a box. If you miss a card, it resets back to Box 1 so you review it again the next day. All scheduling calculations use pure UTC date strings (`YYYY-MM-DD`) to avoid timezone shifts when studying late at night or traveling.

Custom cards are always available in your decks immediately. For trivia, you can set a daily limit on how many new questions appear (default is 10 per day).

### 2. Architecture

- **Local Mode First**: You can use Genera immediately without creating an account. Everything is saved locally to your browser's IndexedDB database across five stores (`catalog`, `own_cards`, `progress`, `settings`, and `meta`).
- **Service Worker (`sw.js`)**: Caches the app shell (`index.html`, `style.css`, JS modules, and the trivia catalog) so the site loads instantly even offline.
- **Background Catalog Updates**: When online, the app checks `catalog-manifest.json` and updates the trivia questions in IndexedDB without touching your personal decks or study progress.

### 3. Sync & Conflict 

When you want to sync between devices, you can log in to an account:

- **Dirty Flag Tracking**: Changes made offline are marked with a `dirty` flag and pushed in 500-item batches to `/api/sync`.
- **Last-Write-Wins (LWW)**: Conflicts are resolved using ISO UTC timestamps (`updated_at`). Ties break in favor of the server.
- **Dismissible Conflict Banner**: If a local edit was rejected because a newer edit existed on the server, Genera shows an amber banner naming the overwritten item rather than silently discarding your work.
- **Account Merging**: If you start in Local Mode and later register or log in, Genera merges your local cards, decks, and progress to server UUIDs without duplicating cards.

---

## Attribution & License

- Trivia questions sourced from the [Open Trivia Database](https://opentdb.com/), licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).