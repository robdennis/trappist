import { TestBed } from '@angular/core/testing';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DatabaseService);
  });

  afterEach(async () => {
    await service.cards.clear();
  });

  describe('storeCardData', () => {
    it('filters out reprints', async () => {
      await service.storeCardData([
        { id: '1', name: 'Lightning Bolt', reprint: false },
        { id: '2', name: 'Counterspell', reprint: true },
      ]);
      expect(await service.getCardCount()).toBe(1);
      const cards = await service.getAllCards();
      expect(cards[0].name).toBe('Lightning Bolt');
    });

    it('sets name_lowercase from name', async () => {
      await service.storeCardData([{ id: '1', name: 'Lightning Bolt', reprint: false }]);
      const cards = await service.getAllCards();
      expect(cards[0].name_lowercase).toBe('lightning bolt');
    });

    it('deduplicates cards with the same name, keeping the first occurrence', async () => {
      await service.storeCardData([
        { id: '1', name: 'Lightning Bolt', reprint: false },
        { id: '2', name: 'Lightning Bolt', reprint: false },
      ]);
      expect(await service.getCardCount()).toBe(1);
      expect((await service.getAllCards())[0].id).toBe('1');
    });

    it('deduplicates card names case-insensitively, keeping the first occurrence', async () => {
      await service.storeCardData([
        { id: '1', name: 'Lightning Bolt', reprint: false },
        { id: '2', name: 'LIGHTNING BOLT', reprint: false },
      ]);
      expect(await service.getCardCount()).toBe(1);
      expect((await service.getAllCards())[0].id).toBe('1');
    });

    it('prefers non-extended art when deduplicating by name', async () => {
      await service.storeCardData([
        { id: '1', name: 'Lightning Bolt', reprint: false, frame_effects: ['extendedart'] },
        { id: '2', name: 'Lightning Bolt', reprint: false, frame_effects: [] },
      ]);
      const cards = await service.getAllCards();
      expect(cards[0].id).toBe('2');
    });

    it('keeps extended art if no non-extended alternative exists', async () => {
      await service.storeCardData([
        { id: '1', name: 'Lightning Bolt', reprint: false, frame_effects: ['extendedart'] },
      ]);
      const cards = await service.getAllCards();
      expect(cards[0].id).toBe('1');
    });

    it('accepts data in a { data: [...] } wrapper', async () => {
      await service.storeCardData({ data: [{ id: '1', name: 'Island', reprint: false }] });
      expect(await service.getCardCount()).toBe(1);
    });

    it('clears existing cards before storing new data', async () => {
      await service.storeCardData([{ id: '1', name: 'Mountain', reprint: false }]);
      await service.storeCardData([{ id: '2', name: 'Island', reprint: false }]);
      const cards = await service.getAllCards();
      expect(cards.length).toBe(1);
      expect(cards[0].name).toBe('Island');
    });

    it('returns the count of stored cards', async () => {
      const count = await service.storeCardData([
        { id: '1', name: 'Island', reprint: false },
        { id: '2', name: 'Mountain', reprint: false },
      ]);
      expect(count).toBe(2);
    });
  });

  describe('searchCards', () => {
    beforeEach(async () => {
      await service.storeCardData([
        { id: '1', name: 'Lightning Bolt', type_line: 'Instant', reprint: false },
        { id: '2', name: 'Lightning Strike', type_line: 'Instant', reprint: false },
        { id: '3', name: 'Lightning Helix', type_line: 'Instant', reprint: false },
        { id: '4', name: 'Token Lightning', type_line: 'Token Creature — Elemental', reprint: false },
        { id: '5', name: 'Evil Scheme', type_line: 'Ongoing Scheme', reprint: false },
        { id: '6', name: 'Demonic Tutor', type_line: 'Sorcery', reprint: false },
      ]);
    });

    it('returns cards matching a name prefix', async () => {
      const results = await service.searchCards('lightning b');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Lightning Bolt');
    });

    it('returns multiple matches for a shared prefix', async () => {
      const results = await service.searchCards('lightning');
      expect(results.length).toBe(3);
    });

    it('filters out token cards', async () => {
      const results = await service.searchCards('token');
      expect(results.length).toBe(0);
    });

    it('filters out scheme cards', async () => {
      const results = await service.searchCards('evil');
      expect(results.length).toBe(0);
    });

    it('returns at most 10 results', async () => {
      const manyCards = Array.from({ length: 15 }, (_, i) => ({
        id: `c${i}`,
        name: `Card${i.toString().padStart(2, '0')}`,
        type_line: 'Creature',
        reprint: false,
      }));
      await service.storeCardData(manyCards);
      const results = await service.searchCards('card');
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('returns empty array when no cards match', async () => {
      const results = await service.searchCards('zzznomatch');
      expect(results).toEqual([]);
    });
  });

  describe('hydrateCardIds', () => {
    beforeEach(async () => {
      await service.storeCardData([
        { id: 'card-a', name: 'Brainstorm', reprint: false },
        { id: 'card-b', name: 'Ponder', reprint: false },
      ]);
    });

    it('resolves IDs to CardDocuments', async () => {
      const result = await service.hydrateCardIds(['card-a', 'card-b']);
      expect(result[0]?.name).toBe('Brainstorm');
      expect(result[1]?.name).toBe('Ponder');
    });

    it('returns null for null entries, preserving position', async () => {
      const result = await service.hydrateCardIds([null, 'card-a', null]);
      expect(result[0]).toBeNull();
      expect(result[1]?.name).toBe('Brainstorm');
      expect(result[2]).toBeNull();
    });

    it('returns null for IDs not in the database', async () => {
      const result = await service.hydrateCardIds(['nonexistent-id']);
      expect(result[0]).toBeNull();
    });

    it('handles an empty array', async () => {
      expect(await service.hydrateCardIds([])).toEqual([]);
    });

    it('handles an all-null array', async () => {
      expect(await service.hydrateCardIds([null, null])).toEqual([null, null]);
    });
  });

  describe('hydrateCardNames', () => {
    beforeEach(async () => {
      await service.storeCardData([{ id: 'card-a', name: 'Brainstorm', reprint: false }]);
    });

    it('resolves names to CardDocuments', async () => {
      const result = await service.hydrateCardNames(['Brainstorm']);
      expect(result[0]?.id).toBe('card-a');
    });

    it('returns null for null entries, preserving position', async () => {
      const result = await service.hydrateCardNames([null, 'Brainstorm']);
      expect(result[0]).toBeNull();
      expect(result[1]?.name).toBe('Brainstorm');
    });

    it('returns null for names not in the database', async () => {
      const result = await service.hydrateCardNames(['Nonexistent Card']);
      expect(result[0]).toBeNull();
    });

    it('handles an empty array', async () => {
      expect(await service.hydrateCardNames([])).toEqual([]);
    });
  });
});
