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
import { MatSelectModule } from '@angular/material/select'; // Import MatSelectModule
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { startWith, map } from 'rxjs/operators';

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
    if (!value) {
      return '';
    }
    // Regex to find all {symbol} templates
    const htmlString = value.replace(/\{([^}]+)\}/g, (match, symbol) => {
      // Sanitize symbol for CSS class: lowercase, remove slashes
      const sanitizedSymbol = symbol.toLowerCase().replace(/[\/]/g, '');
      // Handle specific symbol names (e.g., {T} -> tap)
      const finalSymbol = sanitizedSymbol === 't' ? 'tap' : sanitizedSymbol;
      return `<i class="ms ms-${finalSymbol} ms-cost"></i>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(htmlString);
  }
}

// Dexie type declarations
declare class Dexie {
    constructor(databaseName: string);
    version(versionNumber: number): { stores(schema: { [tableName: string]: string | null }): void; };
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
    }
    interface WhereClause {
        startsWithIgnoreCase(key: string): Collection;
        anyOf(keys: string[]): Collection;
    }
    interface Collection {
        limit(count: number): Collection;
        toArray(): Promise<any[]>;
    }
}

// --- Data Structures ---
interface CardFace {
  name: string;
  image_uris?: { normal?: string; art_crop?: string; };
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
}

interface CardDocument {
  id: string;
  name:string;
  name_lowercase?: string;
  image_uris?: { normal?: string; art_crop?: string; };
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  produced_mana?: string[];
  keywords?: string[];
  reprint?: boolean;
  card_faces?: CardFace[];
  frame_effects?: string[];
}

interface Pack {
  id: string;
  name: string;
  size: number;
  cards: CardDocument[];
  faceCardId?: string;
}

// New interface for leaner storage
interface PersistedPack {
  id: string;
  name: string;
  size: number;
  cardIds: string[];
  faceCardId?: string;
}


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatButtonToggleModule,
    MatAutocompleteModule,
    MatListModule,
    MatIconModule,
    MatSelectModule, // Add MatSelectModule here
    ManaSymbolPipe
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
  @ViewChild('packsImporter') packsImporter!: ElementRef<HTMLInputElement>;


  // --- Database Properties ---
  private db: any;
  private readonly PACKS_STORAGE_KEY = 'trappist-packs-data';

  constructor() {
    this.searchControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filter(value || ''))
    ).subscribe();

    document.addEventListener('mousemove', (event) => {
      this.mousePos.set({ x: event.clientX, y: event.clientY });
    });

    // Effect to automatically save packs to localStorage whenever they change
    effect(() => {
      this.savePacksToStorage(this.packs());
    });
  }

  private async _filter(value: string | CardDocument): Promise<void> {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : value.name.toLowerCase();
    if (filterValue.length < 2) {
      this.suggestions.set([]);
      return;
    }
    if (this.db?.cards) {
       const results = await this.db.cards
                            .where('name')
                            .startsWithIgnoreCase(filterValue)
                            .toArray();

       const filteredResults = results.filter((card: CardDocument) => {
            const typeLine = card.type_line?.toLowerCase();
            if (!typeLine) return true;
            return !typeLine.startsWith('token') && !typeLine.includes('scheme');
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
        public cards: Dexie.Table<CardDocument, string>;
        constructor() {
          super('TrappistDB');
          this.version(4).stores({
            cards: 'id, &name_lowercase, name, type_line, cmc, *colors, *color_identity, *keywords',
          });
          this.cards = this.table('cards');
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
    if (!this.db) {
        this.status.set('Database not initialized.');
        return;
    };
    try {
      const count = await this.db.cards.count();
      if (count > 0) {
        this.status.set(`Local data found! Ready to build.`);
        this.dataExists.set(true);
        this.cardCount.set(count);
        await this.loadPacksFromStorage();
      } else {
        this.status.set('No local card data. Ready to proceed.');
        this.dataExists.set(false);
        this.cardCount.set(0);
      }
    } catch (error)
    {
      this.status.set('Error checking local database.');
      console.error('Error accessing IndexedDB:', error);
    } finally {
      this.isChecking.set(false);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileErrorDetails.set(null);
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    } else {
      this.selectedFile.set(null);
    }
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
      await this.loadPacksFromStorage(); // Initialize packs after data is loaded
    } catch (error) {
      this.status.set('Failed to download or store data.');
      if (error instanceof Error) this.fileErrorDetails.set(error.message);
      console.error('Download/Storage Error:', error);
      this.dataExists.set(false);
    } finally {
      this.isLoading.set(false);
    }
  }

  uploadAndStoreData(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.isLoading.set(true);
    this.status.set(`Reading file: ${file.name}...`);
    this.fileErrorDetails.set(null);
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File could not be read as text.');
        const jsonData = JSON.parse(text);
        await this.storeDataInDb(jsonData);
        await this.loadPacksFromStorage(); // Initialize packs after data is loaded
      } catch (error) {
        this.status.set('Error reading or parsing file.');
        if (error instanceof Error) this.fileErrorDetails.set(error.message);
        else this.fileErrorDetails.set(String(error));
        console.error('File Read/Parse Error:', error);
        this.dataExists.set(false);
      } finally {
        this.isLoading.set(false);
      }
    };
    reader.onerror = (error) => {
      this.status.set('Failed to read the selected file.');
      this.fileErrorDetails.set('The browser reported an error while trying to read the file.');
      console.error('FileReader error:', error);
      this.isLoading.set(false);
    };

    reader.readAsText(file);
  }

  private async storeDataInDb(jsonData: any) {
    let rawData: CardDocument[];
    if (Array.isArray(jsonData)) {
        rawData = jsonData;
    } else if (jsonData.record && Array.isArray(jsonData.record)) {
        rawData = jsonData.record;
    } else {
        throw new Error('Data is not in a recognized array format.');
    }

    const filteredData = rawData.filter(card => card.reprint === false);

    filteredData.forEach(card => {
        if (card.name) card.name_lowercase = card.name.toLowerCase();
    });

    const cardNameGroups = new Map<string, CardDocument[]>();
    for (const card of filteredData) {
        if (!card.name_lowercase) continue;
        const nameKey = card.name_lowercase;
        if (!cardNameGroups.has(nameKey)) cardNameGroups.set(nameKey, []);
        cardNameGroups.get(nameKey)!.push(card);
    }

    const uniqueDataToStore: CardDocument[] = [];
    const conflictNames: string[] = [];

    for (const [name, cards] of cardNameGroups.entries()) {
        if (cards.length === 1) {
            uniqueDataToStore.push(cards[0]);
        } else {
            conflictNames.push(cards[0].name);
            let preferredCard = cards[0];
            for (let i = 1; i < cards.length; i++) {
                const currentIsExtended = preferredCard.frame_effects?.includes('extendedart') ?? false;
                const nextIsExtended = cards[i].frame_effects?.includes('extendedart') ?? false;
                if (currentIsExtended && !nextIsExtended) {
                    preferredCard = cards[i];
                }
            }
            uniqueDataToStore.push(preferredCard);
        }
    }

    if (conflictNames.length > 0) {
        const errorMessage = `Uniqueness conflicts were detected and automatically resolved for ${conflictNames.length} card(s):\n\n- ${conflictNames.join('\n- ')}`;
        this.fileErrorDetails.set(errorMessage);
    } else {
        this.fileErrorDetails.set(null);
    }

    this.status.set(`Data processed. Storing ${uniqueDataToStore.length} unique, non-reprint cards...`);

    await this.db.cards.bulkAdd(uniqueDataToStore);

    const count = await this.db.cards.count();
    this.status.set(`Successfully stored ${count} cards!`);
    this.dataExists.set(true);
    this.cardCount.set(count);
  }

  async clearDatabase() {
    this.isLoading.set(true);
    this.status.set('Deleting local data...');
    try {
        await this.db.cards.clear();
        this.status.set('Local data deleted. Ready to proceed.');
        this.dataExists.set(false);
        this.cardCount.set(0);
        this.selectedFile.set(null);
        this.packs.set([]); // Also clear packs
        localStorage.removeItem(this.PACKS_STORAGE_KEY);
    } catch (error) {
        this.status.set('Error clearing database.');
        console.error('Failed to clear database', error);
    } finally {
        this.isChecking.set(false);
        this.isLoading.set(false);
    }
  }

  // --- Pack Management Methods ---

  addPack() {
    const newPack: Pack = {
      id: crypto.randomUUID(),
      name: `New Pack ${this.packs().length + 1}`,
      size: 20,
      cards: []
    };
    this.packs.update(currentPacks => [...currentPacks, newPack]);
    this.activePackId.set(newPack.id);
  }

  removePack(packId: string) {
    this.packs.update(packs => packs.filter(p => p.id !== packId));
    if (this.activePackId() === packId) {
      this.activePackId.set(this.packs()[0]?.id || null);
    }
  }

  setActivePack(packId: string) {
    this.activePackId.set(packId);
  }

  addCardToActivePack(card: CardDocument) {
    const packId = this.activePackId();
    if (!packId) {
      alert('Please select a pack first!');
      return;
    }
    this.packs.update(packs => {
      return packs.map(pack => {
        if (pack.id === packId) {
          if (pack.cards.length >= pack.size) {
             alert(`Pack "${pack.name}" is full.`);
             return pack;
          }
          const updatedCards = [...pack.cards, card];
          // If this is the first card, make it the face card
          const faceCardId = updatedCards.length === 1 ? card.id : pack.faceCardId;
          return { ...pack, cards: updatedCards, faceCardId };
        }
        return pack;
      });
    });
    this.searchControl.setValue('');
    this.suggestions.set([]);
  }

  removeCardFromPack(packId: string, cardIndex: number) {
    this.packs.update(packs => {
      return packs.map(pack => {
        if (pack.id === packId) {
          const cardToRemove = pack.cards[cardIndex];
          const updatedCards = pack.cards.filter((_, i) => i !== cardIndex);
          // If the removed card was the face card, unset it or pick a new one
          let faceCardId = pack.faceCardId;
          if(faceCardId === cardToRemove.id) {
            faceCardId = updatedCards[0]?.id || undefined;
          }
          return { ...pack, cards: updatedCards, faceCardId };
        }
        return pack;
      });
    });
  }

  setFaceCard(packId: string, cardId: string) {
    this.packs.update(packs => packs.map(pack =>
      pack.id === packId ? { ...pack, faceCardId: cardId } : pack
    ));
  }

  onSuggestionSelected(event: any) {
    this.addCardToActivePack(event.option.value);
  }

  // --- Persistence Methods ---

  private dehydratePacks(packs: Pack[]): PersistedPack[] {
    return packs.map(pack => ({
      id: pack.id,
      name: pack.name,
      size: pack.size,
      cardIds: pack.cards.map(card => card.id),
      faceCardId: pack.faceCardId,
    }));
  }

  private async hydratePacks(persistedPacks: PersistedPack[]): Promise<Pack[]> {
    const allCardIds = [...new Set(persistedPacks.flatMap(p => p.cardIds))];
    if (allCardIds.length === 0) {
      return persistedPacks.map(p => ({ ...p, cards: [] }));
    }

    const cardDocs = await this.db.cards.where('id').anyOf(allCardIds).toArray();
    const cardMap = new Map<string, CardDocument>(cardDocs.map((c: CardDocument) => [c.id, c]));

    return persistedPacks.map(pPack => ({
      ...pPack,
      cards: pPack.cardIds.map(id => cardMap.get(id)!).filter(Boolean),
    }));
  }

  private savePacksToStorage(packs: Pack[]) {
    try {
      const persistedPacks = this.dehydratePacks(packs);
      localStorage.setItem(this.PACKS_STORAGE_KEY, JSON.stringify(persistedPacks));
    } catch (e) {
      console.error('Failed to save packs to localStorage', e);
    }
  }

  private async loadPacksFromStorage() {
    try {
      const storedPacksJSON = localStorage.getItem(this.PACKS_STORAGE_KEY);
      if (storedPacksJSON) {
        const persistedPacks: PersistedPack[] = JSON.parse(storedPacksJSON);
        const hydratedPacks = await this.hydratePacks(persistedPacks);
        this.packs.set(hydratedPacks);
      } else {
        this.addPack();
      }
      if (!this.activePackId() && this.packs().length > 0) {
        this.activePackId.set(this.packs()[0].id);
      }
    } catch (e) {
      console.error('Failed to load packs from localStorage', e);
      this.packs.set([]);
      this.addPack();
    }
  }

  exportPacks() {
    const persistedPacks = this.dehydratePacks(this.packs());
    const dataStr = JSON.stringify(persistedPacks, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'trappist_packs.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  triggerPacksImport() {
    this.packsImporter.nativeElement.click();
  }

  importPacks(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('Could not read imported file.');
        const importedPersistedPacks: PersistedPack[] = JSON.parse(text);

        if (Array.isArray(importedPersistedPacks) && importedPersistedPacks.every(p => p.id && p.name && p.cardIds)) {
           const hydratedPacks = await this.hydratePacks(importedPersistedPacks);
           this.packs.set(hydratedPacks);
           this.activePackId.set(hydratedPacks[0]?.id || null);
           alert(`Successfully imported ${hydratedPacks.length} pack(s).`);
        } else {
           throw new Error('Imported file has an invalid format. Expected cardIds array.');
        }
      } catch (error) {
         if (error instanceof Error) alert(`Import failed: ${error.message}`);
         else alert('An unknown error occurred during import.');
         console.error(error);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }


  // --- UI Helpers ---

  showCardImage(card: CardDocument) {
    this.hoveredCard.set(card);
  }

  hideCardImage() {
    this.hoveredCard.set(null);
  }

  getFaceCardArtCrop(pack: Pack): string | undefined {
    if (!pack.faceCardId) {
      return undefined;
    }
    const faceCard = pack.cards.find(c => c.id === pack.faceCardId);
    if (!faceCard) {
      return undefined;
    }

    // If card_faces exist, use the art_crop from the first face
    if (faceCard.card_faces && faceCard.card_faces.length > 0) {
      return faceCard.card_faces[0].image_uris?.art_crop;
    }

    // Otherwise, use the art_crop from the card itself
    return faceCard.image_uris?.art_crop;
  }
}

