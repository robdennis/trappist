import { ChangeDetectionStrategy, Component, effect, OnInit, signal, Pipe, PipeTransform, inject, ElementRef, ViewChild, computed } from '@angular/core';
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
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

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
interface ScryfallBulkData {
  id: string;
  type: 'oracle_cards' | 'unique_artwork' | 'default_cards' | 'all_cards' | string;
  name: string;
  description: string;
  download_uri: string;
  updated_at: string;
  size: number;
}
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
  name: string; size: number; cardNames: (string | null)[]; signpostCardName?: string;
  archetype?: string; themes?: string; slots?: string[];
}
interface PackRevision {
    name: string; size: number; cardIds: (string | null)[]; signpostCardId?: string;
    timestamp: number;
    reason?: string;
    archetype?: string; themes?: string; slots?: string[];
}
interface PackHistory {
    id: string;
    name: string;
    revisions: PackRevision[];
    isDeleted: number;
}
interface Pack extends PackHistory {
    cards: (CardDocument | null)[];
}

const DEFAULT_PACK_SLOTS = [
  'Board Advantage', 'Board Advantage', 'Board Advantage', 'Board Advantage',
  'Flex', 'Flex',
  'Disenchant',
  'Creature Removal', 'Creature Removal',
  '+1/+1 counters',
  'Other Themes', 'Other Themes',
  'Tripels Token',
  'Fixing', 'Fixing', 'Fixing', 'Fixing', 'Fixing', 'Fixing', 'Fixing',
  'Fixing Token'
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatProgressBarModule, MatProgressSpinnerModule,
    MatToolbarModule, MatButtonToggleModule, MatAutocompleteModule, MatListModule,
    MatIconModule, MatSelectModule, ManaSymbolPipe, MatExpansionModule, MatTooltipModule,
    MatMenuModule, MatDividerModule, DragDropModule
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
  selectedFile = signal<File | null>(null);
  fileErrorDetails = signal<string | null>(null);
  dbSize = signal<string>('');

  // --- Scryfall Bulk Data State ---
  isLoadingOptions = signal<boolean>(true);
  bulkDataOptions = signal<ScryfallBulkData[]>([]);

  // --- Card Search & List State ---
  slotControls: FormControl[] = [];
  private controlSubscriptions: Subscription[] = [];
  activeSlotIndex = signal<number | null>(null);
  suggestions = signal<CardDocument[]>([]);
  hoveredCard = signal<CardDocument | null>(null);
  mousePos = signal<{x: number, y: number}>({ x: 0, y: 0 });

  // --- Pack Management State ---
  packs = signal<Pack[]>([]);
  activePackId = signal<string | null>(null);
  provisionalChanges = signal<Set<string>>(new Set());
  @ViewChild('packsImporter') packsImporter!: ElementRef<HTMLInputElement>;

  activePack = computed(() => this.packs().find(p => p.id === this.activePackId()));

  // --- Database Properties ---
  private db: any;

  constructor() {
    effect(() => {
      const pack = this.activePack();
      this.setupSlotControls(pack);
    });

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
       const results = await this.db.cards.where('name_lowercase').startsWithIgnoreCase(filterValue).toArray();
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

  private setupSlotControls(pack: Pack | undefined) {
    this.controlSubscriptions.forEach(sub => sub.unsubscribe());
    this.controlSubscriptions = [];

    if (!pack) {
        this.slotControls = [];
        return;
    }

    const size = this.getCurrentRevision(pack).size;
    this.slotControls = Array.from({ length: size }, (_, i) => new FormControl(pack.cards[i]?.name || ''));

    this.slotControls.forEach((control, index) => {
        const sub = control.valueChanges.pipe(
            debounceTime(200),
            distinctUntilChanged(),
        ).subscribe(value => {
            if (this.activeSlotIndex() === index && typeof value === 'string') {
                this._filter(value);
            }
        });
        this.controlSubscriptions.push(sub);
    });
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
          this.version(6).stores({
            cards: 'id, &name_lowercase, name, type_line, cmc, *colors, *color_identity, *keywords',
            packs: 'id, &name, isDeleted'
          });
        }
      }
      this.db = new TrappistDB();
      this.status.set('Database initialized. Checking for local data...');
      await this.checkIfDataExists();
       if (!this.dataExists()) {
        this.fetchBulkDataOptions();
      }
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

  async fetchBulkDataOptions() {
    this.isLoadingOptions.set(true);
    this.status.set('Fetching bulk data options from Scryfall...');
    try {
      const response = await fetch('https://api.scryfall.com/bulk-data');
      if (!response.ok) {
        throw new Error(`Failed to fetch bulk data list: ${response.statusText}`);
      }
      const result = await response.json();
      const relevantTypes = new Set(['oracle_cards', 'unique_artwork', 'default_cards', 'all_cards', 'rulings']);
      this.bulkDataOptions.set(result.data.filter((d: ScryfallBulkData) => relevantTypes.has(d.type)));
      this.status.set('Ready to download or upload card data.');
    } catch (error) {
      console.error('Failed to fetch bulk data options:', error);
      if (error instanceof Error) this.status.set(`Error: ${error.message}`);
      else this.status.set('An unknown error occurred while fetching bulk data options.');
    } finally {
      this.isLoadingOptions.set(false);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fileErrorDetails.set(null);
    if (input.files && input.files.length > 0) this.selectedFile.set(input.files[0]);
    else this.selectedFile.set(null);
  }

  async downloadAndStoreData(option: ScryfallBulkData) {
    if (!option.download_uri) return;

    if (option.type === 'all_cards') {
      const confirmation = confirm(
        'You are about to download and process the "All Cards" file, which is over 2GB in size. ' +
        'This may take a very long time and consume a lot of browser memory and disk space. ' +
        'Are you sure you want to continue?'
      );
      if (!confirmation) return;
    }

    this.isLoading.set(true);
    this.fileErrorDetails.set(null);
    this.status.set(`Downloading data for "${option.name}"...`);
    try {
      const response = await fetch(option.download_uri);
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

    const promoArtFilteredData = rawData.filter(card => {
        if (card.card_faces && card.card_faces.length > 1) {
            const faceNames = new Set(card.card_faces.map(face => face.name));
            return faceNames.size > 1;
        }
        return true;
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
    await this.db.cards.clear();
    await this.db.cards.bulkAdd(uniqueDataToStore);
    const count = await this.db.cards.count();
    this.status.set(`Successfully stored ${count} cards!`);
    this.dataExists.set(true);
    this.cardCount.set(count);
  }

  async updateDbSize() {
    // navigator.storage.estimate() provides the most reliable and standard way.
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (typeof estimate.usage !== 'undefined') {
          // This gives total storage for the origin, which is a good proxy.
          this.dbSize.set(this.formatBytes(estimate.usage));
          return;
        }
      } catch (error) {
        console.warn("Could not estimate storage usage:", error);
      }
    }

    // Fallback to the experimental/non-standard indexedDB.databases() method.
    // Note: The 'size' property is not part of the spec and only available in some browsers.
    if ('indexedDB' in window && (window.indexedDB as any).databases) {
      try {
        const databases = await (window.indexedDB as any).databases();
        const dbInfo = databases.find((db: any) => db.name === 'TrappistDB');
        if (dbInfo && dbInfo.size) {
          this.dbSize.set(this.formatBytes(dbInfo.size));
          return;
        }
      } catch (error) {
        console.error("Error getting database size via indexedDB.databases():", error);
      }
    }

    this.dbSize.set(''); // Reset if size cannot be determined
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
        this.fetchBulkDataOptions();
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
        this.fetchBulkDataOptions();
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
      id: packId, name: finalName, isDeleted: 0,
      revisions: [{
        name: finalName, size: 20, cardIds: Array(20).fill(null), timestamp: Date.now(),
        reason: 'Initial revision', archetype: 'Midrange', themes: 'Tokens, +1/+1 Counters',
        slots: [...DEFAULT_PACK_SLOTS]
      }],
      cards: Array(20).fill(null)
    };

    this.packs.update(currentPacks => [...currentPacks, newPackForUI]);
    this.activePackId.set(packId);
    this.markPackAsDirty(packId);
  }

  async removePack(packId: string) {
    if (!confirm('Are you sure you want to delete this pack?')) return;
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

  onPackMetaChange(packId: string, field: 'name' | 'archetype' | 'themes', value: string) {
    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const latestRevision = this.getCurrentRevision(p);
            const updatedRevision = { ...latestRevision, [field]: value };
            if (field === 'name') {
                return { ...p, name: value, revisions: [...p.revisions.slice(0, -1), updatedRevision] };
            }
            return { ...p, revisions: [...p.revisions.slice(0, -1), updatedRevision] };
        }
        return p;
    }));
    this.markPackAsDirty(packId);
  }

  onSlotLabelChange(packId: string, slotIndex: number, newLabel: string) {
    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const latestRevision = this.getCurrentRevision(p);
            const newSlots = [...(latestRevision.slots || Array(latestRevision.size).fill(''))];
            newSlots[slotIndex] = newLabel;
            const updatedRevision = { ...latestRevision, slots: newSlots };
            return { ...p, revisions: [...p.revisions.slice(0, -1), updatedRevision] };
        }
        return p;
    }));
    this.markPackAsDirty(packId);
  }

  setActivePack(packId: string) { this.activePackId.set(packId); }

  addCardToSlot(card: CardDocument, index: number) {
    const packId = this.activePackId();
    if (!packId) return;

    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const updatedCards = [...p.cards];
            updatedCards[index] = card;
            return { ...p, cards: updatedCards };
        }
        return p;
    }));

    this.slotControls[index].setValue(card.name, { emitEvent: false });
    this.markPackAsDirty(packId);
    this.suggestions.set([]);
  }

  removeCardFromSlot(packId: string, index: number) {
    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const cardToRemove = p.cards[index];
            if (!cardToRemove) return p;

            const updatedCards = [...p.cards];
            updatedCards[index] = null;

            const latestRevision = this.getCurrentRevision(p);
            if (latestRevision.signpostCardId === cardToRemove.id) {
                 const newLatestRevision = {...latestRevision, signpostCardId: undefined };
                 return { ...p, cards: updatedCards, revisions: [...p.revisions.slice(0, -1), newLatestRevision] };
            }
            return {...p, cards: updatedCards};
        }
        return p;
    }));
    this.slotControls[index].setValue('', { emitEvent: false });
    this.markPackAsDirty(packId);
  }

  onCardDrop(event: CdkDragDrop<(CardDocument | null)[]>) {
    const packId = this.activePackId();
    if (!packId || event.previousIndex === event.currentIndex) return;

    this.packs.update(packs => packs.map(p => {
        if (p.id === packId) {
            const updatedCards = [...p.cards];

            const latestRevision = this.getCurrentRevision(p);
            const updatedSlots = [...(latestRevision.slots || [])];

            moveItemInArray(updatedCards, event.previousIndex, event.currentIndex);
            moveItemInArray(updatedSlots, event.previousIndex, event.currentIndex);

            const updatedRevision = { ...latestRevision, slots: updatedSlots };

            return { ...p, cards: updatedCards, revisions: [...p.revisions.slice(0, -1), updatedRevision] };
        }
        return p;
    }));

    this.markPackAsDirty(packId);

    const pack = this.activePack();
    if (pack) {
        this.setupSlotControls(pack);
    }
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
  private async hydrateCardIds(cardIds: (string | null)[]): Promise<(CardDocument | null)[]> {
    const validIds = cardIds.filter((id): id is string => id !== null);
    if (validIds.length === 0) return Array(cardIds.length).fill(null);

    const cardDocs = await this.db.cards.where('id').anyOf(validIds).toArray();
    const cardMap = new Map<string, CardDocument>(cardDocs.map((c: CardDocument) => [c.id, c]));

    return cardIds.map(id => id ? (cardMap.get(id) || null) : null);
  }

  private async hydrateCardNames(cardNames: (string | null)[]): Promise<(CardDocument | null)[]> {
    const validNames = cardNames.filter((name): name is string => name !== null);
    if (validNames.length === 0) return Array(cardNames.length).fill(null);

    const cardDocs: CardDocument[] = await this.db.cards.where('name').anyOf(validNames).toArray();
    const cardMap = new Map<string, CardDocument>(cardDocs.map(c => [c.name, c]));

    return cardNames.map(name => name ? (cardMap.get(name) || null) : null);
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
        const signpostCard = pack.cards.find(c => c?.id === currentRevision.signpostCardId);
        return {
            name: pack.name,
            size: currentRevision.size,
            archetype: currentRevision.archetype,
            themes: currentRevision.themes,
            slots: currentRevision.slots,
            cardNames: pack.cards.map(c => c ? c.name : null),
            signpostCardName: signpostCard?.name,
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
                    const cards = await this.hydrateCardNames(importedPack.cardNames);
                    const signpostCard = importedPack.signpostCardName ? cards.find(c => c?.name === importedPack.signpostCardName) : undefined;
                    const newRevision: PackRevision = {
                        name: importedPack.name,
                        size: importedPack.size,
                        cardIds: cards.map(c => c ? c.id : null),
                        signpostCardId: signpostCard?.id,
                        timestamp: Date.now(),
                        reason: 'Imported from file',
                        archetype: importedPack.archetype,
                        themes: importedPack.themes,
                        slots: importedPack.slots || [...DEFAULT_PACK_SLOTS],
                    };
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

      const cards = await this.hydrateCardNames(importedPack.cardNames);
      const signpostCard = importedPack.signpostCardName ? cards.find(c => c?.name === importedPack.signpostCardName) : undefined;

      const newPackHistory: PackHistory = {
          id: crypto.randomUUID(), name: finalName, isDeleted: 0,
          revisions: [{
            name: finalName,
            size: importedPack.size,
            cardIds: cards.map(c => c ? c.id : null),
            signpostCardId: signpostCard?.id,
            timestamp: Date.now(),
            reason: 'Imported from file',
            archetype: importedPack.archetype,
            themes: importedPack.themes,
            slots: importedPack.slots || [...DEFAULT_PACK_SLOTS],
        }]
      };
      await this.db.packs.add(newPackHistory);
  }

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

    if (isNewPack) {
        reason = 'Initial revision';
    } else if (lastSavedRevision && pack.name !== lastSavedRevision.name) {
        reason = `Name changed to "${pack.name}"`;
    }

    const newRevision: PackRevision = {
        name: pack.name,
        size: provisionalRevision.size,
        cardIds: pack.cards.map(c => c ? c.id : null),
        signpostCardId: provisionalRevision.signpostCardId,
        timestamp: Date.now(),
        reason: reason,
        archetype: provisionalRevision.archetype,
        themes: provisionalRevision.themes,
        slots: provisionalRevision.slots
    };

    const revisionsToSave = isNewPack ? [newRevision] : [...existingHistory.revisions, newRevision];
    const historyToSave: PackHistory = {
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
      if (!packHistory) {
          this.packs.update(packs => packs.filter(p => p.id !== packId));
          if (this.activePackId() === packId) {
            this.activePackId.set(this.packs()[0]?.id || null);
          }
      } else {
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

  getSlotsArray(pack: Pack): number[] {
    const size = this.getCurrentRevision(pack)?.size || 0;
    return Array.from({ length: size }, (_, i) => i);
  }

  getFilledSlotsCount(pack: Pack): number {
    if (!pack || !pack.cards) {
        return 0;
    }
    return pack.cards.filter(card => card !== null).length;
  }

  // --- UI Helpers ---
  setActiveSlot(index: number) {
    this.activeSlotIndex.set(index);
    const control = this.slotControls[index];
    if (control && typeof control.value === 'string') {
        this._filter(control.value);
    }
  }

  showCardImage(card: CardDocument | null) { if(card) this.hoveredCard.set(card); }
  hideCardImage() { this.hoveredCard.set(null); }

  getSignpostCardArtCrop(pack: Pack | undefined): string | undefined {
    if (!pack) return undefined;
    const currentRevision = this.getCurrentRevision(pack);
    const signpostCardId = currentRevision.signpostCardId;

    const signpostCard = signpostCardId ? pack.cards.find(c => c?.id === signpostCardId) : undefined;
    const firstCard = pack.cards.find(c => c !== null);

    const cardToDisplay = signpostCard || firstCard;
    if (!cardToDisplay) return undefined;

    if (cardToDisplay.card_faces && cardToDisplay.card_faces.length > 0) {
      return cardToDisplay.card_faces[0].image_uris?.art_crop;
    }
    return cardToDisplay.image_uris?.art_crop;
  }

  public getDisplayManaCost(card: CardDocument | null): string {
    if (!card) return '';
    if (card.mana_cost) {
        return card.mana_cost;
    }
    if (card.card_faces && card.card_faces.length > 0) {
        return card.card_faces
            .map(face => face.mana_cost)
            .filter(cost => cost && cost.length > 0)
            .join(' // ');
    }
    return '';
  }

  public getColorIdentityManaString(card: CardDocument): string {
    if (!card || !card.color_identity) {
      return '';
    }

    if (card.color_identity.length === 0) {
      const typeLine = card.type_line?.toLowerCase() || '';
      // Don't show color indicator for lands unless they have a color identity
      if (typeLine.includes('land')) {
        return '';
      }
      // For colorless artifacts, creatures, etc.
      return '{ci-c}';
    }

    // Using WUBRG order for consistency
    const colorOrder: { [key: string]: number } = { 'W': 1, 'U': 2, 'B': 3, 'R': 4, 'G': 5 };
    const sortedIdentity = [...card.color_identity]
      .sort((a, b) => (colorOrder[a] || 99) - (colorOrder[b] || 99))
      .join('');

    return `{ci-${sortedIdentity.toLowerCase()}}`;
  }

  public formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  public downloadFileLocally(option: ScryfallBulkData) {
    if (option.type === 'all_cards') {
        const confirmation = confirm(
          'You are about to download the "All Cards" file, which is over 2GB in size. ' +
          'This may take a while. Are you sure you want to download it to your computer?'
        );
        if (!confirmation) {
          return;
        }
    }
    const link = document.createElement('a');
    link.href = option.download_uri;
    link.setAttribute('download', `${option.type}.json`);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  public formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  public formatLastUpdated(dateString: string): string {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
