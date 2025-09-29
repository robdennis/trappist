import { ChangeDetectionStrategy, Component, OnInit, signal, ViewChild, ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DatabaseService } from './core/database.service';
import { Pack, Tag, PackHistory, PackRevision, DEFAULT_PACK_SLOTS } from './core/models';
import { PacksComponent } from './packs/packs.component';
import { TagsComponent } from './tags/tags.component';
import { DatabaseComponent } from './database/database.component';

@Component({
  selector: 'app-trappist',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatToolbarModule, MatIconModule, MatSelectModule,
    MatMenuModule, MatDividerModule, MatTooltipModule, MatProgressSpinnerModule,
    PacksComponent, TagsComponent, DatabaseComponent
  ],
  templateUrl: './trappist.component.html',
  styleUrls: ['./trappist.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrappistComponent implements OnInit {
  status = signal<string>('Initializing...');
  isChecking = signal<boolean>(true);
  dataExists = signal<boolean>(false);
  dbSize = signal<string>('');

  packs = signal<Pack[]>([]);
  tags = signal<Tag[]>([]);
  visiblePackIds = signal<string[]>([]);
  provisionalChanges = signal<Set<string>>(new Set());

  @ViewChild('packsImporter') packsImporter!: ElementRef<HTMLInputElement>;
  packsControl = new FormControl<string[]>([]);

  isTagEditorVisible = signal<boolean>(false);

  visiblePacks = computed(() => {
    const packMap = new Map(this.packs().map(p => [p.id, p]));
    return this.visiblePackIds().map(id => packMap.get(id)).filter((p): p is Pack => !!p);
  });

  constructor(private db: DatabaseService) {
    this.packsControl.valueChanges.subscribe(ids => {
      if (ids) {
        if (ids.length > 3) {
          this.packsControl.setValue(ids.slice(0, 3), { emitEvent: false });
        } else {
          this.visiblePackIds.set(ids);
        }
      }
    });
  }

  ngOnInit() {
    this.checkIfDataExists();
  }

  async checkIfDataExists() {
    this.isChecking.set(true);
    try {
      const count = await this.db.getCardCount();
      if (count > 0) {
        this.status.set(`Local data found! ${count} cards loaded.`);
        this.dataExists.set(true);
        await this.loadPacksFromDb();
        await this.loadTagsFromDb();
      } else {
        this.status.set('No local card data. Ready to load data.');
        this.dataExists.set(false);
      }
    } catch (error) {
      this.status.set('Error checking local database.');
      console.error('Error checking for data:', error);
    } finally {
      this.isChecking.set(false);
    }
  }

  async loadPacksFromDb() {
    this.provisionalChanges.set(new Set());
    const packHistories: PackHistory[] = await this.db.packs.where('isDeleted').equals(0).toArray();
    const hydratedPacks: Pack[] = await Promise.all(packHistories.map(async (history) => {
      const currentRevision = history.revisions[history.revisions.length - 1];
      const cards = await this.db.hydrateCardIds(currentRevision.cardIds);
      return { ...history, cards };
    }));
    this.packs.set(hydratedPacks);

    if (hydratedPacks.length > 0 && this.visiblePackIds().length === 0) {
      const firstPackId = hydratedPacks[0].id;
      this.visiblePackIds.set([firstPackId]);
      this.packsControl.setValue([firstPackId]);
    } else if (hydratedPacks.length === 0) {
        this.addPack();
    }
  }

  async loadTagsFromDb() {
    this.tags.set(await this.db.tags.toArray());
  }

  handlePackUpdate(updatedPack: Pack) {
    this.packs.update(currentPacks =>
      currentPacks.map(p => p.id === updatedPack.id ? updatedPack : p)
    );
    this.provisionalChanges.update(set => new Set(set.add(updatedPack.id)));
  }

  async savePack(packToSave: Pack) {
    const existingNameCollision = await this.db.packs.where('name').equals(packToSave.name).first();
    if (existingNameCollision && existingNameCollision.id !== packToSave.id) {
        alert(`Error: A pack named "${packToSave.name}" already exists. Please choose a different name.`);
        return;
    }

    const existingHistory = await this.db.packs.get(packToSave.id);
    const isNewPack = !existingHistory;

    const lastRevision = this.getCurrentRevision(packToSave);
    const newRevision: PackRevision = {
        ...lastRevision,
        cardIds: packToSave.cards.map(c => c ? c.id : null),
        timestamp: Date.now(),
        reason: isNewPack ? 'Initial revision' : 'Pack updated'
    };

    const revisionsToSave = isNewPack ? [newRevision] : [...(existingHistory?.revisions || []), newRevision];
    const historyToSave: PackHistory = {
        id: packToSave.id,
        name: newRevision.name,
        isDeleted: 0,
        revisions: revisionsToSave
    };

    await this.db.packs.put(historyToSave);
    this.packs.update(packs => packs.map(p => p.id === packToSave.id ? { ...packToSave, revisions: historyToSave.revisions } : p));
    this.provisionalChanges.update(set => {
      set.delete(packToSave.id);
      return new Set(set);
    });
  }

  async discardPackChanges(packId: string) {
      const packHistory = await this.db.packs.get(packId);
      if (!packHistory) {
          this.packs.update(packs => packs.filter(p => p.id !== packId));
          if (this.visiblePackIds().includes(packId)) {
            this.packsControl.setValue(this.visiblePackIds().filter(id => id !== packId));
          }
      } else {
        const currentRevision = packHistory.revisions[packHistory.revisions.length - 1];
        const cards = await this.db.hydrateCardIds(currentRevision.cardIds);
        const restoredPack = { ...packHistory, cards };
        this.packs.update(packs => packs.map(p => p.id === packId ? restoredPack : p));
      }

      this.provisionalChanges.update(set => {
          set.delete(packId);
          return new Set(set);
      });
  }

  addPack() {
    const existingNames = this.packs().map(p => p.name);
    let nameCounter = 1;
    let finalName = `New Pack`;
    while(existingNames.includes(`${finalName} ${nameCounter}`)) {
      nameCounter++;
    }
    finalName = `New Pack ${nameCounter}`;

    const packId = crypto.randomUUID();
    const newPack: Pack = {
      id: packId, name: finalName, isDeleted: 0,
      revisions: [{
        name: finalName, size: 20, cardIds: Array(20).fill(null), timestamp: Date.now(),
        reason: 'Initial revision', archetype: 'Midrange', themes: 'Tokens, +1/+1 Counters',
        slots: [...DEFAULT_PACK_SLOTS]
      }],
      cards: Array(20).fill(null)
    };

    this.packs.update(currentPacks => [...currentPacks, newPack]);
    this.provisionalChanges.update(set => new Set(set.add(packId)));

    const newVisibleIds = [...this.visiblePackIds(), packId].slice(-3);
    this.packsControl.setValue(newVisibleIds);
  }

  async removePack(packId: string) {
    if (!confirm('Are you sure you want to delete this pack?')) return;

    await this.db.packs.update(packId, { isDeleted: 1 });

    this.provisionalChanges.update(set => {
        set.delete(packId);
        return new Set(set);
    });
    this.packs.update(packs => packs.filter(p => p.id !== packId));
    this.packsControl.setValue(this.visiblePackIds().filter(id => id !== packId));
  }

  getCurrentRevision = (pack: PackHistory) => pack.revisions[pack.revisions.length - 1];

  async updateDbSize() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      this.dbSize.set(this.formatBytes(estimate.usage || 0));
    }
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    return `${value} ${sizes[i]}`;
  }

  async clearCardData() {
    if (!confirm('Are you sure you want to delete ALL card data?')) return;
    await this.db.clearCardData();
    this.checkIfDataExists();
  }
  async clearPackData() {
    if (!confirm('Are you sure you want to delete ALL pack data?')) return;
    await this.db.clearPackData();
    this.loadPacksFromDb();
  }
  async clearTagData() {
    if (!confirm('Are you sure you want to delete ALL tag data?')) return;
    await this.db.clearTagData();
    this.loadTagsFromDb();
  }
  async clearSetData() {
    if (!confirm('Are you sure you want to delete ALL set icon data?')) return;
    await this.db.clearSetData();
  }
  async clearAllData() {
    if (!confirm('Are you sure you want to delete ALL local data?')) return;
    await Promise.all([
        this.db.clearCardData(),
        this.db.clearPackData(),
        this.db.clearTagData(),
        this.db.clearSetData(),
    ]);
    this.checkIfDataExists();
  }

  exportPacks = async () => {
      // Logic for exporting packs
  };
  triggerPacksImport = () => this.packsImporter.nativeElement.click();
  importPacks = async (event: Event) => {
      // Logic for importing packs
  };
}

