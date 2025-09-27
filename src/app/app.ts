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
import { MatTabsModule } from '@angular/material/tabs';
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
        bulkPut(items: readonly T[], keys?: TKey[]): Promise<TKey>;
        clear(): Promise<void>;
        where(index: string | string[]): WhereClause;
        put(item: T, key?: TKey): Promise<TKey>;
        update(key: TKey, changes: {[keyPath: string]: any}): Promise<number>;
        toCollection(): Collection;
    }
    interface WhereClause {
        startsWithIgnoreCase(key: string): Collection;
        anyOf(...keys: any[]): Collection;
        equals(key: string | boolean | number): Collection;
    }
    interface Collection {
        limit(count: number): Collection;
        toArray(): Promise<any[]>;
        first(): Promise<any | undefined>;
        delete(): Promise<number>;
        count(): Promise<number>;
        modify(changes: (obj: any) => void): Promise<number>;
        filter(fn: (obj: any) => boolean): Collection;
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
  tags?: string[]; // New: For tag short names
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

interface Tag {
  id: string;
  name: string;
  icon: string; // Changed from short_name
  description?: string;
  category?: string;
  type: 'local' | 'remote';
  // For local tags
  query?: {
    field: string;
    op: 'regex' | 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'ne';
    value: any;
  };
  // For remote tags
  scryfall_query?: string;
  cached_card_names?: string[];
  // Timestamps
  created_at: number;
  updated_at: number;
}

interface TaggingProgress {
  status: string;
  currentTag?: string;
  currentTagMatches?: number;
  totalTags: number;
  processedTags: number;
  elapsedTime: string;
  initialDbSize?: number;
  finalDbSize?: number;
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
    MatMenuModule, MatDividerModule, DragDropModule, MatTabsModule
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

  // --- Tag Management State ---
  isTagEditorVisible = signal<boolean>(false);
  tags = signal<Tag[]>([]);
  selectedTag = signal<Tag | null>(null);
  isLoadingTags = signal<boolean>(false);
  taggingProgress = signal<TaggingProgress | null>(null);
  @ViewChild('tagsImporter') tagsImporter!: ElementRef<HTMLInputElement>;
  isIconPickerVisible = signal(false);
  iconSearchTerm = signal('');

  private tagMap = computed(() => new Map(this.tags().map(t => [t.icon, t])));

  // --- Database Properties ---
  private db: any;
  private sanitizer: DomSanitizer;

  // --- Icon Picker Properties ---
  readonly iconCategories: { [key: string]: { prefix: string; icons: string[] } } = {
    'Font Awesome': {
      prefix: 'fa-',
      icons: ['fa-solid fa-star', 'fa-solid fa-heart', 'fa-solid fa-bolt', 'fa-solid fa-leaf', 'fa-solid fa-fire', 'fa-solid fa-water', 'fa-solid fa-wind', 'fa-solid fa-mountain', 'fa-solid fa-sun', 'fa-solid fa-moon', 'fa-solid fa-snowflake', 'fa-solid fa-skull', 'fa-solid fa-crown', 'fa-solid fa-shield-halved', 'fa-solid fa-hat-wizard', 'fa-solid fa-dungeon', 'fa-solid fa-scroll', 'fa-solid fa-book', 'fa-solid fa-potion', 'fa-solid fa-ring', 'fa-solid fa-gem', 'fa-solid fa-hammer', 'fa-solid fa-axe', 'fa-solid fa-sword', 'fa-solid fa-bow-arrow', 'fa-solid fa-wand-magic-sparkles', 'fa-solid fa-hand-fist', 'fa-solid fa-dragon', 'fa-solid fa-spider', 'fa-solid fa-ghost', 'fa-solid fa-bug']
    },
    'Mana - Mana & Resource Symbols': {
      prefix: 'ms-',
      icons: ['ms-d', 'ms-e', 'ms-h', 'ms-l', 'ms-paw', 'ms-s']
    },
    'Mana - Card Symbols': {
      prefix: 'ms-',
      icons: ['ms-acorn', 'ms-artist-brush', 'ms-artist-nib', 'ms-chaos']
    },
    'Mana - Loyalty Symbols': {
      prefix: 'ms-',
      icons: ['ms-loyalty-up', 'ms-loyalty-down', 'ms-loyalty-zero', 'ms-loyalty-start', 'ms-defense', 'ms-defense-outline']
    },
    'Emojis': {
      prefix: 'emoji-',
      icons: ['👍', '👎', '🔥', '💀', '🎉', '💧', '☀️', '⭐', '❤️', '💯', '💰', '👑', '💣', '✅', '❌']
    }
  };
  objectKeys = Object.keys;

  filteredIcons = computed(() => {
    const term = this.iconSearchTerm().toLowerCase().replace(/[-_\s]/g, '');
    if (!term) {
      return this.iconCategories;
    }
    const filtered: { [key: string]: { prefix: string; icons: string[] } } = {};
    for (const category in this.iconCategories) {
      const catData = this.iconCategories[category as keyof typeof this.iconCategories];
      const matchingIcons = catData.icons.filter(icon =>
        icon.toLowerCase().replace(/[-_\s]/g, '').includes(term)
      );
      if (matchingIcons.length > 0) {
        filtered[category] = { ...catData, icons: matchingIcons };
      }
    }
    return filtered;
  });

  constructor() {
    this.sanitizer = inject(DomSanitizer);
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
        public tags!: Dexie.Table<Tag, string>;

        constructor() {
          super('TrappistDB');
          this.version(8).stores({
            cards: 'id, &name_lowercase, name, type_line, cmc, *colors, *color_identity, *keywords, *tags',
            packs: 'id, &name, isDeleted',
            tags: 'id, &name, &icon'
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
        await this.loadTagsFromDb();
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
      await this.loadTagsFromDb();
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
        await this.loadTagsFromDb();
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

  async clearTagData() {
    if (!confirm('Are you sure you want to delete ALL tag data? This cannot be undone.')) return;
    this.isLoading.set(true);
    this.status.set('Deleting tag data...');
    try {
        await this.db.tags.clear();
        this.status.set('All tag data has been deleted.');
        await this.loadTagsFromDb();
        // Optionally re-apply (which will do nothing) to clear tags from cards
        await this.applyAllTags();
    } catch (error) {
        this.status.set('Error clearing tag data.');
        console.error('Error clearing tag data:', error);
    } finally {
        this.isLoading.set(false);
    }
  }

  async clearAllData() {
    if (!confirm('Are you sure you want to delete ALL card, pack, and tag data? This cannot be undone.')) return;
    this.isLoading.set(true);
    this.status.set('Deleting all local data...');
    try {
        await this.db.cards.clear();
        await this.db.packs.clear();
        await this.db.tags.clear();
        this.status.set('All local data deleted. Ready to proceed.');
        this.dataExists.set(false);
        this.cardCount.set(0);
        this.selectedFile.set(null);
        this.packs.set([]);
        this.tags.set([]);
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

    const cardDocs = await this.db.cards.where('id').anyOf(...validIds).toArray();
    const cardMap = new Map<string, CardDocument>(cardDocs.map((c: CardDocument) => [c.id, c]));

    return cardIds.map(id => id ? (cardMap.get(id) || null) : null);
  }

  private async hydrateCardNames(cardNames: (string | null)[]): Promise<(CardDocument | null)[]> {
    const validNames = cardNames.filter((name): name is string => name !== null);
    if (validNames.length === 0) return Array(cardNames.length).fill(null);

    const cardDocs: CardDocument[] = await this.db.cards.where('name').anyOf(...validNames).toArray();
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

  // --- Tag Management ---
  private async loadTagsFromDb() {
    try {
      const allTags: Tag[] = await this.db.tags.toArray();
      this.tags.set(allTags);
    } catch (e) {
      console.error('Failed to load tags from DB', e);
      this.tags.set([]);
    }
  }

  selectTagForEditing(tag: Tag | null) {
    this.selectedTag.set(tag ? {...tag} : null); // Edit a copy
  }

  addNewTag() {
    const newTag: Tag = {
      id: crypto.randomUUID(),
      name: 'New Tag',
      icon: 'fa-solid fa-star',
      type: 'local',
      created_at: Date.now(),
      updated_at: Date.now(),
      query: { field: 'name', op: 'regex', value: 'keyword' }
    };
    this.selectTagForEditing(newTag);
  }

  async saveSelectedTag() {
    const tagToSave = this.selectedTag();
    if (!tagToSave) return;

    tagToSave.updated_at = Date.now();
    await this.db.tags.put(tagToSave);
    await this.loadTagsFromDb();
    this.selectTagForEditing(null);
  }

  updateTagQuery(jsonString: string) {
    const tag = this.selectedTag();
    if (!tag) return;
    try {
      const newQuery = jsonString ? JSON.parse(jsonString) : undefined;
      this.selectedTag.set({ ...tag, query: newQuery });
    } catch (e) {
      console.error('Invalid JSON for tag query:', jsonString, e);
      // Optionally provide user feedback here
    }
  }

  async deleteTag(tagId: string) {
    if (!confirm('Are you sure you want to delete this tag? This cannot be undone.')) return;
    await this.db.tags.delete(tagId);
    await this.loadTagsFromDb();
    if(this.selectedTag()?.id === tagId) {
        this.selectTagForEditing(null);
    }
  }

  async cacheRemoteTag(tagId: string) {
    let tag = this.selectedTag();
    if (!tag || tag.id !== tagId) {
        tag = this.tags().find(t => t.id === tagId) ?? null;
    }

    if (!tag || tag.type !== 'remote' || !tag.scryfall_query) return;

    this.isLoadingTags.set(true);
    this.status.set(`Caching cards for tag "${tag.name}"...`);
    let allCardNames: string[] = [];
    let next_page_url: string | null = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(tag.scryfall_query)}`;

    try {
      while (next_page_url) {
        const response = await fetch(next_page_url);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Scryfall API error: ${errorData.details || response.statusText}`);
        }
        const pageData = await response.json();
        const cardData = pageData.data || [];
        cardData.forEach((card: any) => {
          if (card && typeof card.name === 'string') {
            allCardNames.push(card.name);
          }
        });
        this.status.set(`Caching... Fetched ${allCardNames.length} card names for "${tag.name}"...`);

        // Update the signal for immediate feedback in the UI
        this.selectedTag.update(currentTag => {
            if (currentTag && currentTag.id === tagId) {
                return { ...currentTag, cached_card_names: [...allCardNames] };
            }
            return currentTag;
        });

        next_page_url = pageData.has_more ? pageData.next_page : null;
        if (next_page_url) await new Promise(resolve => setTimeout(resolve, 100)); // Be nice to API
      }
      this.status.set(`Finished caching ${allCardNames.length} cards for tag "${tag.name}". Save the tag to persist changes.`);
    } catch (error) {
      console.error('Failed to cache remote tag:', error);
      if (error instanceof Error) this.status.set(`Error caching tag: ${error.message}`);
      else this.status.set('An unknown error occurred while caching tag.');
    } finally {
      this.isLoadingTags.set(false);
    }
  }

  async applyAllTags() {
    if (!confirm('This will clear all existing tags from cards and re-apply them based on current tag definitions. This may take a moment. Continue?')) return;

    this.isLoading.set(true);
    const startTime = Date.now();
    let timerInterval: any;

    try {
      const initialEstimate = await navigator.storage.estimate();
      const initialDbSize = initialEstimate.usage || 0;

      const allTags: Tag[] = await this.db.tags.toArray();
      const allCards: CardDocument[] = await this.db.cards.toArray();

      this.taggingProgress.set({
        status: 'Initializing...',
        totalTags: allTags.length,
        processedTags: 0,
        elapsedTime: '0.0s',
        initialDbSize
      });

      timerInterval = setInterval(() => {
        this.taggingProgress.update(p => {
          if (!p) return null;
          const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
          return { ...p, elapsedTime: `${elapsedTime}s` };
        });
      }, 100);

      this.taggingProgress.update(p => p ? { ...p, status: 'Applying tags...' } : p);
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update

      // Pre-process tags for efficient lookup
      const localTags = allTags.filter(t => t.type === 'local' && t.query && t.query.field);
      const remoteTagLookups = allTags
        .filter(t => t.type === 'remote' && t.cached_card_names)
        .map(tag => ({
          icon: tag.icon,
          nameSet: new Set(tag.cached_card_names)
        }));

      // 1. Iterate through each card and build its tag list from scratch
      for (const card of allCards) {
          const newTags = new Set<string>();

          // A. Apply local tags based on queries
          for (const tag of localTags) {
              let match = false;
              const { field, op, value } = tag.query!;
              const regex = (op === 'regex' && typeof value === 'string') ? new RegExp(value, 'i') : null;
              const cardValue = (card as any)[field];

              if (cardValue !== undefined && cardValue !== null) {
                if (Array.isArray(cardValue)) {
                  if (regex) {
                    if (cardValue.some(item => typeof item === 'string' && regex.test(item))) match = true;
                  } else if (op === 'eq') {
                    if (cardValue.some(item => String(item).toLowerCase() === String(value).toLowerCase())) match = true;
                  }
                } else if (typeof cardValue === 'string') {
                  if (regex) {
                    if (regex.test(cardValue)) match = true;
                  } else if (op === 'eq') {
                    if (cardValue.toLowerCase() === String(value).toLowerCase()) match = true;
                  }
                } else if (typeof cardValue === 'number' && (typeof value === 'number' || typeof value === 'string')) {
                  const numValue = Number(value);
                  if (!isNaN(numValue)) {
                      switch (op) {
                        case 'lt': if (cardValue < numValue) match = true; break;
                        case 'lte': if (cardValue <= numValue) match = true; break;
                        case 'eq': if (cardValue === numValue) match = true; break;
                        case 'gte': if (cardValue >= numValue) match = true; break;
                        case 'gt': if (cardValue > numValue) match = true; break;
                        case 'ne': if (cardValue !== numValue) match = true; break;
                      }
                  }
                }
              }

              if (match) {
                  newTags.add(tag.icon);
              }
          }

          // B. Apply remote tags based on cached names
          for (const { icon, nameSet } of remoteTagLookups) {
              if (nameSet.has(card.name)) {
                  newTags.add(icon);
              }
          }

          card.tags = Array.from(newTags);
      }

      this.taggingProgress.update(p => p ? { ...p, status: 'Finalizing and saving updates...' } : p);
      await new Promise(resolve => setTimeout(resolve, 0));

      // 2. Save all updated cards back to the database
      this.taggingProgress.update(p => p ? { ...p, status: 'Saving tag updates to database...' } : p);
      await this.db.cards.bulkPut(allCards);

      const finalEstimate = await navigator.storage.estimate();
      const finalDbSize = finalEstimate.usage || 0;

      clearInterval(timerInterval);
      this.taggingProgress.update(p => p ? {
        ...p,
        status: 'Complete!',
        finalDbSize
      } : p);

      await this.loadPacksFromDb(); // Reload packs for UI update

      setTimeout(() => this.taggingProgress.set(null), 5000); // Clear progress after 5s

    } catch (error) {
      clearInterval(timerInterval);
      this.taggingProgress.set(null);
      console.error('Failed to apply tags:', error);
      if (error instanceof Error) this.status.set(`Error applying tags: ${error.message}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  exportTags() {
    const dataStr = JSON.stringify(this.tags(), null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'trappist_tags.json');
    linkElement.click();
  }

  triggerTagsImport() { this.tagsImporter.nativeElement.click(); }

  importTags(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const importedTags: Tag[] = JSON.parse(e.target?.result as string);
        await this.db.tags.bulkPut(importedTags);
        await this.loadTagsFromDb();
        alert(`Successfully imported ${importedTags.length} tags.`);
      } catch (error) {
        if (error instanceof Error) alert(`Import failed: ${error.message}`);
        console.error(error);
      }
    };
    reader.readAsText(file);
    input.value = '';
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

  public getTagTooltip(icon: string): string {
    const tag = this.tagMap().get(icon);
    if (!tag) return icon;
    let tooltip = `${tag.name}`;
    if (tag.category) tooltip += `\nCategory: ${tag.category}`;
    if (tag.description) tooltip += `\n${tag.description}`;
    return tooltip;
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
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    return `${value} ${sizes[i]}`;
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

  // --- Icon Picker Methods ---
  openIconPicker() {
    this.isIconPickerVisible.set(true);
  }

  closeIconPicker() {
    this.isIconPickerVisible.set(false);
    this.iconSearchTerm.set('');
  }

  selectIcon(icon: string) {
    this.selectedTag.update(tag => {
      if (tag) {
        tag.icon = icon;
      }
      return tag;
    });
    this.closeIconPicker();
  }

  getIconHtml(icon: string | undefined): SafeHtml {
    if (!icon) {
      return this.sanitizer.bypassSecurityTrustHtml('<span></span>');
    }
    if (icon.startsWith('fa-')) {
      return this.sanitizer.bypassSecurityTrustHtml(`<i class="${icon}"></i>`);
    }
    if (icon.startsWith('ms-')) {
      return this.sanitizer.bypassSecurityTrustHtml(`<i class="ms ${icon}"></i>`);
    }
    return this.sanitizer.bypassSecurityTrustHtml(`<span>${icon}</span>`);
  }
}
