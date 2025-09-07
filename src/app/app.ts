import { ChangeDetectionStrategy, Component, effect, OnInit, signal, Pipe, PipeTransform, inject } from '@angular/core';
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
    }
    interface Collection {
        limit(count: number): Collection;
        toArray(): Promise<any[]>;
    }
}

// Structure for an individual card face
interface CardFace {
  name: string;
  image_uris?: { normal?: string; };
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
}

// Card document structure, now including card_faces
interface CardDocument {
  id: string;
  name:string;
  image_uris?: { normal?: string; };
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
    ManaSymbolPipe // Import the new pipe
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

  // --- Card Search & List State ---
  searchControl = new FormControl('');
  suggestions = signal<CardDocument[]>([]);
  addedCards = signal<CardDocument[]>([]);
  hoveredCard = signal<CardDocument | null>(null);
  mousePos = signal<{x: number, y: number}>({ x: 0, y: 0 });

  // --- Database Properties ---
  private db: any;

  constructor() {
    this.searchControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filter(value || ''))
    ).subscribe();

    // Add mouse move listener for image preview
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
       const results = await this.db.cards.where('name').startsWithIgnoreCase(filterValue).limit(10).toArray();
       this.suggestions.set(results);
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

  addCardToList(card: CardDocument) {
    this.addedCards.update(currentCards => [...currentCards, card]);
    this.searchControl.setValue('');
    this.suggestions.set([]);
  }

  onSuggestionSelected(event: any) {
    this.addCardToList(event.option.value);
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
}

