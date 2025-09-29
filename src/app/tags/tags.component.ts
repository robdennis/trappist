import { Component, computed, signal, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkTextareaAutosize, TextFieldModule } from '@angular/cdk/text-field';
import { Tag, TaggingProgress, ScryfallSet, CardDocument } from '../core/models';
import { DatabaseService } from '../core/database.service';

@Component({
  selector: 'app-tags',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, JsonPipe,
    MatInputModule, MatListModule, MatIconModule, MatSelectModule, TextFieldModule,
    MatProgressBarModule, MatTooltipModule
  ],
  templateUrl: './tags.component.html',
  styleUrl: './tags.component.scss'
})
export class TagsComponent {
  @Output() tagsUpdated = new EventEmitter<void>();

  tags = signal<Tag[]>([]);
  selectedTag = signal<Tag | null>(null);
  isLoading = signal<boolean>(false);
  status = signal<string>('Ready');
  taggingProgress = signal<TaggingProgress | null>(null);
  @ViewChild('tagsImporter') tagsImporter!: ElementRef<HTMLInputElement>;

  isIconPickerVisible = signal(false);
  iconSearchTerm = signal('');
  mtgSetIcons = signal<{ [key: string]: { prefix: string; icons: string[], names: string[] } }>({});

  objectKeys = Object.keys;

  readonly iconCategories: { [key: string]: { prefix: string; icons: string[], names?: string[] } } = {
    'Font Awesome': { prefix: 'fa-', icons: [ 'fa-solid fa-star', 'fa-solid fa-heart', 'fa-solid fa-bolt', 'fa-solid fa-leaf', 'fa-solid fa-fire', 'fa-solid fa-water', 'fa-solid fa-wind', 'fa-solid fa-mountain', 'fa-solid fa-sun', 'fa-solid fa-moon', 'fa-solid fa-snowflake', 'fa-solid fa-skull', 'fa-solid fa-crown', 'fa-solid fa-shield-halved', 'fa-solid fa-hat-wizard', 'fa-solid fa-dungeon', 'fa-solid fa-scroll', 'fa-solid fa-book', 'fa-solid fa-potion', 'fa-solid fa-ring', 'fa-solid fa-gem', 'fa-solid fa-hammer', 'fa-solid fa-axe', 'fa-solid fa-sword', 'fa-solid fa-bow-arrow', 'fa-solid fa-wand-magic-sparkles', 'fa-solid fa-hand-fist', 'fa-solid fa-dragon', 'fa-solid fa-spider', 'fa-solid fa-ghost', 'fa-solid fa-bug' ] },
    'Emojis': { prefix: 'emoji-', icons: ['👍', '👎', '🔥', '💀', '🎉', '💧', '☀️', '⭐', '❤️', '💯', '💰', '👑', '💣', '✅', '❌'] }
  };

  filteredIcons = computed(() => {
    const allCategories = { ...this.iconCategories, ...this.mtgSetIcons() };
    const term = this.iconSearchTerm().toLowerCase().replace(/[-_\s]/g, '');
    if (!term) return allCategories;

    const filtered: { [key: string]: { prefix: string; icons: string[], names?: string[] } } = {};
    for (const category in allCategories) {
        const catData = allCategories[category as keyof typeof allCategories];
        const matchingIndices: number[] = [];
        catData.icons.forEach((icon, index) => {
            let searchableText = icon.toLowerCase().replace(/[-_\s]/g, '');
            if (catData.names) searchableText += catData.names[index].toLowerCase().replace(/[-_\s]/g, '');
            if (searchableText.includes(term)) matchingIndices.push(index);
        });

        if (matchingIndices.length > 0) {
            filtered[category] = { ...catData, icons: matchingIndices.map(i => catData.icons[i]), names: catData.names ? matchingIndices.map(i => catData.names![i]) : undefined };
        }
    }
    return filtered;
  });

  constructor(private db: DatabaseService) {
    this.loadTags();
    this.loadSetIcons();
  }

  async loadTags() { this.tags.set(await this.db.tags.toArray()); }
  selectTagForEditing(tag: Tag | null) { this.selectedTag.set(tag ? {...tag} : null); }
  addNewTag() {
    const newTag: Tag = {
      id: crypto.randomUUID(), name: 'New Tag', icon: 'fa-solid fa-star', type: 'local',
      created_at: Date.now(), updated_at: Date.now(), query: { field: 'name', op: 'regex', value: 'keyword' }
    };
    this.selectTagForEditing(newTag);
  }

  async saveSelectedTag() {
    const tag = this.selectedTag();
    if (!tag) return;
    tag.updated_at = Date.now();
    await this.db.tags.put(tag);
    await this.loadTags();
    this.tagsUpdated.emit();
    this.selectTagForEditing(null);
  }

  async deleteTag(tagId: string) {
    if (!confirm('Are you sure?')) return;
    await this.db.tags.delete(tagId);
    await this.loadTags();
    this.tagsUpdated.emit();
    if (this.selectedTag()?.id === tagId) this.selectTagForEditing(null);
  }

  updateTagQuery(jsonString: string) {
    const tag = this.selectedTag();
    if (!tag) return;
    try {
      this.selectedTag.set({ ...tag, query: jsonString ? JSON.parse(jsonString) : undefined });
    } catch (e) { console.error('Invalid JSON for tag query', e); }
  }

  async applyAllTags() { /* ... implementation from original app.ts ... */ }
  async cacheRemoteTag(tagId: string) { /* ... implementation from original app.ts ... */ }
  exportTags() { /* ... implementation from original app.ts ... */ }
  triggerTagsImport() { this.tagsImporter.nativeElement.click(); }
  importTags(event: Event) { /* ... implementation from original app.ts ... */ }
  openIconPicker() { this.isIconPickerVisible.set(true); }
  closeIconPicker() { this.isIconPickerVisible.set(false); this.iconSearchTerm.set(''); }
  selectIcon(icon: string) {
    this.selectedTag.update(tag => {
      if (tag) tag.icon = icon;
      return tag;
    });
    this.closeIconPicker();
  }
  getIconType = (i?: string) => i?.startsWith('fa-') ? 'fa' : i?.startsWith('ms-') ? 'ms' : i?.startsWith('https://') ? 'svg' : 'emoji';

  private async loadSetIcons() { /* ... implementation from original app.ts ... */ }
  private updateIconPickerWithSets(sets: ScryfallSet[]) { /* ... implementation from original app.ts ... */ }
}

