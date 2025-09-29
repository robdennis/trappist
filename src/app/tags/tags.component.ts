import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { Tag, TaggingProgress } from '../core/models';
import { DatabaseService } from '../core/database.service';

@Component({
  selector: 'app-tags',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatListModule, MatIconModule, MatSelectModule,
    MatProgressBarModule, MatTooltipModule
  ],
  templateUrl: './tags.component.html',
  styleUrl: './tags.component.scss'
})
export class TagsComponent {
  tags = signal<Tag[]>([]);
  selectedTag = signal<Tag | null>(null);
  taggingProgress = signal<TaggingProgress | null>(null);

  constructor(private db: DatabaseService) {
    this.loadTags();
  }

  async loadTags() {
    this.tags.set(await this.db.tags.toArray());
  }

  selectTagForEditing(tag: Tag | null) {
    this.selectedTag.set(tag ? {...tag} : null); // Edit a copy
  }

  addNewTag() {
    const newTag: Tag = {
      id: crypto.randomUUID(),
      name: 'New Tag',
      icon: 'fa-solid fa-star',
      type: 'local',
      created_at: Date.now(),
      updated_at: Date.now(),
      query: { field: 'name', op: 'regex', value: 'keyword' }
    };
    this.selectTagForEditing(newTag);
  }

  async saveSelectedTag() {
    const tagToSave = this.selectedTag();
    if (!tagToSave) return;

    tagToSave.updated_at = Date.now();
    await this.db.tags.put(tagToSave);
    await this.loadTags();
    this.selectTagForEditing(null);
  }

  // ... Other methods like deleteTag, applyAllTags, import/export would be moved here ...
}
