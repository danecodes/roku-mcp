import { describe, it, expect } from 'vitest';
import { parseUiXml, findElement, findElements, findFocused } from '../core/ui-tree.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const HOME_PAGE_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<app-ui>
  <topscreen>
    <screen>
      <HomePage name="homepage">
        <BebopNavMenu name="nav">
          <AppButton name="homeBtn" focused="true" text="Home" />
          <AppButton name="browseBtn" focused="false" text="Browse" />
        </BebopNavMenu>
        <HomeHeroCarousel name="hero" visible="true" />
        <LayoutGroup name="rail">
          <AppLabel name="title" text="Continue Watching" />
          <AppButton name="card1" text="Episode 1" />
          <AppButton name="card2" text="Episode 2" />
        </LayoutGroup>
      </HomePage>
    </screen>
  </topscreen>
</app-ui>`;

const NO_FOCUS_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<app-ui>
  <topscreen>
    <screen>
      <VideoPlayer name="player">
        <AppButton name="playBtn" text="Play" />
      </VideoPlayer>
    </screen>
  </topscreen>
</app-ui>`;

const DEEP_FOCUS_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<app-ui>
  <topscreen>
    <screen>
      <SeriesPage name="series">
        <EpisodeList name="list">
          <EpisodeRow name="row1">
            <EpisodeCard name="ep1" focused="false" />
            <EpisodeCard name="ep2" focused="true" text="Episode 2" />
          </EpisodeRow>
        </EpisodeList>
      </SeriesPage>
    </screen>
  </topscreen>
</app-ui>`;

/* ------------------------------------------------------------------ */
/*  findFocused                                                        */
/* ------------------------------------------------------------------ */

describe('findFocused', () => {
  it('returns undefined when no element has focus', async () => {
    const tree = await parseUiXml(NO_FOCUS_XML);
    expect(findFocused(tree)).toBeUndefined();
  });

  it('finds the focused element at the first level', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const focused = findFocused(tree);
    expect(focused).toBeDefined();
    expect(focused?.attrs.name).toBe('homeBtn');
    expect(focused?.attrs.focused).toBe('true');
  });

  it('finds a focused element deep in the tree', async () => {
    const tree = await parseUiXml(DEEP_FOCUS_XML);
    const focused = findFocused(tree);
    expect(focused?.attrs.name).toBe('ep2');
  });

  it('returns the first focused element found (DFS)', async () => {
    // homeBtn is focused and appears before browseBtn in the tree
    const tree = await parseUiXml(HOME_PAGE_XML);
    const focused = findFocused(tree);
    expect(focused?.attrs.name).toBe('homeBtn');
  });
});

/* ------------------------------------------------------------------ */
/*  parseUiXml + selector engine                                       */
/* ------------------------------------------------------------------ */

describe('parseUiXml + findElement', () => {
  it('unwraps app-ui/topscreen/screen wrappers to reach real content', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    expect(tree.tag).toBe('HomePage');
  });

  it('finds by tag name', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const el = findElement(tree, 'HomeHeroCarousel');
    expect(el).toBeDefined();
    expect(el?.tag).toBe('HomeHeroCarousel');
  });

  it('finds by #name', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const el = findElement(tree, '#title');
    expect(el?.attrs.text).toBe('Continue Watching');
  });

  it('finds by tag#name', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const el = findElement(tree, 'AppButton#card2');
    expect(el?.attrs.text).toBe('Episode 2');
  });

  it('finds by descendant selector', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const el = findElement(tree, 'LayoutGroup AppLabel');
    expect(el?.attrs.name).toBe('title');
  });

  it('finds by child selector', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const el = findElement(tree, 'HomePage > BebopNavMenu');
    expect(el?.attrs.name).toBe('nav');
  });

  it('returns undefined for non-existent selector', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    expect(findElement(tree, 'NonExistentComponent')).toBeUndefined();
  });

  it('findElements returns all matches', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const buttons = findElements(tree, 'AppButton');
    // homeBtn, browseBtn, card1, card2
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('nth-child selector works', async () => {
    const tree = await parseUiXml(HOME_PAGE_XML);
    const first = findElement(tree, 'AppButton:nth-child(1)');
    expect(first?.attrs.name).toBe('homeBtn');
  });
});
