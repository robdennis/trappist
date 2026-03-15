import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TagsComponent } from './tags.component';
import { DatabaseService } from '../core/database.service';
import { Tag } from '../core/models';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    name: 'Test::Tag',
    icon: 'fa-solid fa-star',
    created_at: 1000,
    updated_at: 1000,
    rewards: [],
    enables: [],
    punishes: [],
    ...overrides,
  };
}

describe('TagsComponent', () => {
  let component: TagsComponent;
  let fixture: ComponentFixture<TagsComponent>;
  let mockDb: { tags: jasmine.SpyObj<any> };

  beforeEach(async () => {
    mockDb = {
      tags: jasmine.createSpyObj('tags', ['toArray', 'put', 'delete']),
    };
    mockDb.tags.toArray.and.returnValue(Promise.resolve([]));
    mockDb.tags.put.and.returnValue(Promise.resolve());
    mockDb.tags.delete.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [TagsComponent],
      providers: [provideNoopAnimations(), { provide: DatabaseService, useValue: mockDb }],
    }).compileComponents();

    fixture = TestBed.createComponent(TagsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  describe('addNewTag', () => {
    it('sets a selected tag with a namespaced name', () => {
      component.addNewTag();
      expect(component.selectedTag()).not.toBeNull();
      expect(component.selectedTag()!.name).toContain('::');
    });

    it('creates tag with empty relationship arrays', () => {
      component.addNewTag();
      const tag = component.selectedTag()!;
      expect(tag.rewards).toEqual([]);
      expect(tag.enables).toEqual([]);
      expect(tag.punishes).toEqual([]);
    });

    it('generates a unique id each time', () => {
      component.addNewTag();
      const id1 = component.selectedTag()!.id;
      component.addNewTag();
      const id2 = component.selectedTag()!.id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('selectTagForEditing', () => {
    it('sets the selected tag', () => {
      const tag = makeTag();
      component.selectTagForEditing(tag);
      expect(component.selectedTag()?.id).toBe('tag-1');
    });

    it('makes a copy of the tag, not the same reference', () => {
      const tag = makeTag();
      component.selectTagForEditing(tag);
      expect(component.selectedTag()).not.toBe(tag);
    });

    it('accepts null to clear the selection', () => {
      component.selectTagForEditing(makeTag());
      component.selectTagForEditing(null);
      expect(component.selectedTag()).toBeNull();
    });
  });

  describe('addRelationship', () => {
    beforeEach(() => {
      component.selectTagForEditing(makeTag());
    });

    it('adds a rewards relationship with default ratings', () => {
      component.addRelationship('rewards');
      const tag = component.selectedTag()!;
      expect(tag.rewards!.length).toBe(1);
      expect(tag.rewards![0].cost).toBe(1);
      expect(tag.rewards![0].reward).toBe(1);
    });

    it('adds an enables relationship with default efficacy', () => {
      component.addRelationship('enables');
      const tag = component.selectedTag()!;
      expect(tag.enables!.length).toBe(1);
      expect(tag.enables![0].efficacy).toBe(1);
    });

    it('adds a punishes relationship with default severity', () => {
      component.addRelationship('punishes');
      const tag = component.selectedTag()!;
      expect(tag.punishes!.length).toBe(1);
      expect(tag.punishes![0].severity).toBe(1);
    });

    it('does nothing when no tag is selected', () => {
      component.selectTagForEditing(null);
      component.addRelationship('rewards');
      expect(component.selectedTag()).toBeNull();
    });

    it('can add multiple relationships of the same type', () => {
      component.addRelationship('rewards');
      component.addRelationship('rewards');
      expect(component.selectedTag()!.rewards!.length).toBe(2);
    });
  });

  describe('removeRelationship', () => {
    beforeEach(() => {
      component.selectTagForEditing(
        makeTag({
          rewards: [
            { search: 'a', cost: 1, reward: 1 },
            { search: 'b', cost: 2, reward: 2 },
          ],
          enables: [{ search: 'c', efficacy: 1 }],
          punishes: [{ search: 'd', severity: 3 }],
        }),
      );
    });

    it('removes a rewards relationship by index', () => {
      component.removeRelationship('rewards', 0);
      const rewards = component.selectedTag()!.rewards!;
      expect(rewards.length).toBe(1);
      expect(rewards[0].search).toBe('b');
    });

    it('removes an enables relationship by index', () => {
      component.removeRelationship('enables', 0);
      expect(component.selectedTag()!.enables!.length).toBe(0);
    });

    it('removes a punishes relationship by index', () => {
      component.removeRelationship('punishes', 0);
      expect(component.selectedTag()!.punishes!.length).toBe(0);
    });
  });

  describe('getIconType', () => {
    it('returns "fa" for fa- prefixed strings', () => {
      expect(component.getIconType('fa-solid fa-star')).toBe('fa');
    });

    it('returns "ms" for ms- prefixed strings', () => {
      expect(component.getIconType('ms-w')).toBe('ms');
    });

    it('returns "svg" for https:// URLs', () => {
      expect(component.getIconType('https://example.com/icon.svg')).toBe('svg');
    });

    it('returns "emoji" for unrecognized strings', () => {
      expect(component.getIconType('⚡')).toBe('emoji');
    });

    it('returns "emoji" for undefined', () => {
      expect(component.getIconType(undefined)).toBe('emoji');
    });
  });

  describe('saveSelectedTag', () => {
    it('calls db.tags.put with the selected tag', async () => {
      component.selectTagForEditing(makeTag());
      await component.saveSelectedTag();
      expect(mockDb.tags.put).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'tag-1' }));
    });

    it('clears the selected tag after saving', async () => {
      component.selectTagForEditing(makeTag());
      await component.saveSelectedTag();
      expect(component.selectedTag()).toBeNull();
    });

    it('updates updated_at before saving', async () => {
      const before = Date.now();
      component.selectTagForEditing(makeTag({ updated_at: 0 }));
      await component.saveSelectedTag();
      const saved = mockDb.tags.put.calls.mostRecent().args[0] as Tag;
      expect(saved.updated_at).toBeGreaterThanOrEqual(before);
    });

    it('does nothing when no tag is selected', async () => {
      await component.saveSelectedTag();
      expect(mockDb.tags.put).not.toHaveBeenCalled();
    });
  });

  describe('deleteTag', () => {
    it('calls db.tags.delete with the tag id', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      await component.deleteTag('tag-1');
      expect(mockDb.tags.delete).toHaveBeenCalledWith('tag-1');
    });

    it('does not delete when the user cancels the confirm dialog', async () => {
      spyOn(window, 'confirm').and.returnValue(false);
      await component.deleteTag('tag-1');
      expect(mockDb.tags.delete).not.toHaveBeenCalled();
    });

    it('clears selectedTag if the deleted tag was selected', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.selectTagForEditing(makeTag({ id: 'tag-1' }));
      await component.deleteTag('tag-1');
      expect(component.selectedTag()).toBeNull();
    });
  });
});
