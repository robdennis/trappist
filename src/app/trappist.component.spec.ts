import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TrappistComponent } from './trappist.component';
import { DatabaseService } from './core/database.service';
import { Pack, Tag, PackHistory, DEFAULT_PACK_SLOTS } from './core/models';

function makePackHistory(overrides: Partial<PackHistory> = {}): PackHistory {
  return {
    id: 'pack-1',
    name: 'Test Pack',
    isDeleted: 0,
    revisions: [
      {
        name: 'Test Pack',
        size: 20,
        cardIds: Array(20).fill(null),
        timestamp: 1000,
        reason: 'Initial revision',
        archetype: 'Midrange',
        themes: 'Tokens',
        slots: [...DEFAULT_PACK_SLOTS],
      },
    ],
    ...overrides,
  };
}

function makePack(overrides: Partial<Pack> = {}): Pack {
  return { ...makePackHistory(), cards: Array(20).fill(null), ...overrides };
}

function makeMockDb(cardCount = 0, packHistories: PackHistory[] = [], tags: Tag[] = []) {
  const packsWhereChain = {
    equals: jasmine.createSpy().and.returnValue({
      toArray: jasmine.createSpy().and.returnValue(Promise.resolve(packHistories)),
    }),
  };

  return {
    getCardCount: jasmine.createSpy().and.returnValue(Promise.resolve(cardCount)),
    packs: {
      where: jasmine.createSpy().and.returnValue(packsWhereChain),
      get: jasmine.createSpy().and.returnValue(Promise.resolve(null)),
      put: jasmine.createSpy().and.returnValue(Promise.resolve()),
      update: jasmine.createSpy().and.returnValue(Promise.resolve()),
    },
    tags: {
      toArray: jasmine.createSpy().and.returnValue(Promise.resolve(tags)),
    },
    hydrateCardIds: jasmine.createSpy().and.returnValue(Promise.resolve(Array(20).fill(null))),
    clearCardData: jasmine.createSpy().and.returnValue(Promise.resolve()),
    clearPackData: jasmine.createSpy().and.returnValue(Promise.resolve()),
    clearTagData: jasmine.createSpy().and.returnValue(Promise.resolve()),
    clearSetData: jasmine.createSpy().and.returnValue(Promise.resolve()),
  };
}

describe('TrappistComponent', () => {
  let component: TrappistComponent;
  let fixture: ComponentFixture<TrappistComponent>;
  let mockDb: ReturnType<typeof makeMockDb>;

  async function setup(cardCount = 0, packs: PackHistory[] = [], tags: Tag[] = []) {
    mockDb = makeMockDb(cardCount, packs, tags);

    await TestBed.configureTestingModule({
      imports: [TrappistComponent],
      providers: [provideNoopAnimations(), { provide: DatabaseService, useValue: mockDb }],
    }).compileComponents();

    fixture = TestBed.createComponent(TrappistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const mockFetchResponse = () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) } as Response);

  beforeEach(async () => {
    // Prevent DatabaseComponent from hitting the network
    spyOn(window, 'fetch').and.callFake(mockFetchResponse);
    await setup();
  });

  // ─── getCurrentRevision ───────────────────────────────────────────────────

  describe('getCurrentRevision', () => {
    it('returns the last revision in the revisions array', () => {
      const pack = makePack();
      const second = { name: 'v2', size: 20, cardIds: [], timestamp: 2000, slots: [] };
      pack.revisions.push(second);
      expect(component.getCurrentRevision(pack)).toBe(second);
    });
  });

  // ─── addPack ──────────────────────────────────────────────────────────────

  describe('addPack', () => {
    it('adds a pack to the packs signal', () => {
      const before = component.packs().length;
      component.addPack();
      expect(component.packs().length).toBe(before + 1);
    });

    it('creates a pack with 20 null card slots', () => {
      component.addPack();
      const pack = component.packs().at(-1)!;
      expect(pack.cards.length).toBe(20);
      expect(pack.cards.every((c) => c === null)).toBeTrue();
    });

    it('creates a pack with the default slot labels', () => {
      component.addPack();
      const pack = component.packs().at(-1)!;
      expect(component.getCurrentRevision(pack).slots).toEqual(DEFAULT_PACK_SLOTS);
    });

    it('marks the new pack as having provisional changes', () => {
      component.addPack();
      const pack = component.packs().at(-1)!;
      expect(component.provisionalChanges().has(pack.id)).toBeTrue();
    });

    it('adds the new pack to visiblePackIds', () => {
      component.addPack();
      const pack = component.packs().at(-1)!;
      expect(component.visiblePackIds()).toContain(pack.id);
    });

    it('generates unique names across multiple packs', () => {
      component.addPack();
      component.addPack();
      component.addPack();
      const names = component.packs().map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('caps visiblePackIds at 3', () => {
      component.addPack();
      component.addPack();
      component.addPack();
      component.addPack();
      expect(component.visiblePackIds().length).toBeLessThanOrEqual(3);
    });
  });

  // ─── handlePackUpdate ─────────────────────────────────────────────────────

  describe('handlePackUpdate', () => {
    let pack: Pack;

    beforeEach(() => {
      component.addPack();
      pack = component.packs().at(-1)!;
    });

    it('replaces the matching pack in the packs signal', () => {
      const updated = { ...pack, name: 'Renamed Pack' };
      component.handlePackUpdate(updated);
      expect(component.packs().find((p) => p.id === pack.id)?.name).toBe('Renamed Pack');
    });

    it('adds the pack id to provisionalChanges', () => {
      component.provisionalChanges.set(new Set());
      component.handlePackUpdate(pack);
      expect(component.provisionalChanges().has(pack.id)).toBeTrue();
    });

    it('does not affect other packs in the signal', () => {
      component.addPack();
      const other = component.packs().at(-1)!;
      component.handlePackUpdate({ ...pack, name: 'Changed' });
      expect(component.packs().find((p) => p.id === other.id)?.name).toBe(other.name);
    });
  });

  // ─── visiblePacks computed ────────────────────────────────────────────────

  describe('visiblePacks computed', () => {
    it('returns packs in visiblePackIds order', () => {
      component.addPack();
      component.addPack();
      const [a, b] = component.packs();
      component.visiblePackIds.set([b.id, a.id]);
      const visible = component.visiblePacks();
      expect(visible[0].id).toBe(b.id);
      expect(visible[1].id).toBe(a.id);
    });

    it('excludes packs not in visiblePackIds', () => {
      component.addPack();
      component.addPack();
      component.visiblePackIds.set([component.packs()[0].id]);
      expect(component.visiblePacks().length).toBe(1);
    });

    it('returns an empty array when visiblePackIds is empty', () => {
      component.addPack();
      component.visiblePackIds.set([]);
      expect(component.visiblePacks()).toEqual([]);
    });
  });

  // ─── checkIfDataExists ────────────────────────────────────────────────────

  describe('checkIfDataExists', () => {
    it('sets dataExists to false when card count is 0', async () => {
      // default setup already has count=0
      expect(component.dataExists()).toBeFalse();
    });

    it('sets status message when no cards exist', () => {
      expect(component.status()).toContain('No local card data');
    });

    it('sets dataExists to true when cards are present', async () => {
      TestBed.resetTestingModule();
      (window.fetch as jasmine.Spy).and.callFake(mockFetchResponse);
      await setup(42);
      expect(component.dataExists()).toBeTrue();
    });

    it('sets status with card count when cards are present', async () => {
      TestBed.resetTestingModule();
      (window.fetch as jasmine.Spy).and.callFake(mockFetchResponse);
      await setup(42);
      expect(component.status()).toContain('42');
    });

    it('sets isChecking to false after completion', () => {
      expect(component.isChecking()).toBeFalse();
    });
  });

  // ─── loadPacksFromDb ──────────────────────────────────────────────────────

  describe('loadPacksFromDb (via checkIfDataExists with cards present)', () => {
    beforeEach(async () => {
      const history = makePackHistory({ id: 'existing-1', name: 'Existing Pack' });
      TestBed.resetTestingModule();
      // fetch is already a spy from outer beforeEach — reconfigure it, don't re-spy
      (window.fetch as jasmine.Spy).and.callFake(mockFetchResponse);
      await setup(5, [history]);
    });

    it('loads pack histories from the database', () => {
      expect(component.packs().length).toBe(1);
      expect(component.packs()[0].name).toBe('Existing Pack');
    });

    it('sets the first pack as visible', () => {
      expect(component.visiblePackIds()).toContain('existing-1');
    });

    it('clears provisionalChanges on load', () => {
      expect(component.provisionalChanges().size).toBe(0);
    });

    it('adds a new empty pack when the database has no packs', async () => {
      TestBed.resetTestingModule();
      (window.fetch as jasmine.Spy).and.callFake(mockFetchResponse);
      await setup(5, []); // cards exist but no packs
      expect(component.packs().length).toBe(1);
    });
  });
});
