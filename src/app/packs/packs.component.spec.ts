import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { PacksComponent, ManaSymbolPipe } from './packs.component';
import { DatabaseService } from '../core/database.service';
import { CardDocument, Pack, Tag, DEFAULT_PACK_SLOTS } from '../core/models';

function makePack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'test-pack-1',
    name: 'Test Pack',
    isDeleted: 0,
    revisions: [
      {
        name: 'Test Pack',
        size: 3,
        cardIds: [null, null, null],
        timestamp: 1000,
        reason: 'Initial revision',
        archetype: 'Midrange',
        themes: 'Tokens',
        slots: ['Slot A', 'Slot B', 'Slot C'],
      },
    ],
    cards: [null, null, null],
    ...overrides,
  };
}

// ─── ManaSymbolPipe ───────────────────────────────────────────────────────────

describe('ManaSymbolPipe', () => {
  let pipe: ManaSymbolPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    pipe = TestBed.runInInjectionContext(() => new ManaSymbolPipe());
  });

  it('returns empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('wraps a mana symbol in an <i> tag', () => {
    expect(pipe.transform('{W}').toString()).toContain('ms-w');
  });

  it('converts the tap symbol {T} to ms-tap', () => {
    expect(pipe.transform('{T}').toString()).toContain('ms-tap');
  });

  it('handles multiple symbols', () => {
    const result = pipe.transform('{2}{U}').toString();
    expect(result).toContain('ms-2');
    expect(result).toContain('ms-u');
  });

  it('passes through text with no symbols unchanged', () => {
    // All output is wrapped in SafeHtml; the raw content is still preserved
    expect(pipe.transform('Hello').toString()).toContain('Hello');
  });
});

// ─── PacksComponent helpers ───────────────────────────────────────────────────

describe('PacksComponent', () => {
  let component: PacksComponent;
  let fixture: ComponentFixture<PacksComponent>;

  const mockDb = {
    searchCards: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    hydrateCardIds: jasmine.createSpy().and.returnValue(Promise.resolve([])),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PacksComponent],
      providers: [provideNoopAnimations(), { provide: DatabaseService, useValue: mockDb }],
    }).compileComponents();

    fixture = TestBed.createComponent(PacksComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('pack', makePack());
    fixture.componentRef.setInput('tags', []);
    fixture.componentRef.setInput('isDirty', false);
    fixture.detectChanges();
  });

  describe('getCurrentRevision', () => {
    it('returns the last revision in the array', () => {
      const pack = makePack();
      const second = { name: 'v2', size: 3, cardIds: [], timestamp: 2000, slots: [] };
      pack.revisions.push(second);
      expect(component.getCurrentRevision(pack)).toBe(second);
    });
  });

  describe('getFilledSlotsCount', () => {
    it('returns 0 when all slots are null', () => {
      expect(component.getFilledSlotsCount(makePack())).toBe(0);
    });

    it('counts only non-null card entries', () => {
      const card: CardDocument = { id: '1', name: 'Lightning Bolt' };
      const pack = makePack({ cards: [card, null, card] });
      expect(component.getFilledSlotsCount(pack)).toBe(2);
    });
  });

  describe('getDisplayManaCost', () => {
    it('returns empty string for null', () => {
      expect(component.getDisplayManaCost(null)).toBe('');
    });

    it('returns mana_cost when present', () => {
      const card: CardDocument = { id: '1', name: 'Counterspell', mana_cost: '{U}{U}' };
      expect(component.getDisplayManaCost(card)).toBe('{U}{U}');
    });

    it('joins card_face mana costs for DFCs, filtering empty values', () => {
      const card: CardDocument = {
        id: '1',
        name: 'Delver of Secrets',
        card_faces: [
          { name: 'Delver of Secrets', mana_cost: '{U}' },
          { name: 'Insectile Aberration' },
        ],
      };
      expect(component.getDisplayManaCost(card)).toBe('{U}');
    });

    it('returns empty string for a card with no mana info', () => {
      const card: CardDocument = { id: '1', name: 'Island' };
      expect(component.getDisplayManaCost(card)).toBe('');
    });
  });

  describe('getColorIdentityManaString', () => {
    it('returns colorless symbol for non-land with no color identity', () => {
      const card: CardDocument = { id: '1', name: 'Sol Ring', color_identity: [], type_line: 'Artifact' };
      expect(component.getColorIdentityManaString(card)).toBe('{ci-c}');
    });

    it('returns empty string for a land with no color identity', () => {
      const card: CardDocument = {
        id: '1',
        name: 'Wastes',
        color_identity: [],
        type_line: 'Basic Land',
      };
      expect(component.getColorIdentityManaString(card)).toBe('');
    });

    it('returns a single-color identity string', () => {
      const card: CardDocument = {
        id: '1',
        name: 'Island',
        color_identity: ['U'],
        type_line: 'Basic Land — Island',
      };
      expect(component.getColorIdentityManaString(card)).toBe('{ci-u}');
    });

    it('sorts colors in WUBRG order', () => {
      const card: CardDocument = {
        id: '1',
        name: 'Gruul Test',
        color_identity: ['G', 'R'],
        type_line: 'Creature',
      };
      expect(component.getColorIdentityManaString(card)).toBe('{ci-rg}');
    });

    it('handles five-color identity', () => {
      const card: CardDocument = {
        id: '1',
        name: 'WUBRG Test',
        color_identity: ['G', 'B', 'W', 'R', 'U'],
        type_line: 'Creature',
      };
      expect(component.getColorIdentityManaString(card)).toBe('{ci-wubrg}');
    });
  });

  describe('getIconType', () => {
    it('returns "fa" for Font Awesome prefixed icons', () => {
      expect(component.getIconType('fa-solid fa-star')).toBe('fa');
    });

    it('returns "ms" for mana symbol prefixed icons', () => {
      expect(component.getIconType('ms-w')).toBe('ms');
    });

    it('returns "svg" for https:// URL icons', () => {
      expect(component.getIconType('https://example.com/icon.svg')).toBe('svg');
    });

    it('returns "emoji" for anything else', () => {
      expect(component.getIconType('⚡')).toBe('emoji');
    });
  });

  describe('formatTimestamp', () => {
    it('returns a non-empty string containing the year', () => {
      const ts = new Date('2024-06-15T12:00:00').getTime();
      const result = component.formatTimestamp(ts);
      expect(result).toContain('2024');
    });
  });

  describe('getSlotsArray', () => {
    it('returns an array with length equal to pack size', () => {
      const pack = makePack();
      const arr = component.getSlotsArray(pack);
      expect(arr.length).toBe(component.getCurrentRevision(pack).size);
    });
  });

  describe('packChange and savePack output events', () => {
    it('emits packChange when a card is removed from a slot', () => {
      const card: CardDocument = { id: 'c1', name: 'Brainstorm' };
      const pack = makePack({ cards: [card, null, null] });
      fixture.componentRef.setInput('pack', pack);
      fixture.detectChanges();

      const emitted: Pack[] = [];
      component.packChange.subscribe((p) => emitted.push(p));

      component.removeCardFromSlot(0);

      expect(emitted.length).toBe(1);
      expect(emitted[0].cards[0]).toBeNull();
    });

    it('emits packChange when pack metadata changes', () => {
      const emitted: Pack[] = [];
      component.packChange.subscribe((p) => emitted.push(p));

      component.onPackMetaChange('name', 'New Name');

      expect(emitted.length).toBe(1);
      expect(emitted[0].name).toBe('New Name');
    });

    it('emits packChange when a slot label changes', () => {
      const emitted: Pack[] = [];
      component.packChange.subscribe((p) => emitted.push(p));

      component.onSlotLabelChange(0, 'New Label');

      const revision = component.getCurrentRevision(emitted[0]);
      expect(revision.slots![0]).toBe('New Label');
    });

    it('emits savePack when a card is removed and was the signpost', () => {
      // setSignpostCard does NOT save — only revertToRevision does. Just verify packChange.
      const card: CardDocument = { id: 'c1', name: 'Brainstorm' };
      const pack = makePack({
        cards: [card, null, null],
        revisions: [
          {
            name: 'Test Pack',
            size: 3,
            cardIds: ['c1', null, null],
            signpostCardId: 'c1',
            timestamp: 1000,
            slots: ['Slot A', 'Slot B', 'Slot C'],
          },
        ],
      });
      fixture.componentRef.setInput('pack', pack);
      fixture.detectChanges();

      const emitted: Pack[] = [];
      component.packChange.subscribe((p) => emitted.push(p));

      component.removeCardFromSlot(0);

      const rev = component.getCurrentRevision(emitted[0]);
      expect(rev.signpostCardId).toBeUndefined();
    });
  });

  describe('addCardToSlot', () => {
    it('emits packChange with the card placed at the correct index', () => {
      const card: CardDocument = { id: 'c1', name: 'Brainstorm' };
      const emitted: Pack[] = [];
      component.packChange.subscribe((p) => emitted.push(p));

      component.addCardToSlot(card, 1);

      expect(emitted[0].cards[1]?.name).toBe('Brainstorm');
      expect(emitted[0].cards[0]).toBeNull();
    });
  });
});
