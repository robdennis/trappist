import { ChangeDetectionStrategy, Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DatabaseService } from './core/database.service';
import { Pack, Tag, DEFAULT_PACK_SLOTS } from './core/models';
import { PacksComponent } from './packs/packs.component';
import { TagsComponent } from './tags/tags.component';
import { DatabaseComponent } from './database/database.component';


@Component({
  selector: 'app-trappist',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatToolbarModule, MatIconModule, MatSelectModule,
    MatMenuModule, MatDividerModule, MatTooltipModule,
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
  cardCount = signal<number>(0);
  dbSize = signal<string>('');

  packs = signal<Pack[]>([]);
  tags = signal<Tag[]>([]);
  visiblePackIds = signal<string[]>([]);

  @ViewChild(TagsComponent) tagsComponent!: TagsComponent;
  packsControl = new FormControl<string[]>([]);

  isTagEditorVisible = signal<boolean>(false);

  constructor(private db: DatabaseService) {
    this.packsControl.valueChanges.subscribe(ids => {
        if (ids) {
            if (ids.length > 3) {
                this.packsControl.setValue(ids.slice(0, 3));
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
      this.cardCount.set(count);
      if (count > 0) {
        this.status.set(`Local data found! Ready to build.`);
        this.dataExists.set(true);
        this.loadPacksFromDb();
        this.loadTagsFromDb();
      } else {
        this.status.set('No local card data. Ready to proceed.');
        this.dataExists.set(false);
      }
    } catch (error) {
      this.status.set('Error checking local database.');
      console.error('Error accessing IndexedDB:', error);
    } finally {
      this.isChecking.set(false);
    }
  }

  async loadPacksFromDb() {
    const packHistories = await this.db.packs.where('isDeleted').equals(0).toArray();
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
    }
  }

  async loadTagsFromDb() {
      if (this.tagsComponent) {
          this.tagsComponent.loadTags();
      } else {
          this.tags.set(await this.db.tags.toArray());
      }
  }

  addPack() {
    // ... Implementation for adding a new pack
  }
}

