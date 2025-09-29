import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { CardDocument, PackHistory, ScryfallSet, Tag } from './models';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  cards!: Table<CardDocument, string>;
  packs!: Table<PackHistory, string>;
  tags!: Table<Tag, string>;
  sets!: Table<ScryfallSet, string>;

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
    const rawData: CardDocument[] = Array.isArray(jsonData) ? jsonData : (jsonData.data || []);
    if (!Array.isArray(rawData)) throw new Error('Data is not in a recognized array format.');

    const filteredData = rawData.filter(card => !card.reprint);
    filteredData.forEach(card => { if (card.name) card.name_lowercase = card.name.toLowerCase(); });

    const cardNameGroups = new Map<string, CardDocument[]>();
    for (const card of filteredData) {
      if (!card.name_lowercase) continue;
      if (!cardNameGroups.has(card.name_lowercase)) cardNameGroups.set(card.name_lowercase, []);
      cardNameGroups.get(card.name_lowercase)!.push(card);
    }

    const uniqueDataToStore: CardDocument[] = [];
    for (const cards of cardNameGroups.values()) {
        const preferredCard = cards.reduce((prev, curr) => {
          const prevIsExtended = prev.frame_effects?.includes('extendedart') ?? false;
          const currIsExtended = curr.frame_effects?.includes('extendedart') ?? false;
          if (prevIsExtended && !currIsExtended) return curr;
          return prev;
        });
        uniqueDataToStore.push(preferredCard);
    }

    await this.cards.clear();
    await this.cards.bulkAdd(uniqueDataToStore);
    return this.cards.count();
  }

  async clearCardData() { return this.cards.clear(); }
  async clearPackData() { return this.packs.clear(); }
  async clearTagData() { return this.tags.clear(); }
  async clearSetData() { return this.sets.clear(); }
  async getAllCards() { return this.cards.toArray(); }

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

  async hydrateCardNames(cardNames: (string | null)[]): Promise<(CardDocument | null)[]> {
    const validNames = cardNames.filter((name): name is string => name !== null);
    if (validNames.length === 0) return Array(cardNames.length).fill(null);
    const cardDocs: CardDocument[] = await this.cards.where('name').anyOf(...validNames).toArray();
    const cardMap = new Map<string, CardDocument>(cardDocs.map((c: CardDocument) => [c.name, c]));
    return cardNames.map(name => name ? (cardMap.get(name) || null) : null);
  }
}

