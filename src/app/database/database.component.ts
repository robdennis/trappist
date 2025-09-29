import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DatabaseService } from '../core/database.service';
import { ScryfallBulkData } from '../core/models';

@Component({
  selector: 'app-database',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatCardModule, MatProgressBarModule,
    MatProgressSpinnerModule, MatListModule, MatIconModule, MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './database.component.html',
  styleUrl: './database.component.scss'
})
export class DatabaseComponent {
  @Output() dataLoaded = new EventEmitter<void>();

  status = signal<string>('Initializing...');
  isLoading = signal<boolean>(false);
  selectedFile = signal<File | null>(null);
  fileErrorDetails = signal<string | null>(null);

  isLoadingOptions = signal<boolean>(true);
  bulkDataOptions = signal<ScryfallBulkData[]>([]);

  constructor(private db: DatabaseService) {
    this.fetchBulkDataOptions();
  }

  async fetchBulkDataOptions() {
    this.isLoadingOptions.set(true);
    this.status.set('Fetching bulk data options from Scryfall...');
    try {
      const response = await fetch('https://api.scryfall.com/bulk-data');
      if (!response.ok) {
        throw new Error(`Failed to fetch bulk data list: ${response.statusText}`);
      }
      const result = await response.json();
      const relevantTypes = new Set(['oracle_cards', 'unique_artwork', 'default_cards', 'all_cards', 'rulings']);
      this.bulkDataOptions.set(result.data.filter((d: ScryfallBulkData) => relevantTypes.has(d.type)));
      this.status.set('Ready to download or upload card data.');
    } catch (error) {
      console.error('Failed to fetch bulk data options:', error);
      if (error instanceof Error) this.status.set(`Error: ${error.message}`);
      else this.status.set('An unknown error occurred while fetching bulk data options.');
    } finally {
      this.isLoadingOptions.set(false);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fileErrorDetails.set(null);
    if (input.files && input.files.length > 0) this.selectedFile.set(input.files[0]);
    else this.selectedFile.set(null);
  }

  async downloadAndStoreData(option: ScryfallBulkData) {
    if (!option.download_uri) return;
    this.isLoading.set(true);
    this.fileErrorDetails.set(null);
    this.status.set(`Downloading data for "${option.name}"...`);
    try {
      const response = await fetch(option.download_uri);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const jsonData = await response.json();
      await this.db.storeCardData(jsonData);
      this.dataLoaded.emit();
    } catch (error) {
      this.status.set('Failed to download or store data.');
      if (error instanceof Error) this.fileErrorDetails.set(error.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  uploadAndStoreData() {
    const file = this.selectedFile();
    if (!file) return;
    this.isLoading.set(true);
    this.status.set(`Reading file: ${file.name}...`);
    this.fileErrorDetails.set(null);
    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result as string;
        const jsonData = JSON.parse(text);
        await this.db.storeCardData(jsonData);
        this.dataLoaded.emit();
      } catch (error) {
        this.status.set('Error reading or parsing file.');
        if (error instanceof Error) this.fileErrorDetails.set(error.message);
        else this.fileErrorDetails.set(String(error));
      } finally {
        this.isLoading.set(false);
      }
    };
    reader.onerror = () => {
      this.status.set('Failed to read the selected file.');
      this.isLoading.set(false);
    };
    reader.readAsText(file);
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    return `${value} ${sizes[i]}`;
  }

  formatLastUpdated(dateString: string): string {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

   downloadFileLocally(option: ScryfallBulkData) {
    const link = document.createElement('a');
    link.href = option.download_uri;
    link.setAttribute('download', `${option.type}.json`);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
