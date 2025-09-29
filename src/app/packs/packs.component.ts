import { Component, computed, input, signal, Pipe, PipeTransform, inject, effect, Output, EventEmitter, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
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
  isDirty = input.required<boolean>();

  @Output() packChange = new EventEmitter<Pack>();
  @Output() savePack = new EventEmitter<Pack>();
  @Output() discardChanges = new EventEmitter<string>();
  @Output() removePack = new EventEmitter<string>();

  private db = inject(DatabaseService);

  slotControls: FormControl[] = [];
  private controlSubscriptions: Subscription[] = [];
  activeSlotIndex = signal<number | null>(null);
  suggestions = signal<CardDocument[]>([]);
  hoveredCard = signal<CardDocument | null>(null);
  mousePos = signal<{ x: number, y: number }>({ x: 0, y: 0 });

  tagIdMap = computed(() => new Map(this.tags().map(t => [t.id, t])));

  constructor() {
    effect(() => this.setupSlotControls(this.pack()));

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
    if (value.length < 2) {
      this.suggestions.set([]);
      return;
    }
    this.suggestions.set(await this.db.searchCards(value));
  }

  onPackMetaChange(field: 'name' | 'archetype' | 'themes', value: string) {
    const pack = this.pack();
    const latestRevision = this.getCurrentRevision(pack);
    const updatedRevision = { ...latestRevision, [field]: value };
    const newRevisions = [...pack.revisions.slice(0, -1), updatedRevision];
    const newName = field === 'name' ? value : pack.name;
    this.packChange.emit({ ...pack, name: newName, revisions: newRevisions });
  }

  onSlotLabelChange(slotIndex: number, newLabel: string) {
    const pack = this.pack();
    const latestRevision = this.getCurrentRevision(pack);
    const newSlots = [...(latestRevision.slots || Array(latestRevision.size).fill(''))];
    newSlots[slotIndex] = newLabel;
    const updatedRevision = { ...latestRevision, slots: newSlots };
    const newRevisions = [...pack.revisions.slice(0, -1), updatedRevision];
    this.packChange.emit({ ...pack, revisions: newRevisions });
  }

  addCardToSlot(card: CardDocument, index: number) {
    const pack = this.pack();
    const updatedCards = [...pack.cards];
    updatedCards[index] = card;
    this.packChange.emit({ ...pack, cards: updatedCards });
    this.slotControls[index].setValue(card.name, { emitEvent: false });
    this.suggestions.set([]);
  }

  removeCardFromSlot(index: number) {
    const pack = this.pack();
    const cardToRemove = pack.cards[index];
    if (!cardToRemove) return;

    const updatedCards = [...pack.cards];
    updatedCards[index] = null;

    const latestRevision = this.getCurrentRevision(pack);
    let newRevisions = pack.revisions;
    if (latestRevision.signpostCardId === cardToRemove.id) {
        const newLatestRevision = {...latestRevision, signpostCardId: undefined };
        newRevisions = [...pack.revisions.slice(0, -1), newLatestRevision];
    }
    this.packChange.emit({...pack, cards: updatedCards, revisions: newRevisions});
    this.slotControls[index].setValue('', { emitEvent: false });
  }

  onCardDrop(event: CdkDragDrop<(CardDocument | null)[]>) {
    if (event.previousIndex === event.currentIndex) return;

    const pack = this.pack();
    const updatedCards = [...pack.cards];
    const latestRevision = this.getCurrentRevision(pack);
    const updatedSlots = [...(latestRevision.slots || [])];

    moveItemInArray(updatedCards, event.previousIndex, event.currentIndex);
    moveItemInArray(updatedSlots, event.previousIndex, event.currentIndex);

    const updatedRevision = { ...latestRevision, slots: updatedSlots };
    const newRevisions = [...pack.revisions.slice(0, -1), updatedRevision];
    this.packChange.emit({ ...pack, cards: updatedCards, revisions: newRevisions });
  }

  setSignpostCard(cardId: string) {
    const pack = this.pack();
    const latestRevision = this.getCurrentRevision(pack);
    const newRevisions = [...pack.revisions.slice(0, -1), {...latestRevision, signpostCardId: cardId}];
    this.packChange.emit({ ...pack, revisions: newRevisions});
  }

  async revertToRevision(revision: PackRevision) {
    const pack = this.pack();
    if (!confirm(`Revert "${revision.name}" to the version from ${this.formatTimestamp(revision.timestamp)}?`)) return;

    const newRevision: PackRevision = {
        ...revision,
        timestamp: Date.now(),
        reason: `Reverted to version from ${this.formatTimestamp(revision.timestamp)}`
    };
    const newRevisions = [...pack.revisions, newRevision];
    const restoredCards = await this.db.hydrateCardIds(newRevision.cardIds);
    this.packChange.emit({ ...pack, name: newRevision.name, revisions: newRevisions, cards: restoredCards });
    this.savePack.emit({ ...pack, name: newRevision.name, revisions: newRevisions, cards: restoredCards });
  }

  // UI Helpers
  displayFn = (card: CardDocument) => card?.name || '';
  showCardImage(card: CardDocument | null) { if(card) this.hoveredCard.set(card); }
  hideCardImage() { this.hoveredCard.set(null); }
  setActiveSlot(index: number) { this.activeSlotIndex.set(index); }
  getCurrentRevision = (pack: PackHistory) => pack.revisions[pack.revisions.length - 1];
  getSlotsArray = (pack: Pack) => Array.from({ length: this.getCurrentRevision(pack)?.size || 0 }, (_, i) => i);
  getFilledSlotsCount = (pack: Pack) => pack.cards.filter(c => c !== null).length;
  formatTimestamp = (ts: number) => new Date(ts).toLocaleString();

  getSignpostCardArtCrop = (pack: Pack) => {
    const rev = this.getCurrentRevision(pack);
    const card = rev.signpostCardId ? pack.cards.find(c => c?.id === rev.signpostCardId) : pack.cards.find(c => !!c);
    if (!card) return undefined;
    return card.card_faces?.[0]?.image_uris?.art_crop || card.image_uris?.art_crop;
  }

  getDisplayManaCost(card: CardDocument | null): string {
    if (!card) return '';
    if (card.mana_cost) return card.mana_cost;
    return card.card_faces?.map(f => f.mana_cost).filter(Boolean).join(' // ') || '';
  }

  getColorIdentityManaString(card: CardDocument): string {
    const order: { [key: string]: number } = { 'W': 1, 'U': 2, 'B': 3, 'R': 4, 'G': 5 };
    const sorted = [...(card.color_identity || [])].sort((a, b) => order[a] - order[b]).join('');
    if (sorted.length === 0) return card.type_line?.toLowerCase().includes('land') ? '' : '{ci-c}';
    return `{ci-${sorted.toLowerCase()}}`;
  }

  getIconType = (i: string) => i?.startsWith('fa-') ? 'fa' : i?.startsWith('ms-') ? 'ms' : i?.startsWith('https://') ? 'svg' : 'emoji';
  getTagTooltip = (tagId: string) => this.tagIdMap().get(tagId)?.description || '';
}

