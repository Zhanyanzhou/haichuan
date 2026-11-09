export const CATEGORY_PUBLICATION_RULES = [
  'GROUP_ONLY',
  'RING_SIZE',
  'INNER_DIAMETER',
  'CHAIN_LENGTH',
  'PRECIOUS_METAL',
  'GOLD_WEIGHT',
  'GEMSTONE',
  'GEM_DISCLOSURE',
  'GEM_CARAT',
  'GEM_GRADING',
  'CERTIFICATE',
] as const;

export type CategoryPublicationRule = (typeof CATEGORY_PUBLICATION_RULES)[number];

export const CATEGORY_SIZE_RULES = ['RING_SIZE', 'INNER_DIAMETER', 'CHAIN_LENGTH'] as const;

export function readCategoryPublicationRules(value: unknown): CategoryPublicationRule[] {
  if (!Array.isArray(value)) return [];
  return CATEGORY_PUBLICATION_RULES.filter((rule) => value.includes(rule));
}
