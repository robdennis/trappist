# Trappist Deck Builder

A local-first Angular web app for building and managing Magic: The Gathering limited format ("Trappist") draft packs. Deployed to GitHub Pages. No backend — all data lives in the browser's IndexedDB via Dexie.

## What it does

- Downloads card data from Scryfall's bulk data API (700k+ cards) and stores it locally
- Lets users build named "packs" of ~20 cards with metadata (archetype, themes, slot labels)
- Applies semantic tags to cards with defined relationships (rewards/enables/punishes)
- Tracks full revision history per pack
- Shows up to 3 packs side-by-side with drag-and-drop reordering and card preview on hover

## Architecture

```
TrappistComponent (hub/orchestrator)
  ├── DatabaseComponent    — Scryfall data import/download
  ├── PacksComponent[]     — per-pack card editing (up to 3 visible)
  └── TagsComponent        — tag CRUD and relationship management

DatabaseService (Dexie/IndexedDB)
  ├── cards    — deduplicated by name, non-reprint preferred
  ├── packs    — revision history per pack
  ├── tags     — with rewards/enables/punishes relationships
  └── sets     — MTG set metadata
```

State is managed via Angular signals. Components use `OnPush` change detection. Card slots use reactive `FormControl` with debounced search (200ms).

## Development

```bash
npm start       # dev server
npm run build   # production build
CHROME_BIN=/usr/bin/google-chrome-stable npm test -- --watch=false --no-progress
```

## Tests

107 unit tests across 4 spec files (all passing):

| File | What it covers |
|------|---------------|
| `src/app/core/database.service.spec.ts` | `storeCardData` (reprint filter, dedup, extended-art preference, format variants), `searchCards` (token/scheme exclusion, 10-result cap), `hydrateCardIds`, `hydrateCardNames` — uses real IndexedDB via Dexie in Chrome |
| `src/app/packs/packs.component.spec.ts` | `ManaSymbolPipe`, `getCurrentRevision`, `getFilledSlotsCount`, `getDisplayManaCost`, `getColorIdentityManaString`, `getIconType`, `formatTimestamp`, output events (`packChange`, `savePack`) |
| `src/app/tags/tags.component.spec.ts` | `addNewTag`, `selectTagForEditing`, `addRelationship`, `removeRelationship`, `getIconType`, `saveSelectedTag`, `deleteTag` |
| `src/app/trappist.component.spec.ts` | `formatBytes`, `getCurrentRevision`, `addPack` (defaults, naming, slot labels, provisional tracking), `handlePackUpdate`, `visiblePacks` computed, `checkIfDataExists`, `loadPacksFromDb` |

**Key testing decisions:**
- `DatabaseService` uses real IndexedDB (Karma runs in Chrome), with `afterEach(() => service.cards.clear())`
- Component tests mock `DatabaseService` entirely with jasmine spies
- `DatabaseComponent` calls `fetch` in its constructor; tests mock `window.fetch` in the outer `beforeEach` and reconfigure it (not re-spy) in nested `beforeEach` blocks via `(window.fetch as jasmine.Spy).and.callFake(...)`
- Angular animations use `provideNoopAnimations()`
- `@angular/animations` must be installed (was missing from original deps) — already added

Deploys automatically to GitHub Pages on push to `main` via `.github/workflows/build_for_pages.yml` with base href `/trappist/`.

## Known incomplete features / areas needing work

### Stub methods (no implementation)
- **`TrappistComponent.exportPacks()`** — button exists in UI, no logic
- **`TrappistComponent.importPacks()`** — button exists in UI, no logic
- **`TagsComponent.applyAllTags()`** — batch tag application to cards, empty
- **`TagsComponent.exportTags()`** — empty
- **`TagsComponent.importTags()`** — empty
- **`TagsComponent.loadSetIcons()`** / **`updateIconPickerWithSets()`** — MTG set icons referenced in model (`ScryfallSet`) but never fetched; icon picker is incomplete as a result

### UX rough edges
- Multiple bare `confirm()` dialogs used for destructive actions — should be Material dialogs
- Hidden file input for database import (hidden intentionally per recent commit, but may confuse users)
- No validation on tag namespace format (e.g. `removal::creature::exile`) — malformed tags silently accepted
- Hard limit of 3 visible packs is enforced but not clearly communicated to users

### Other observations
- `src/app/test.py` is an untracked file in the repo root — likely a scratch file, should be deleted or gitignored
- `default-cards-20250906090914.json` is untracked — likely a Scryfall bulk download used for local testing; should be gitignored
- No error recovery on failed imports — errors are logged but the user sees no feedback path
- Database is at schema version 10 with incremental migrations; forward-compatibility is not handled

## Tech stack

- Angular 20.2 (standalone components, signals, new control flow `@if`/`@for`)
- Angular Material 20.2 + CDK (drag-and-drop)
- Dexie 4.2 (IndexedDB)
- Font Awesome 6 (free icons) + Mana Symbol fonts for MTG symbols
- TypeScript 5.9 strict mode
- SCSS, Prettier (100 char width, single quotes)
