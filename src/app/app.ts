import { ChangeDetectionStrategy, Component, effect, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// Dexie is a minimalist wrapper for IndexedDB
// We will load it from a CDN in the component's template.
// We declare the namespace and types here to satisfy the TypeScript compiler,
// as it doesn't know about the script loaded in the template.
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
    }

    interface Collection {
        limit(count: number): Collection;
        toArray(): Promise<any[]>;
    }
}


// Define the structure of a card document in the database
interface CardDocument {
  id: string; // UUIDv4, so it's a string
  name: string;
  image_uris?: {
    normal?: string;
  };
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  produced_mana?: string[];
  keywords?: string[];
  reprint?: boolean;
}


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trappist.component.html',
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

  // --- Card Search & List State ---
  searchText = signal<string>('');
  suggestions = signal<CardDocument[]>([]);
  addedCards = signal<CardDocument[]>([]);
  hoveredCard = signal<CardDocument | null>(null);
  mousePos = signal<{x: number, y: number}>({ x: 0, y: 0 });

  // --- Database Properties ---
  private db: any;

  constructor() {
    effect(async () => {
      const search = this.searchText();
      if(search.length < 2) {
        this.suggestions.set([]);
        return;
      }
      if (this.db?.cards) {
         const results = await this.db.cards.where('name').startsWithIgnoreCase(search).limit(10).toArray();
         this.suggestions.set(results);
      }
    });

    // Add mouse move listener for image preview
    document.addEventListener('mousemove', (event) => {
      this.mousePos.set({ x: event.clientX, y: event.clientY });
    });
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
          this.version(2).stores({
            cards: 'id, name, type_line, cmc, *colors, *color_identity, *keywords',
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    } else {
      this.selectedFile.set(null);
    }
  }

  async downloadAndStoreData() {
    if (!this.jsonUrl()) return;
    this.isLoading.set(true);
    this.status.set('Downloading data...');
    try {
      const response = await fetch(this.jsonUrl());
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const jsonData = await response.json();
      await this.storeDataInDb(jsonData);
    } catch (error) {
      this.status.set('Failed to download or store data.');
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
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File could not be read as text.');
        const jsonData = JSON.parse(text);
        await this.storeDataInDb(jsonData);
      } catch (error) {
        this.status.set('Error reading or parsing file.');
        console.error('File Read/Parse Error:', error);
        this.dataExists.set(false);
      } finally {
        this.isLoading.set(false);
      }
    };
    reader.onerror = () => {
      this.status.set('Failed to read the selected file.');
      console.error('FileReader error.');
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

    const dataToStore = rawData.filter(card => card.reprint === false);

    this.status.set(`Data processed. Storing ${dataToStore.length} non-reprint cards...`);
    await this.db.cards.bulkAdd(dataToStore);
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
        this.addedCards.set([]); // Clear the card list as well
    } catch (error) {
        this.status.set('Error clearing database.');
        console.error('Failed to clear database', error);
    } finally {
        this.isChecking.set(false);
        this.isLoading.set(false);
    }
  }

  // --- New Methods for Card Search & List ---

  updateSearchText(text: string) {
    this.searchText.set(text);
  }

  addCardToList(card: CardDocument) {
    this.addedCards.update(currentCards => [...currentCards, card]);
    this.searchText.set('');
    this.suggestions.set([]);
  }

  addFirstSuggestion() {
    const firstSuggestion = this.suggestions()[0];
    if (firstSuggestion) {
      this.addCardToList(firstSuggestion);
    }
  }

  removeCardFromList(index: number) {
    this.addedCards.update(currentCards => currentCards.filter((_, i) => i !== index));
  }

  showCardImage(card: CardDocument) {
    this.hoveredCard.set(card);
  }

  hideCardImage() {
    this.hoveredCard.set(null);
  }

  statusColor(): string {
    const currentStatus = this.status();
    if (currentStatus.includes('Successfully') || currentStatus.includes('found') || currentStatus.includes('Ready')) {
      return 'text-green-400';
    }
    if (currentStatus.includes('Error') || currentStatus.includes('Failed') || currentStatus.includes('delet')) {
      return 'text-red-400';
    }
    return 'text-amber-400';
  }
}
