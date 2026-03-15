import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatabaseComponent } from './database.component';
import { DatabaseService } from '../core/database.service';
import { ScryfallBulkData } from '../core/models';

function makeBulkDataOption(overrides: Partial<ScryfallBulkData> = {}): ScryfallBulkData {
  return {
    id: 'opt-1',
    type: 'oracle_cards',
    name: 'Oracle Cards',
    description: 'One card per oracle id',
    download_uri: 'https://data.scryfall.io/oracle-cards/oracle-cards-test.json',
    updated_at: '2024-06-01T12:00:00.000Z',
    size: 12345678,
    ...overrides,
  };
}

describe('DatabaseComponent', () => {
  let component: DatabaseComponent;
  let fixture: ComponentFixture<DatabaseComponent>;
  let mockDb: { storeCardData: jasmine.Spy };

  const scryfallBulkIndex = {
    data: [
      { id: '1', type: 'oracle_cards', name: 'Oracle Cards' },
      { id: '2', type: 'unique_artwork', name: 'Unique Artwork' },
      { id: '3', type: 'rulings', name: 'Rulings' },
      { id: '4', type: 'card_names', name: 'Card Names' }, // not in relevantTypes
    ],
  };

  beforeEach(async () => {
    mockDb = { storeCardData: jasmine.createSpy().and.returnValue(Promise.resolve(1)) };

    spyOn(window, 'fetch').and.callFake((url: RequestInfo | URL) => {
      if (String(url).includes('api.scryfall.com/bulk-data')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(scryfallBulkIndex),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    await TestBed.configureTestingModule({
      imports: [DatabaseComponent],
      providers: [provideNoopAnimations(), { provide: DatabaseService, useValue: mockDb }],
    }).compileComponents();

    fixture = TestBed.createComponent(DatabaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // ─── formatBytes ──────────────────────────────────────────────────────────

  describe('formatBytes', () => {
    it('returns "0 Bytes" for 0', () => {
      expect(component.formatBytes(0)).toBe('0 Bytes');
    });

    it('formats kilobytes', () => {
      expect(component.formatBytes(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
      expect(component.formatBytes(1024 * 1024)).toBe('1 MB');
    });

    it('formats with custom decimal places', () => {
      expect(component.formatBytes(1536, 1)).toBe('1.5 KB');
    });
  });

  // ─── formatLastUpdated ────────────────────────────────────────────────────

  describe('formatLastUpdated', () => {
    it('returns a string containing the year', () => {
      expect(component.formatLastUpdated('2024-06-15T12:00:00.000Z')).toContain('2024');
    });

    it('returns a non-empty string for any valid date', () => {
      expect(component.formatLastUpdated('2020-01-01T00:00:00.000Z').length).toBeGreaterThan(0);
    });
  });

  // ─── fetchBulkDataOptions ─────────────────────────────────────────────────

  describe('fetchBulkDataOptions', () => {
    it('sets isLoadingOptions to false after fetching', () => {
      expect(component.isLoadingOptions()).toBeFalse();
    });

    it('only keeps types in the relevant set', () => {
      const types = component.bulkDataOptions().map((o) => o.type);
      expect(types).toContain('oracle_cards');
      expect(types).toContain('unique_artwork');
      expect(types).toContain('rulings');
      expect(types).not.toContain('card_names');
    });

    it('sets status to ready after a successful fetch', () => {
      expect(component.status()).toContain('Ready');
    });

    it('sets status to an error message when fetch fails', async () => {
      (window.fetch as jasmine.Spy).and.returnValue(
        Promise.resolve({ ok: false, statusText: 'Not Found' } as Response),
      );
      await component.fetchBulkDataOptions();
      expect(component.status()).toContain('Error');
    });

    it('sets isLoadingOptions to false even when fetch fails', async () => {
      (window.fetch as jasmine.Spy).and.returnValue(Promise.reject(new Error('Network error')));
      await component.fetchBulkDataOptions();
      expect(component.isLoadingOptions()).toBeFalse();
    });
  });

  // ─── downloadAndStoreData ─────────────────────────────────────────────────

  describe('downloadAndStoreData', () => {
    const option = makeBulkDataOption();

    it('calls db.storeCardData with the fetched JSON', async () => {
      const fakeCards = [{ id: '1', name: 'Island' }];
      (window.fetch as jasmine.Spy).and.returnValue(
        Promise.resolve({ ok: true, json: () => Promise.resolve(fakeCards) } as Response),
      );

      await component.downloadAndStoreData(option);

      expect(mockDb.storeCardData).toHaveBeenCalledWith(fakeCards);
    });

    it('emits dataLoaded after successful store', async () => {
      (window.fetch as jasmine.Spy).and.returnValue(
        Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response),
      );
      spyOn(component.dataLoaded, 'emit');

      await component.downloadAndStoreData(option);

      expect(component.dataLoaded.emit).toHaveBeenCalled();
    });

    it('sets isLoading to false after completion', async () => {
      (window.fetch as jasmine.Spy).and.returnValue(
        Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response),
      );

      await component.downloadAndStoreData(option);

      expect(component.isLoading()).toBeFalse();
    });

    it('sets fileErrorDetails when the HTTP response is not ok', async () => {
      (window.fetch as jasmine.Spy).and.returnValue(
        Promise.resolve({ ok: false, status: 503 } as Response),
      );

      await component.downloadAndStoreData(option);

      expect(component.fileErrorDetails()).toContain('503');
    });

    it('sets isLoading to false even when the download fails', async () => {
      (window.fetch as jasmine.Spy).and.returnValue(Promise.reject(new Error('timeout')));

      await component.downloadAndStoreData(option);

      expect(component.isLoading()).toBeFalse();
    });

    it('does nothing when download_uri is empty', async () => {
      await component.downloadAndStoreData({ ...option, download_uri: '' });
      expect(mockDb.storeCardData).not.toHaveBeenCalled();
    });
  });

  // ─── onFileSelected ───────────────────────────────────────────────────────

  describe('onFileSelected', () => {
    function makeInputEvent(files: File[]): Event {
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: files });
      return { target: input } as unknown as Event;
    }

    it('sets selectedFile when a file is chosen', () => {
      const file = new File(['{}'], 'cards.json', { type: 'application/json' });
      component.onFileSelected(makeInputEvent([file]));
      expect(component.selectedFile()).toBe(file);
    });

    it('sets selectedFile to null when no file is chosen', () => {
      component.onFileSelected(makeInputEvent([]));
      expect(component.selectedFile()).toBeNull();
    });

    it('clears fileErrorDetails when a new file is selected', () => {
      component.fileErrorDetails.set('previous error');
      const file = new File(['{}'], 'cards.json', { type: 'application/json' });
      component.onFileSelected(makeInputEvent([file]));
      expect(component.fileErrorDetails()).toBeNull();
    });
  });

  // ─── uploadAndStoreData ───────────────────────────────────────────────────

  describe('uploadAndStoreData', () => {
    it('does nothing when no file is selected', () => {
      component.selectedFile.set(null);
      component.uploadAndStoreData();
      expect(mockDb.storeCardData).not.toHaveBeenCalled();
    });

    it('parses the file and calls db.storeCardData', (done) => {
      const fakeCards = [{ id: '1', name: 'Mountain' }];
      const file = new File([JSON.stringify(fakeCards)], 'cards.json', { type: 'application/json' });
      component.selectedFile.set(file);

      component.dataLoaded.subscribe(() => {
        expect(mockDb.storeCardData).toHaveBeenCalledWith(fakeCards);
        done();
      });

      component.uploadAndStoreData();
    });

    it('sets fileErrorDetails when the file contains invalid JSON', (done) => {
      const file = new File(['not json at all'], 'bad.json', { type: 'application/json' });
      component.selectedFile.set(file);

      // Poll until isLoading goes back to false (reader finished)
      const interval = setInterval(() => {
        if (!component.isLoading()) {
          clearInterval(interval);
          expect(component.fileErrorDetails()).not.toBeNull();
          done();
        }
      }, 10);

      component.uploadAndStoreData();
    });

    it('sets isLoading to true while reading', () => {
      const file = new File(['[]'], 'cards.json', { type: 'application/json' });
      component.selectedFile.set(file);
      component.uploadAndStoreData();
      expect(component.isLoading()).toBeTrue();
    });
  });
});
