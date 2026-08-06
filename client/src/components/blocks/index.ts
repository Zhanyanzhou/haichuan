import HeroBlock from './HeroBlock';
import CategoriesBlock from './CategoriesBlock';
import StoryBlock from './StoryBlock';
import ProductsBlock from './ProductsBlock';
import CraftBlock from './CraftBlock';
import ContactBlock from './ContactBlock';
import SinglePosterSection from './SinglePosterSection';
import DoublePosterSection from './DoublePosterSection';
import HeroSection from './HeroSection';

export const blockComponents: Record<string, React.ComponentType<any>> = {
  hero: HeroBlock,
  categories: CategoriesBlock,
  story: StoryBlock,
  products: ProductsBlock,
  craft: CraftBlock,
  contact: ContactBlock,
};

/** 页面构建器模块映射（与 Home/index.tsx 的 MODULE_MAP 对应） */
export const moduleComponents: Record<string, React.ComponentType<any>> = {
  singlePoster: SinglePosterSection,
  doublePoster: DoublePosterSection,
  hero: HeroSection,
};
