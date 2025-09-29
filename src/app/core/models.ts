export interface ScryfallBulkData {
    id: string;
    type: 'oracle_cards' | 'unique_artwork' | 'default_cards' | 'all_cards' | string;
    name: string;
    description: string;
    download_uri: string;
    updated_at: string;
    size: number;
}
export interface CardFace {
    name: string;
    image_uris?: { normal?: string; art_crop?: string; };
    type_line?: string; mana_cost?: string; oracle_text?: string;
}
export interface CardDocument {
    id: string; name: string; name_lowercase?: string;
    image_uris?: { normal?: string; art_crop?: string; };
    type_line?: string; mana_cost?: string; cmc?: number;
    oracle_text?: string; colors?: string[]; color_identity?: string[];
    produced_mana?: string[]; keywords?: string[]; reprint?: boolean;
    card_faces?: CardFace[]; frame_effects?: string[];
    layout?: string;
    tags?: string[];
}
export interface PersistedPack {
    name: string; size: number; cardNames: (string | null)[]; signpostCardName?: string;
    archetype?: string; themes?: string; slots?: string[];
}
export interface PackRevision {
    name: string; size: number; cardIds: (string | null)[]; signpostCardId?: string;
    timestamp: number;
    reason?: string;
    archetype?: string; themes?: string; slots?: string[];
}
export interface PackHistory {
    id: string;
    name: string;
    revisions: PackRevision[];
    isDeleted: number;
}
export interface Pack extends PackHistory {
    cards: (CardDocument | null)[];
}

export interface Tag {
    id: string;
    name: string;
    icon: string;
    description?: string;
    category?: string;
    type: 'local' | 'remote';
    query?: {
        field: string;
        op: 'regex' | 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'ne';
        value: any;
    };
    scryfall_query?: string;
    cached_card_names?: string[];
    created_at: number;
    updated_at: number;
}

export interface TaggingProgress {
    status: string;
    currentTag?: string;
    currentTagMatches?: number;
    totalTags: number;
    processedTags: number;
    elapsedTime: string;
    initialDbSize?: number;
    finalDbSize?: number;
}

export interface ScryfallSet {
    id: string;
    code: string;
    name: string;
    set_type: string;
    icon_svg_uri: string;
    card_count: number;
}

export const DEFAULT_PACK_SLOTS = [
    'Board Advantage', 'Board Advantage', 'Board Advantage', 'Board Advantage',
    'Flex', 'Flex',
    'Disenchant',
    'Creature Removal', 'Creature Removal',
    '+1/+1 counters',
    'Other Themes', 'Other Themes',
    'Tripels Token',
    'Fixing', 'Fixing', 'Fixing', 'Fixing', 'Fixing', 'Fixing', 'Fixing',
    'Fixing Token'
];

