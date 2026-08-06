export type PosterLayout = 'full' | 'split';

export interface HeroSettings {
  focusX?: number;
  focusY?: number;
}

export interface PosterItem {
  imageUrl: string;
  alt: string;
  title?: string;
  subtitle?: string;
  linkUrl?: string;
  focusX?: number;
  focusY?: number;
}

export interface PosterSettings {
  layout: PosterLayout;
  items: PosterItem[];
}

export interface HomeSection {
  id?: number;
  type: string;
  title?: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  linkText?: string;
  settings?: HeroSettings | PosterSettings | Record<string, unknown>;
  isEnabled: boolean;
  sortOrder: number;
}

export const defaultHeroSection = (): HomeSection => ({
  type: 'hero',
  imageUrl: '/images/editorial/hero-gold-bangle-v1.png',
  videoUrl: '',
  settings: { focusX: 50, focusY: 50 },
  isEnabled: true,
  sortOrder: 1,
});

export const createPosterItem = (imageUrl = '', alt = ''): PosterItem => ({
  imageUrl,
  alt,
  title: '',
  subtitle: '',
  linkUrl: '',
  focusX: 50,
  focusY: 50,
});

export const createPosterSection = (layout: PosterLayout): HomeSection => ({
  type: 'poster',
  settings: {
    layout,
    items: Array.from({ length: layout === 'split' ? 2 : 1 }, () => createPosterItem()),
  },
  isEnabled: true,
  sortOrder: 1,
});

export function getHeroSettings(section?: HomeSection): HeroSettings {
  const settings = section?.settings as HeroSettings | undefined;
  return {
    focusX: settings?.focusX ?? 50,
    focusY: settings?.focusY ?? 50,
  };
}

export function getPosterSettings(section: HomeSection): PosterSettings {
  const settings = section.settings as PosterSettings | undefined;
  const layout = settings?.layout === 'split' ? 'split' : 'full';
  const expectedCount = layout === 'split' ? 2 : 1;
  const items = (settings?.items || []).slice(0, expectedCount);
  while (items.length < expectedCount) items.push(createPosterItem());
  return { layout, items };
}
