import { ChangeDetectionStrategy, Component, effect, OnInit, signal, Pipe, PipeTransform, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { startWith, map, debounceTime } from 'rxjs/operators';

// NOTE: For the mana symbols to render, please add the following line to the <head> of your main `index.html` file:
// <link href="//cdn.jsdelivr.net/npm/mana-font@latest/css/mana.css" rel="stylesheet" type="text/css" />

// --- Mana Symbol Pipe ---
@Pipe({
  name: 'manaSymbol',
  standalone: true,
})
export class ManaSymbolPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string | undefined | null): SafeHtml {
    if (!value) return '';
    const htmlString = value.replace(/\{([^}]+)\}/g, (match, symbol) => {
      const sanitizedSymbol = symbol.toLowerCase().replace(/[\/]/g, '');
      const finalSymbol = sanitizedSymbol === 't' ? 'tap' : sanitizedSymbol;
      return `<i class="ms ms-${finalSymbol} ms-cost"></i>`;
    });
    return this.sanitizer.bypassSecurityTrustHtml(htmlString);
  }
}

// Dexie type declarations
declare class Dexie {
    constructor(databaseName: string);
    version(versionNumber: number): { stores(schema: { [tableName: string]: string | null }): any; };
    table(tableName: string): Dexie.Table;
    readonly tables: Dexie.Table[];
    static addons: any[];
}
declare namespace Dexie {
    interface Table<T = any, TKey = any> {
        get(key: TKey): Promise<T | undefined>;
        count(): Promise<number>;
        add(item: T, key?: TKey): Promise<TKey>;
        bulkAdd(items: readonly T[], keys?: TKey[]): Promise<TKey>;
        clear(): Promise<void>;
        where(index: string | string[]): WhereClause;
        put(item: T, key?: TKey): Promise<TKey>;
        update(key: TKey, changes: {[keyPath: string]: any}): Promise<number>;
    }
    interface WhereClause {
        startsWithIgnoreCase(key: string): Collection;
        anyOf(keys: string[]): Collection;
        equals(key: string | boolean | number): Collection;
    }
    interface Collection {
        limit(count: number): Collection;
        toArray(): Promise<any[]>;
        first(): Promise<any | undefined>;
        delete(): Promise<number>;
        count(): Promise<number>;
        modify(changes: (obj: any) => void): Promise<number>;
    }
}

// --- Data Structures ---
interface CardFace {
  name: string;
  image_uris?: { normal?: string; art_crop?: string; };
  type_line?: string; mana_cost?: string; oracle_text?: string;
}
interface CardDocument {
  id: string; name:string; name_lowercase?: string;
  image_uris?: { normal?: string; art_crop?: string; };
  type_line?: string; mana_cost?: string; cmc?: number;
  oracle_text?: string; colors?: string[]; color_identity?: string[];
  produced_mana?: string[]; keywords?: string[]; reprint?: boolean;
  card_faces?: CardFace[]; frame_effects?: string[];
  layout?: string;
}
interface PersistedPack {
  name: string; size: number; cardIds: string[]; signpostCardId?: string;
}
interface PackRevision extends PersistedPack {
    timestamp: number;
    reason?: string; // Add a reason for the revision
}
interface PackHistory {
    id: string; // Primary Key
    name: string; // Unique Index
    revisions: PackRevision[];
    isDeleted: number;
}
interface Pack extends PackHistory {
    cards: CardDocument[]; // Hydrated cards for the current revision
}


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatProgressBarModule, MatProgressSpinnerModule,
    MatToolbarModule, MatButtonToggleModule, MatAutocompleteModule, MatListModule,
    MatIconModule, MatSelectModule, ManaSymbolPipe, MatExpansionModule, MatTooltipModule,
    MatMenuModule, MatDividerModule
  ],
  templateUrl: './trappist.component.html',
  styleUrls: ['./trappist.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  // --- Component State Signals ---
  status = signal<string>('Initializing...');
  isChecking = signal<boolean>(true);
  isLoading = signal<boolean>(false);
  dataExists = signal<boolean>(false);
  cardCount = signal<number>(0);
  jsonUrl = signal<string>('https://api.jsonbin.io/v3/b/66dae6a8e41b4d34e403d15b');
  inputMode = signal<'url' | 'file'>('url');
  selectedFile = signal<File | null>(null);
  fileErrorDetails = signal<string | null>(null);

  // --- Card Search & List State ---
  searchControl = new FormControl('');
  suggestions = signal<CardDocument[]>([]);
  hoveredCard = signal<CardDocument | null>(null);
  mousePos = signal<{x: number, y: number}>({ x: 0, y: 0 });

  // --- Pack Management State ---
  packs = signal<Pack[]>([]);
  activePackId = signal<string | null>(null);
  provisionalChanges = signal<Set<string>>(new Set());
  @ViewChild('packsImporter') packsImporter!: ElementRef<HTMLInputElement>;

  // --- Database Properties ---
  private db: any;

  constructor() {
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(200),
      map(value => this._filter(value || ''))
    ).subscribe();

    document.addEventListener('mousemove', (event) => {
      this.mousePos.set({ x: event.clientX, y: event.clientY });
    });
  }

  private async _filter(value: string | CardDocument): Promise<void> {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : value.name.toLowerCase();
    if (filterValue.length < 2) {
      this.suggestions.set([]);
      return;
    }
    if (this.db?.cards) {
       const results = await this.db.cards.where('name').startsWithIgnoreCase(filterValue).toArray();
       const filteredResults = results.filter((card: CardDocument) => {
            const typeLine = card.type_line?.toLowerCase();
            return !typeLine?.startsWith('token') && !typeLine?.includes('scheme');
       });
       this.suggestions.set(filteredResults.slice(0, 10));
    }
  }

  displayFn(card: CardDocument): string {
    return card && card.name ? card.name : '';
  }

  ngOnInit() {
    this.status.set('Waiting for database library...');
    this.initializeDatabase();
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) { return resolve(); }
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = (error) => reject(new Error(`Script load error for ${url}: ${error}`));
      document.body.appendChild(script);
    });
  }

  private async initializeDatabase() {
    try {
      await this.loadScript('https://unpkg.com/dexie@3/dist/dexie.js');
      this.status.set('Database library loaded.');

      class TrappistDB extends Dexie {
        public cards!: Dexie.Table<CardDocument, string>;
        public packs!: Dexie.Table<PackHistory, string>;
        constructor() {
          super('TrappistDB');
          this.version(5).stores({
            cards: 'id, &name_lowercase, name, type_line, cmc, *colors, *color_identity, *keywords',
            packs: 'id, &name, isDeleted'
          });
          // Add a new version with a data migration to fix the isDeleted boolean issue
          this.version(6).stores({
            packs: 'id, &name, isDeleted' // Schema definition is the same
          }).upgrade((tx: any) => {
            // This upgrade function will run for any user who has db version < 6
            // It converts any boolean isDeleted flags to numbers (0 or 1)
            return tx.table('packs').toCollection().modify((pack: any) => {
              pack.isDeleted = pack.isDeleted ? 1 : 0;
            });
          });
        }
      }
      this.db = new TrappistDB();
      this.status.set('Database initialized. Checking for local data...');
      await this.checkIfDataExists();
    } catch (error) {
      console.error('Failed to load or initialize Dexie database:', error);
      this.status.set('Error: Could not load database library.');
      this.isChecking.set(false);
    }
  }

  async checkIfDataExists() {
    if (!this.db) { this.status.set('Database not initialized.'); return; };
    try {
      const count = await this.db.cards.count();
      if (count > 0) {
        this.status.set(`Local data found! Ready to build.`);
        this.dataExists.set(true);
        this.cardCount.set(count);
        await this.loadPacksFromDb();
      } else {
        this.status.set('No local card data. Ready to proceed.');
        this.dataExists.set(false);
        this.cardCount.set(0);
      }
    } catch (error) {
      this.status.set('Error checking local database.');
      console.error('Error accessing IndexedDB:', error);
    } finally {
      this.isChecking.set(false);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fileErrorDetails.set(null);
    if (input.files && input.files.length > 0) this.selectedFile.set(input.files[0]);
    else this.selectedFile.set(null);
  }

  async downloadAndStoreData() {
    if (!this.jsonUrl()) return;
    this.isLoading.set(true);
    this.fileErrorDetails.set(null);
    this.status.set('Downloading data...');
    try {
      const response = await fetch(this.jsonUrl());
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const jsonData = await response.json();
      await this.storeDataInDb(jsonData);
      await this.loadPacksFromDb();
    } catch (error) {
      this.status.set('Failed to download or store data.');
      if (error instanceof Error) this.fileErrorDetails.set(error.message);
      this.dataExists.set(false);
    } finally {
      this.isLoading.set(false);
    }
  }

  uploadAndStoreData() {
    const file = this.selectedFile();
    if (!file) return;
    this.isLoading.set(true);
    this.status.set(`Reading file: ${file.name}...`);
    this.fileErrorDetails.set(null);
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result as string;
        const jsonData = JSON.parse(text);
        await this.storeDataInDb(jsonData);
        await this.loadPacksFromDb();
      } catch (error) {
        this.status.set('Error reading or parsing file.');
        if (error instanceof Error) this.fileErrorDetails.set(error.message);
        else this.fileErrorDetails.set(String(error));
        this.dataExists.set(false);
      } finally {
        this.isLoading.set(false);
      }
    };
    reader.onerror = () => {
      this.status.set('Failed to read the selected file.');
      this.isLoading.set(false);
    };
    reader.readAsText(file);
  }

  private async storeDataInDb(jsonData: any) {
    const rawData: CardDocument[] = Array.isArray(jsonData) ? jsonData : jsonData.record;
    if (!Array.isArray(rawData)) throw new Error('Data is not in a recognized array format.');

    // Tweak 1: Filter out cards where all faces have the same name (e.g. promo art)
    const promoArtFilteredData = rawData.filter(card => {
        if (card.card_faces && card.card_faces.length > 1) {
            const faceNames = new Set(card.card_faces.map(face => face.name));
            return faceNames.size > 1; // Keep if there's more than one unique name
        }
        return true; // Keep cards without multiple faces
    });

    const filteredData = promoArtFilteredData.filter(card => !card.reprint);
    filteredData.forEach(card => { if (card.name) card.name_lowercase = card.name.toLowerCase(); });

    const cardNameGroups = new Map<string, CardDocument[]>();
    for (const card of filteredData) {
      if (!card.name_lowercase) continue;
      if (!cardNameGroups.has(card.name_lowercase)) cardNameGroups.set(card.name_lowercase, []);
      cardNameGroups.get(card.name_lowercase)!.push(card);
    }

    const uniqueDataToStore: CardDocument[] = [];
    for (const cards of cardNameGroups.values()) {
      if (cards.length === 1) {
        uniqueDataToStore.push(cards[0]);
      } else {
        const preferredCard = cards.reduce((prev, curr) => {
          const prevIsExtended = prev.frame_effects?.includes('extendedart') ?? false;
          const currIsExtended = curr.frame_effects?.includes('extendedart') ?? false;
          return prevIsExtended && !currIsExtended ? curr : prev;
        });
        uniqueDataToStore.push(preferredCard);
      }
    }
    this.fileErrorDetails.set(null);
    this.status.set(`Data processed. Storing ${uniqueDataToStore.length} unique, non-reprint cards...`);
    await this.db.cards.bulkAdd(uniqueDataToStore);
    const count = await this.db.cards.count();
    this.status.set(`Successfully stored ${count} cards!`);
    this.dataExists.set(true);
    this.cardCount.set(count);
  }

  async clearCardData() {
    if (!confirm('Are you sure you want to delete ALL card data? Existing packs will remain but will be empty until new card data is loaded.')) return;
    this.isLoading.set(true);
    this.status.set('Deleting card data...');
    try {
        await this.db.cards.clear();
        this.status.set('Card data deleted. Please load a new card file.');
        this.dataExists.set(false);
        this.cardCount.set(0);
        this.packs.set([]);
        this.activePackId.set(null);
    } catch (error) {
        this.status.set('Error clearing card data.');
        console.error('Error clearing card data:', error);
    } finally {
        this.isLoading.set(false);
    }
  }

  async clearPackData() {
    if (!confirm('Are you sure you want to delete ALL pack data? This cannot be undone. Card data will not be affected.')) return;
    this.isLoading.set(true);
    this.status.set('Deleting pack data...');
    try {
        await this.db.packs.clear();
        this.status.set('All pack data has been deleted.');
        this.loadPacksFromDb();
    } catch (error) {
        this.status.set('Error clearing pack data.');
        console.error('Error clearing pack data:', error);
    } finally {
        this.isLoading.set(false);
    }
  }

  async clearAllData() {
    if (!confirm('Are you sure you want to delete ALL card and pack data? This cannot be undone.')) return;
    this.isLoading.set(true);
    this.status.set('Deleting all local data...');
    try {
        await this.db.cards.clear();
        await this.db.packs.clear();
        this.status.set('All local data deleted. Ready to proceed.');
        this.dataExists.set(false);
        this.cardCount.set(0);
        this.selectedFile.set(null);
        this.packs.set([]);
    } catch (error) {
        this.status.set('Error clearing all data.');
        console.error('Error clearing all data:', error);
    } finally {
        this.isChecking.set(false);
        this.isLoading.set(false);
    }
  }

  // --- Pack Management Methods ---
  addPack() {
    const existingNames = this.packs().map(p => p.name);
    let nameCounter = existingNames.length + 1;
    let finalName = `New Pack ${nameCounter}`;
    while(existingNames.includes(finalName)) {
      finalName = `New Pack ${++nameCounter}`;
    }

    const packId = crypto.randomUUID();
    const newPackForUI: Pack = {
      id: packId,
      name: finalName,
      isDeleted: 0,
      revisions: [{ name: finalName, size: 20, cardIds: [], timestamp: Date.now(), reason: 'Initial revision' }],
      cards: []
    };

    this.packs.update(currentPacks => [...currentPacks, newPackForUI]);
    this.activePackId.set(packId);
    this.markPackAsDirty(packId); // A new pack is provisional by default
  }

  async removePack(packId: string) {
    const packInDb = await this.db.packs.get(packId);
    if (packInDb) {
      await this.db.packs.update(packId, { isDeleted: 1 });
    }

    this.provisionalChanges.update(set => {
        set.delete(packId);
        return new Set(set);
    });
    this.packs.update(packs => packs.filter(p => p.id !== packId));

    if (this.activePackId() === packId) {
        this.activePackId.set(this.packs()[0]?.id || null);
    }
  }

  onPackNameChange(packId: string, newName: string) {
      this.packs.update(packs => packs.map(p => p.id === packId ? {...p, name: newName} : p));
      this.markPackAsDirty(packId);
  }

  setActivePack(packId: string) { this.activePackId.set(packId); }

  addCardToActivePack(card: CardDocument) {
    const packId = this.activePackId();
    if (!packId) { alert('Please select a pack first!'); return; }

    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const currentRevision = this.getCurrentRevision(p);
            if (p.cards.length >= currentRevision.size) {
                alert(`Pack "${p.name}" is full.`);
                return p;
            }
            const updatedCards = [...p.cards, card];

            if (updatedCards.length === 1) {
                const newRevision = {...currentRevision, signpostCardId: card.id };
                return { ...p, cards: updatedCards, revisions: [...p.revisions.slice(0, -1), newRevision]};
            }
            return {...p, cards: updatedCards};
        }
        return p;
    }));

    this.markPackAsDirty(packId);
    this.searchControl.setValue('');
  }

  removeCardFromPack(packId: string, cardIndex: number) {
    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const cardToRemove = p.cards[cardIndex];
            const updatedCards = p.cards.filter((_, i) => i !== cardIndex);

            const latestRevision = this.getCurrentRevision(p);
            if (latestRevision.signpostCardId === cardToRemove.id) {
                 const newLatestRevision = {...latestRevision, signpostCardId: updatedCards[0]?.id };
                 return { ...p, cards: updatedCards, revisions: [...p.revisions.slice(0, -1), newLatestRevision] };
            }
            return {...p, cards: updatedCards};
        }
        return p;
    }));
    this.markPackAsDirty(packId);
  }

  setSignpostCard(packId: string, cardId: string) {
     this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const latestRevision = this.getCurrentRevision(p);
            return {...p, revisions: [...p.revisions.slice(0, -1), {...latestRevision, signpostCardId: cardId}]};
        }
        return p;
    }));
    this.markPackAsDirty(packId);
  }

  onSuggestionSelected(event: any) { this.addCardToActivePack(event.option.value); }

  async revertToRevision(packId: string, revision: PackRevision) {
    if (!confirm(`Are you sure you want to revert "${revision.name}" to the version from ${this.formatTimestamp(revision.timestamp)}? This will create a new revision.`)) return;

    const packHistory = await this.db.packs.get(packId);
    if (!packHistory) return;

    const newRevision: PackRevision = {
        ...revision,
        timestamp: Date.now(),
        reason: `Reverted to version from ${this.formatTimestamp(revision.timestamp)}`
    };
    packHistory.revisions.push(newRevision);
    packHistory.name = newRevision.name;
    await this.db.packs.put(packHistory);

    const restoredCards = await this.hydrateCardIds(newRevision.cardIds);
    this.packs.update(packs => packs.map(p => p.id === packId ? { ...packHistory, cards: restoredCards } : p));
    this.provisionalChanges().delete(packId);
  }

  // --- Persistence Methods ---
  private async hydrateCardIds(cardIds: string[]): Promise<CardDocument[]> {
      if (cardIds.length === 0) return [];
      const cardDocs = await this.db.cards.where('id').anyOf(cardIds).toArray();
      const cardMap = new Map<string, CardDocument>(cardDocs.map((c: CardDocument) => [c.id, c]));
      return cardIds.map(id => cardMap.get(id)!).filter(Boolean);
  }

  public getCurrentRevision(packHistory: PackHistory | Pack): PackRevision {
      return packHistory.revisions[packHistory.revisions.length - 1];
  }

  private async loadPacksFromDb() {
    try {
      this.provisionalChanges.set(new Set());
      const packHistories: PackHistory[] = await this.db.packs.where('isDeleted').equals(0).toArray();
      const hydratedPacks: Pack[] = await Promise.all(packHistories.map(async (history) => {
          const currentRevision = this.getCurrentRevision(history);
          const cards = await this.hydrateCardIds(currentRevision.cardIds);
          return { ...history, cards };
      }));
      this.packs.set(hydratedPacks);

      if (hydratedPacks.length === 0) {
        this.addPack();
      } else if (!this.activePackId() || !hydratedPacks.some(p => p.id === this.activePackId())) {
        this.activePackId.set(hydratedPacks[0]?.id || null);
      }
    } catch (e) {
      console.error('Failed to load packs from DB', e);
      this.packs.set([]);
      this.addPack();
    }
  }

  async exportPacks() {
    if (this.provisionalChanges().size > 0) {
        const commit = confirm("You have unsaved changes. Click OK to save all changes before exporting.");
        if (commit) {
            await this.saveAllPackChanges();
        } else {
            const exportAnyway = confirm("Do you want to export the current view (including unsaved changes) WITHOUT saving them to the database?");
            if (!exportAnyway) {
                return;
            }
        }
    }

    const packsToExport = this.packs().map(pack => {
        const currentRevision = this.getCurrentRevision(pack);
        return {
            name: pack.name,
            size: currentRevision.size,
            cardIds: pack.cards.map(c => c.id),
            signpostCardId: currentRevision.signpostCardId,
        }
    });
    const dataStr = JSON.stringify(packsToExport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'trappist_packs.json');
    linkElement.click();
  }

  triggerPacksImport() { this.packsImporter.nativeElement.click(); }

  importPacks(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const importedPacks: PersistedPack[] = JSON.parse(e.target?.result as string);
        for(const importedPack of importedPacks) {
            const existingPack = await this.db.packs.where('name').equals(importedPack.name).first();
            if (existingPack) {
                const overwrite = confirm(`A pack named "${importedPack.name}" already exists. Click OK to overwrite it, or Cancel to import as a new copy.`);
                if(overwrite) {
                    const packHistory = await this.db.packs.get(existingPack.id);
                    const newRevision: PackRevision = { ...importedPack, timestamp: Date.now(), reason: 'Imported from file' };
                    packHistory.revisions.push(newRevision);
                    await this.db.packs.put(packHistory);
                } else {
                    await this.createNewPackFromImport(importedPack, ` (2)`);
                }
            } else {
                await this.createNewPackFromImport(importedPack);
            }
        }
        await this.loadPacksFromDb();
        alert(`Successfully processed import file.`);
      } catch (error) {
         if (error instanceof Error) alert(`Import failed: ${error.message}`);
         console.error(error);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  private async createNewPackFromImport(importedPack: PersistedPack, suffix: string = '') {
      let finalName = `${importedPack.name}${suffix}`;
      let i = 2;
      while(await this.db.packs.where('name').equals(finalName).first()) {
          finalName = `${importedPack.name} (${i++})`;
      }

      const newPackHistory: PackHistory = {
          id: crypto.randomUUID(), name: finalName, isDeleted: 0,
          revisions: [{ ...importedPack, name: finalName, timestamp: Date.now(), reason: 'Imported from file' }]
      };
      await this.db.packs.add(newPackHistory);
  }

  // --- Provisional Changes Methods ---
  private markPackAsDirty(packId: string) {
    this.provisionalChanges.update(set => new Set(set.add(packId)));
  }

  async savePackChanges(packId: string) {
    const pack = this.packs().find(p => p.id === packId);
    if (!pack) return;

    const existingNameCollision = await this.db.packs.where('name').equals(pack.name).first();
    if(existingNameCollision && existingNameCollision.id !== pack.id) {
        alert(`Error: A pack named "${pack.name}" already exists. Please choose a different name.`);
        return;
    }

    const existingHistory = await this.db.packs.get(packId);
    const isNewPack = !existingHistory;

    const lastSavedRevision = isNewPack ? null : this.getCurrentRevision(existingHistory);
    const provisionalRevision = this.getCurrentRevision(pack);

    let reason = 'Pack updated';
    const nameChanged = lastSavedRevision ? pack.name !== lastSavedRevision.name : false;

    let cardsChanged = true; // Default to true for new packs
    if (lastSavedRevision) {
        cardsChanged = pack.cards.length !== lastSavedRevision.cardIds.length ||
            !pack.cards.every(c => lastSavedRevision.cardIds.includes(c.id));
    }

    if (isNewPack) {
        reason = 'Initial revision';
    } else if(nameChanged && !cardsChanged) {
        reason = `Name changed to "${pack.name}"`;
    } else if (nameChanged && cardsChanged) {
        reason = `Pack updated and renamed to "${pack.name}"`;
    }

    const newRevision: PackRevision = {
        name: pack.name,
        size: provisionalRevision.size,
        cardIds: pack.cards.map(c => c.id),
        signpostCardId: provisionalRevision.signpostCardId,
        timestamp: Date.now(),
        reason: reason
    };

    const revisionsToSave = isNewPack ? [newRevision] : [...existingHistory.revisions, newRevision];
    const historyToSave = {
        id: pack.id,
        name: pack.name,
        isDeleted: 0,
        revisions: revisionsToSave
    };

    await this.db.packs.put(historyToSave);

    this.packs.update(packs => packs.map(p =>
        p.id === packId ? { ...p, revisions: historyToSave.revisions, isDeleted: 0 } : p
    ));

    this.provisionalChanges.update(set => {
        set.delete(packId);
        return new Set(set);
    });
  }

  private async saveAllPackChanges() {
      for(const packId of this.provisionalChanges()) {
          await this.savePackChanges(packId);
      }
  }

  async discardPackChanges(packId: string) {
      const packHistory = await this.db.packs.get(packId);
      // If the pack isn't in the DB, it's a new, unsaved pack. Discarding it means removing it.
      if (!packHistory) {
          this.packs.update(packs => packs.filter(p => p.id !== packId));
          if (this.activePackId() === packId) {
            this.activePackId.set(this.packs()[0]?.id || null);
          }
      } else {
        // Otherwise, revert to the last saved state from the DB.
        const currentRevision = this.getCurrentRevision(packHistory);
        const cards = await this.hydrateCardIds(currentRevision.cardIds);
        const restoredPack = { ...packHistory, cards };
        this.packs.update(packs => packs.map(p => p.id === packId ? restoredPack : p));
      }

      this.provisionalChanges.update(set => {
          set.delete(packId);
          return new Set(set);
      });
  }

  // --- UI Helpers ---
  showCardImage(card: CardDocument) { this.hoveredCard.set(card); }
  hideCardImage() { this.hoveredCard.set(null); }
  getSignpostCardArtCrop(pack: Pack): string | undefined {
    const signpostCardId = this.getCurrentRevision(pack).signpostCardId;
    if (!signpostCardId) return undefined;
    const signpostCard = pack.cards.find(c => c.id === signpostCardId);
    if (!signpostCard) return undefined;
    if (signpostCard.card_faces && signpostCard.card_faces.length > 0) {
      return signpostCard.card_faces[0].image_uris?.art_crop;
    }
    return signpostCard.image_uris?.art_crop;
  }

  public getDisplayManaCost(card: CardDocument): string {
    if (!card) return '';
    // If a top-level mana cost exists, always prefer it.
    if (card.mana_cost) {
        return card.mana_cost;
    }
    // Tweak 4: If no top-level cost, but faces exist, concatenate face costs.
    if (card.card_faces && card.card_faces.length > 0) {
        return card.card_faces
            .map(face => face.mana_cost)
            .filter(cost => cost && cost.length > 0) // Filter out empty strings or nulls
            .join(' // ');
    }
    return ''; // Default to empty string
  }

  public formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
}
