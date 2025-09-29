import { Component, computed, input, signal, Pipe, PipeTransform, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DatabaseService } from '../core/database.service';
import { CardDocument, Pack, PackHistory, PackRevision, Tag } from '../core/models';

@Pipe({ name: 'manaSymbol', standalone: true })
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

@Component({
  selector: 'app-packs',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatListModule,
    MatIconModule, MatExpansionModule, MatTooltipModule, DragDropModule, ManaSymbolPipe
  ],
  templateUrl: './packs.component.html',
  styleUrl: './packs.component.scss'
})
export class PacksComponent {
  pack = input.required<Pack>();
  tags = input.required<Tag[]>();

  private db = inject(DatabaseService);

  slotControls: FormControl[] = [];
  private controlSubscriptions: Subscription[] = [];
  activeSlotIndex = signal<number | null>(null);
  suggestions = signal<CardDocument[]>([]);
  hoveredCard = signal<CardDocument | null>(null);
  mousePos = signal<{x: number, y: number}>({ x: 0, y: 0 });

  tagIdMap = computed(() => new Map(this.tags().map(t => [t.id, t])));

  constructor() {
    // This effect will re-run whenever the input 'pack' changes
    computed(() => this.setupSlotControls(this.pack()));

    document.addEventListener('mousemove', (event) => {
      this.mousePos.set({ x: event.clientX, y: event.clientY });
    });
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
                this.filterCards(value);
            }
        });
        this.controlSubscriptions.push(sub);
    });
  }

  async filterCards(value: string) {
    const filterValue = value.toLowerCase();
    if (filterValue.length < 2) {
      this.suggestions.set([]);
      return;
    }
    this.suggestions.set(await this.db.searchCards(filterValue));
  }

  displayFn(card: CardDocument): string {
    return card && card.name ? card.name : '';
  }

  // UI Helpers
  showCardImage(card: CardDocument | null) { if(card) this.hoveredCard.set(card); }
  hideCardImage() { this.hoveredCard.set(null); }
  setActiveSlot(index: number) { this.activeSlotIndex.set(index); }
  getCurrentRevision(pack: PackHistory): PackRevision { return pack.revisions[pack.revisions.length - 1]; }
  getSlotsArray(pack: Pack): number[] {
    const size = this.getCurrentRevision(pack)?.size || 0;
    return Array.from({ length: size }, (_, i) => i);
  }
   // ... Other methods like onCardDrop, removeCardFromSlot, etc. would be moved here
}
