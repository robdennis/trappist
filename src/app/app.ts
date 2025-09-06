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
  template: `
    <!-- The Dexie.js script is now loaded programmatically in the component logic -->

    <div class="bg-slate-900 min-h-screen font-sans text-white p-4">
      <div class="w-full max-w-2xl mx-auto bg-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">

        <!-- Header -->
        <div class="text-center">
          <h1 class="text-4xl font-bold text-teal-400">Trappist-1 Deck Builder</h1>
          <p class="text-slate-400 mt-2">Local Card Database Management with IndexedDB</p>
        </div>

        <!-- Status Display -->
        <div class="bg-slate-700 p-4 rounded-lg text-center">
          <p class="font-mono text-lg" [ngClass]="statusColor()">
            Status: {{ status() }}
          </p>
        </div>

        <!-- DATA LOADER UI -->
        <div *ngIf="!dataExists()">
          <div *ngIf="!isChecking()">

            <!-- Input Mode Toggle -->
            <div class="flex justify-center gap-2 mb-6 border-b border-slate-700 pb-4">
              <button (click)="inputMode.set('url')"
                class="px-4 py-2 rounded-md transition-colors text-sm font-semibold"
                [class.bg-teal-500]="inputMode() === 'url'"
                [class.bg-slate-700]="inputMode() !== 'url'"
                [class.hover:bg-slate-600]="inputMode() !== 'url'">
                From URL
              </button>
              <button (click)="inputMode.set('file')"
                class="px-4 py-2 rounded-md transition-colors text-sm font-semibold"
                [class.bg-teal-500]="inputMode() === 'file'"
                [class.bg-slate-700]="inputMode() !== 'file'"
                [class.hover:bg-slate-600]="inputMode() !== 'file'">
                From Local File
              </button>
            </div>

            <!-- URL Input -->
            <div *ngIf="inputMode() === 'url'">
              <p class="text-center text-slate-300 mb-4">
                Provide the URL to download and store the collection.
              </p>
              <div class="flex flex-col sm:flex-row gap-4">
                <input #urlInput type="text" (input)="jsonUrl.set(urlInput.value)" [value]="jsonUrl()"
                  placeholder="Enter URL to large JSON file"
                  class="flex-grow bg-slate-900 text-white placeholder-slate-500 border-2 border-slate-600 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition" />
                <button (click)="downloadAndStoreData()" [disabled]="isLoading() || !jsonUrl()"
                  class="bg-teal-500 text-slate-900 font-bold py-3 px-6 rounded-md hover:bg-teal-400 transition-transform duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  [class.active:scale-95]="!isLoading()">
                  <span *ngIf="!isLoading()">Download & Store</span>
                  <ng-container *ngIf="isLoading()">
                    <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Processing...
                  </ng-container>
                </button>
              </div>
            </div>

            <!-- File Input -->
            <div *ngIf="inputMode() === 'file'">
              <p class="text-center text-slate-300 mb-4">
                Select a JSON file from your local system to upload.
              </p>
              <div class="flex flex-col items-center gap-4">
                <input type="file" accept=".json,application/json" #fileInput (change)="onFileSelected($event)" class="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-teal-500 file:text-slate-900 hover:file:bg-teal-400"/>
                <div *ngIf="selectedFile()" class="text-center text-xs text-slate-400 mt-1">
                  Selected: <span class="font-medium">{{ selectedFile()?.name }} ({{ (selectedFile()?.size || 0) / 1024 | number:'1.1-2' }} KB)</span>
                </div>
                <button (click)="uploadAndStoreData()" [disabled]="isLoading() || !selectedFile()"
                  class="bg-teal-500 text-slate-900 font-bold py-3 px-6 rounded-md hover:bg-teal-400 transition-transform duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-full sm:w-auto">
                  <span *ngIf="!isLoading()">Upload & Store</span>
                  <ng-container *ngIf="isLoading()">
                    <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Processing...
                  </ng-container>
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- CARD SEARCH AND LIST UI -->
        <div *ngIf="dataExists()">
           <div class="text-center p-6 bg-green-900/50 border border-green-500 rounded-lg space-y-4 mb-6">
              <div>
                <p class="text-xl text-green-300">Data is stored locally in IndexedDB!</p>
                <p class="text-2xl font-bold text-white mt-1">{{ cardCount() }} cards in database</p>
              </div>
              <button (click)="clearDatabase()" [disabled]="isLoading()"
                class="bg-red-600 text-white font-bold py-2 px-5 rounded-md hover:bg-red-500 transition-transform duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed">
                Clear Database
              </button>
           </div>

            <!-- Search Area -->
           <div class="relative space-y-4">
              <label for="cardSearch" class="block text-sm font-medium text-slate-300">Search for a Card</label>
              <input id="cardSearch" #searchInput type="text"
                [value]="searchText()"
                (input)="updateSearchText(searchInput.value)"
                (keydown.enter)="addFirstSuggestion()"
                placeholder="Type a card name..."
                class="w-full bg-slate-900 text-white placeholder-slate-500 border-2 border-slate-600 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition" />

              <!-- Typeahead Suggestions -->
              <div *ngIf="suggestions().length > 0" class="absolute z-10 w-full bg-slate-700 rounded-md shadow-lg mt-1 border border-slate-600 max-h-60 overflow-y-auto">
                @for(card of suggestions(); track card.id) {
                  <div (click)="addCardToList(card)" class="p-3 hover:bg-teal-800 cursor-pointer flex justify-between items-center border-b border-slate-600 last:border-b-0">
                    <span>{{ card.name }}</span>
                    <span class="text-sm text-slate-400 font-mono">{{ card.mana_cost }}</span>
                  </div>
                }
              </div>
           </div>

           <!-- Added Cards List -->
           <div class="space-y-4 pt-4">
              <h3 class="text-xl font-semibold text-slate-200 border-b border-slate-700 pb-2">Card List ({{ addedCards().length }})</h3>
              @for(card of addedCards(); track $index) {
                <div
                  (mouseenter)="showCardImage(card)" (mouseleave)="hideCardImage()"
                  class="bg-slate-700 p-4 rounded-lg flex justify-between items-start gap-4 transition-colors hover:bg-slate-600/50">
                  <div class="flex-grow">
                    <h4 class="font-bold text-teal-400">{{ card.name }} <span class="text-sm text-slate-400 font-mono">{{ card.mana_cost }}</span></h4>
                    <p class="text-sm font-semibold text-slate-300 italic">{{ card.type_line }}</p>
                    <p class="text-sm text-slate-400 mt-2 whitespace-pre-wrap">{{ card.oracle_text }}</p>
                  </div>
                  <button (click)="removeCardFromList($index)" class="bg-red-600/50 text-white text-xs font-bold py-1 px-2 rounded-md hover:bg-red-500 transition-colors">
                    Remove
                  </button>
                </div>
              }
              @if(addedCards().length === 0) {
                <div class="text-center text-slate-500 py-8">
                  <p>Your list is empty.</p>
                  <p>Use the search bar above to find and add cards.</p>
                </div>
              }
           </div>

        </div>

      </div>
    </div>

    <!-- Floating Card Image Preview -->
    <div *ngIf="hoveredCard()?.image_uris?.normal as imageUrl"
      class="fixed z-50 pointer-events-none transform -translate-y-1/2"
      [style.left.px]="mousePos().x + 20" [style.top.px]="mousePos().y">
      <img [src]="imageUrl" alt="Card Image" class="rounded-xl shadow-2xl w-64 border-4 border-slate-500" />
    </div>
  `,
  styles: [`
    /* Using Tailwind CSS via CDN, so no extra global styles are needed */
  `],
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

