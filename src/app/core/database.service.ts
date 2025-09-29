import { Injectable } from '@angular/core';
import { CardDocument, PackHistory, ScryfallSet, Tag } from './models';

// Dexie is loaded globally from index.html, so we declare it here.
declare var Dexie: any;

@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  cards!: Dexie.Table<CardDocument, string>;
  packs!: Dexie.Table<PackHistory, string>;
  tags!: Dexie.Table<Tag, string>;
  sets!: Dexie.Table<ScryfallSet, string>;

  constructor() {
    super('TrappistDB');
    this.version(9).stores({
      cards: 'id, &name_lowercase, name, type_line, cmc, *colors, *color_identity, *keywords, *tags',
      packs: 'id, &name, isDeleted',
      tags: 'id, &name, &icon',
      sets: 'id, name'
    });
  }

  async getCardCount(): Promise<number> {
    return this.cards.count();
  }

  async storeCardData(jsonData: any): Promise<number> {
    const rawData: CardDocument[] = Array.isArray(jsonData) ? jsonData : jsonData.record;
    if (!Array.isArray(rawData)) throw new Error('Data is not in a recognized array format.');

    const promoArtFilteredData = rawData.filter(card => {
        if (card.card_faces && card.card_faces.length > 1) {
            const faceNames = new Set(card.card_faces.map(face => face.name));
            return faceNames.size > 1;
        }
        return true;
    });

    const filteredData = promoArtFilteredData.filter(card => !card.reprint);
    filteredData.forEach(card => { if (card.name) card.name_lowercase = card.name.toLowerCase(); });

    const cardNameGroups = new Map<string, CardDocument[]>();
    for (const card of filteredData) {
      if (!card.name_lowercase) continue;
      if (!cardNameGroups.has(card.name_lowercase)) cardNameGroups.set(card.name_lowercase, []);
      cardNameGroups.get(card.name_lowercase)!.push(card);
    }

    const uniqueDataToStore: CardDocument[] = [];
    for (const cards of cardNameGroups.values()) {
      if (cards.length === 1) {
        uniqueDataToStore.push(cards[0]);
      } else {
        const preferredCard = cards.reduce((prev, curr) => {
          const prevIsExtended = prev.frame_effects?.includes('extendedart') ?? false;
          const currIsExtended = curr.frame_effects?.includes('extendedart') ?? false;
          return prevIsExtended && !currIsExtended ? curr : prev;
        });
        uniqueDataToStore.push(preferredCard);
      }
    }

    await this.cards.clear();
    await this.cards.bulkAdd(uniqueDataToStore);
    return this.cards.count();
  }

  async clearCardData() { return this.cards.clear(); }
  async clearPackData() { return this.packs.clear(); }
  async clearTagData() { return this.tags.clear(); }
  async clearSetData() { return this.sets.clear(); }

  async searchCards(filterValue: string): Promise<CardDocument[]> {
    const results = await this.cards.where('name_lowercase').startsWithIgnoreCase(filterValue).toArray();
    const filteredResults = results.filter((card: CardDocument) => {
        const typeLine = card.type_line?.toLowerCase();
        return !typeLine?.startsWith('token') && !typeLine?.includes('scheme');
    });
    return filteredResults.slice(0, 10);
  }

  async hydrateCardIds(cardIds: (string | null)[]): Promise<(CardDocument | null)[]> {
    const validIds = cardIds.filter((id): id is string => id !== null);
    if (validIds.length === 0) return Array(cardIds.length).fill(null);

    const cardDocs = await this.cards.where('id').anyOf(...validIds).toArray();
    const cardMap = new Map<string, CardDocument>(cardDocs.map((c: CardDocument) => [c.id, c]));

    return cardIds.map(id => id ? (cardMap.get(id) || null) : null);
  }
}
