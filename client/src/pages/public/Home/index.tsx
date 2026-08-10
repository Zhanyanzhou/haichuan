import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { usePublishedSlots } from "@/hooks/useContentSlots";
import { usePublishedModules } from "@/hooks/usePageModules";
import { usePagePublishStream } from "@/hooks/usePagePublishStream";
import PuckDocumentRenderer from "@/page-builder/runtime/PuckDocumentRenderer";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { trackPageView } from "@/hooks/useAnalytics";
import type { PublishedSlots } from "@/types/contentSlot";
import type { PageModule } from "@/types/pageModule";
import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import HeroSection from "@/components/blocks/HeroSection";
import ImageTextBlock from "@/components/blocks/ImageTextBlock";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import CardGridBlock from "@/components/blocks/CardGridBlock";
import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";
import TextBannerBlock from "@/components/blocks/TextBannerBlock";
import CarouselBlock from "@/components/blocks/CarouselBlock";
import VideoBlock from "@/components/blocks/VideoBlock";
import HotspotBlock from "@/components/blocks/HotspotBlock";

const LG = "#F7F3EC";
const SF = "#FFFFFF";
const DK = "#1F1A15";
const TX = "#25201B";
const MU = "rgba(37,32,27,0.62)";
const LT = "#FBF7EF";
const LM = "rgba(251,247,239,0.72)";
const PAD = "clamp(20px,4.8vw,76px)";

const SlotCtx = createContext<PublishedSlots>({});

function useSlot(key: string) {
  const slots = useContext(SlotCtx);
  return slots[key];
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

export { LG, SF, DK, TX, MU, LT, LM, PAD, SlotCtx, useInView };

const productFocus = [
  {
    image: "/images/products/ATP103_FRONT_ATP103平安扣涡旋鱼鳞纹卷云纹浮雕线刻弧面外凸立体中央圆孔内外圈组合吊坠正面.png",
    title: "涡旋鱼鳞纹平安扣",
    meta: "足金 / 浮雕线刻",
  },
  {
    image: "/images/products/ATP1048_FRONT_ATP1048元宝形长命锁牌吉祥文字如意云纹圆珠浮雕吊坠正面.png",
    title: "如意云纹长命锁",
    meta: "足金 / 圆珠浮雕",
  },
  {
    image: "/images/products/ATP1055_FRONT_ATP1055圆牌福字蝙蝠祥云珐琅卷草纹吊坠正面.png",
    title: "福字祥云圆牌",
    meta: "足金 / 珐琅卷草纹",
  },
];

const productRail = [
  {
    image: "/images/products/ATP1079_FRONT_ATP1079平安扣龙凤呈祥祥云纹浮雕立体弧面外凸中央圆孔对向环列内外圈组合吊坠正面.png",
    title: "龙凤呈祥平安扣",
    meta: "浮雕 / 祥云纹",
  },
  {
    image: "/images/products/ATP1270_FRONT_ATP1270圆牌六蝠莲花纹珐琅花丝镂空吊坠正面.png",
    title: "六蝠莲花圆牌",
    meta: "珐琅 / 花丝镂空",
  },
  {
    image: "/images/products/ATP1469_FRONT_ATP1469圆牌奔马祥云纹扬蹄飘动鬃尾转动内芯浮雕磨砂内圈环形圆石群镶同心环吊坠正面.png",
    title: "奔马祥云转芯圆牌",
    meta: "转动内芯 / 磨砂",
  },
  {
    image: "/images/products/ATP1669_FRONT_ATP1669珐琅牡丹鼓面吊坠正面.png",
    title: "珐琅牡丹鼓面吊坠",
    meta: "珐琅 / 花卉纹",
  },
];

const occasionCards = [
  {
    title: "新生贺礼",
    desc: "以长命锁与福袋寄寓平安喜乐。",
    image: "/images/products/ATP1049_FRONT_ATP1049元宝形长命锁牌招财猫莲花钱袋吉语纹浮雕吊坠正面.png",
    href: "/products",
  },
  {
    title: "日常佩戴",
    desc: "选择轮廓轻盈、纹样耐看的黄金作品。",
    image: "/images/products/ATP1780_FRONT_ATP1780转动葫芦镂空卷草花纹麻花边O型扣头吊坠正面.png",
    href: "/products",
  },
  {
    title: "纪念时刻",
    desc: "用圆牌、平安扣承载更长久的祝福。",
    image: "/images/products/ATP1442_FRONT_ATP1442圆牌福禄葫芦纹六字真言珐琅吊坠正面.png",
    href: "/catalog",
  },
];

const craftSteps = [
  {
    title: "设计",
    image: "/images/设计.png",
    desc: "确认纹样比例、佩戴尺度与正面识别度。",
  },
  {
    title: "錾刻",
    image: "/images/錾刻.png",
    desc: "让正面图案拥有明确的层次与转折。",
  },
  {
    title: "抛光",
    image: "/images/抛光.png",
    desc: "控制金面的亮度，让细节不被强反光吞没。",
  },
];

const storyBands = [
  {
    image: "/images/products/ATP1079_FRONT_ATP1079平安扣双龙戏珠祥云纹浮雕立体弧面外凸中央圆孔对向环列内外圈组合吊坠正面.png",
    title: "标志性纹样",
    desc: "以龙纹、云纹与金工线条形成海川珠宝的东方秩序感。",
    action: "回溯灵感",
    href: "/products?categoryId=6",
    tone: "light",
    productScene: true,
  },
  {
    image: "/images/錾刻.png",
    title: "錾刻之中，尽显诗意匠心",
    desc: "每一次落刀都让金属表面拥有更清晰的光影层次。",
    action: "细赏工艺",
    href: "/custom",
    tone: "dark",
    productScene: false,
  },
  {
    image: "/images/products/ATP1442_FRONT_ATP1442圆牌福禄葫芦纹六字真言珐琅吊坠正面.png",
    title: "重要时刻的赠礼",
    desc: "在生日、婚礼与纪念日之间，找寻一件能够长久相伴的作品。",
    action: "寻礼之旅",
    href: "/catalog",
    tone: "light",
    productScene: true,
  },
];

const categories = [
  {
    name: "吊坠",
    image: "/images/products/ATP103_FRONT_ATP103平安扣涡旋鱼鳞纹卷云纹浮雕线刻弧面外凸立体中央圆孔内外圈组合吊坠正面.png",
    href: "/products",
  },
  {
    name: "长命锁",
    image: "/images/products/ATP1048_FRONT_ATP1048元宝形长命锁牌吉祥文字如意云纹圆珠浮雕吊坠正面.png",
    href: "/products",
  },
  {
    name: "圆牌",
    image: "/images/products/ATP1055_FRONT_ATP1055圆牌福字蝙蝠祥云珐琅卷草纹吊坠正面.png",
    href: "/products",
  },
  {
    name: "平安扣",
    image: "/images/products/ATP1068_FRONT_ATP1068平安扣六字真言莲瓣浮雕磨砂吊坠正面.png",
    href: "/products",
  },
  {
    name: "珐琅作品",
    image: "/images/products/ATP1104_FRONT_ATP1104海棠形牌双鹦鹉相依花枝花卉叶片纹珐琅镂空浮雕乳钉纹边内外框组合吊坠正面.png",
    href: "/products",
  },
  {
    name: "定制金饰",
    image: "/images/products/ATP111_FRONT_ATP111圆牌八瓣宝相花纹圆石群镶花丝镂空吊坠正面.png",
    href: "/custom",
  },
];

const newsItems = [
  {
    date: "2026年8月",
    title: "海川珠宝臻选东方纹样系列，呈现当代黄金佩戴方式",
    image: "/images/editorial/poster-gold-pendant-v1.webp",
    href: "/products",
  },
  {
    date: "2026年8月",
    title: "从设计到抛光：走近一件黄金作品诞生的工艺流程",
    image: "/images/抛光.png",
    href: "/custom",
  },
];

const homeCss = `
  .vca-home {
    --home-bg: ${LG};
    --home-paper: ${SF};
    --home-text: ${TX};
    --home-muted: ${MU};
    background: var(--home-bg);
    color: var(--home-text);
    font-family: "Noto Serif SC", "Songti SC", serif;
  }

  .vca-home a {
    color: inherit;
    text-decoration: none;
  }

  .vca-link {
    display: inline-flex;
    align-items: center;
    border-bottom: 1px solid currentColor;
    padding-bottom: 5px;
    font-size: 14px;
    line-height: 1.2;
    transition: opacity 180ms ease;
  }

  .vca-link:hover {
    opacity: 0.62;
  }

  .vca-hero {
    position: relative;
    min-height: 100svh;
    overflow: hidden;
    background:
      radial-gradient(circle at 72% 22%, rgba(219,185,121,0.42), transparent 24%),
      linear-gradient(115deg, #f3c9cb 0%, #efd9ce 45%, #e8efe8 100%);
  }

  .vca-hero__stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: clamp(90px, 10vw, 150px) clamp(28px, 8vw, 128px);
  }

  .vca-hero__disc {
    position: absolute;
    right: clamp(-180px, -8vw, -80px);
    top: clamp(-90px, -5vw, -40px);
    width: clamp(520px, 62vw, 980px);
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background: rgba(255,255,255,0.38);
    box-shadow: inset 0 0 0 52px rgba(32,49,108,0.72);
  }

  .vca-hero__stage img {
    position: relative;
    z-index: 1;
    width: min(40vw, 520px);
    height: min(40vw, 520px);
    object-fit: contain;
    filter: drop-shadow(0 34px 34px rgba(87,62,31,0.2));
    mix-blend-mode: multiply;
  }

  .vca-hero__stage img:nth-of-type(2) {
    position: absolute;
    right: clamp(280px, 34vw, 560px);
    bottom: clamp(90px, 13vh, 170px);
    width: min(16vw, 190px);
    height: min(16vw, 190px);
    opacity: 0.72;
    transform: rotate(-8deg);
  }

  .vca-hero__stage img:nth-of-type(3) {
    position: absolute;
    right: clamp(80px, 10vw, 170px);
    bottom: clamp(92px, 12vh, 160px);
    width: min(14vw, 160px);
    height: min(14vw, 160px);
    opacity: 0.68;
    transform: rotate(9deg);
  }

  .vca-hero__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .vca-hero__veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(222,171,171,0.68) 0%, rgba(222,171,171,0.28) 42%, rgba(222,171,171,0.06) 100%),
      linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 28%);
  }

  .vca-hero__copy {
    position: absolute;
    z-index: 1;
    left: clamp(28px, 11vw, 190px);
    top: 39%;
    max-width: 620px;
    transform: translateY(-50%);
    text-align: center;
    color: #fff;
  }

  .vca-hero__copy h1,
  .vca-band__copy h2,
  .vca-section-title h2,
  .vca-product__copy h2,
  .vca-service h2 {
    letter-spacing: 0;
    font-weight: 400;
  }

  .vca-hero__copy h1 {
    margin: 0 0 24px;
    font-size: clamp(38px, 4.4vw, 72px);
    line-height: 1.15;
  }

  .vca-hero__copy p {
    margin: 0 auto 22px;
    max-width: 560px;
    font-size: clamp(14px, 1.25vw, 18px);
    line-height: 2;
  }

  .vca-product {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 620px;
    background: #fff;
  }

  .vca-product__copy {
    display: flex;
    min-height: 620px;
    align-items: center;
    justify-content: center;
    padding: 76px ${PAD};
    text-align: center;
  }

  .vca-product__inner {
    width: min(420px, 100%);
  }

  .vca-product__visuals {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(20px, 4vw, 68px);
    min-height: 250px;
  }

  .vca-product__visuals img {
    width: min(35vw, 210px);
    max-height: 240px;
    object-fit: contain;
    mix-blend-mode: multiply;
  }

  .vca-product__visuals img:nth-child(2) {
    width: min(25vw, 150px);
    opacity: 0.72;
  }

  .vca-product__copy h2 {
    margin: 28px 0 10px;
    font-size: clamp(22px, 2vw, 30px);
    text-decoration: underline;
    text-underline-offset: 5px;
  }

  .vca-product__copy p {
    margin: 0 0 10px;
    color: var(--home-muted);
    font-size: 14px;
  }

  .vca-product__dots {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin: 34px 0 52px;
  }

  .vca-product__dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(37,32,27,0.24);
  }

  .vca-product__dots span:first-child {
    background: rgba(37,32,27,0.78);
  }

  .vca-product__portrait {
    min-height: 620px;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      linear-gradient(140deg, #16223c, #f3d5c9 100%);
    padding: clamp(48px, 8vw, 96px);
  }

  .vca-product__portrait img {
    width: min(72%, 420px);
    height: min(72%, 420px);
    object-fit: contain;
    filter: drop-shadow(0 28px 28px rgba(0,0,0,0.24));
    mix-blend-mode: screen;
  }

  .vca-rail {
    padding: clamp(76px, 10vw, 128px) ${PAD};
    background: #f6f0e7;
  }

  .vca-rail__head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 28px;
    max-width: 1220px;
    margin: 0 auto 42px;
  }

  .vca-rail__head h2,
  .vca-occasion h2,
  .vca-craft h2 {
    margin: 0;
    font-size: clamp(34px, 4vw, 56px);
    font-weight: 400;
    letter-spacing: 0;
  }

  .vca-rail__head p {
    max-width: 440px;
    margin: 0;
    color: var(--home-muted);
    line-height: 1.9;
  }

  .vca-rail__grid {
    display: grid;
    max-width: 1220px;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    margin: 0 auto;
    background: rgba(37,32,27,0.08);
  }

  .vca-rail-card {
    min-height: 390px;
    padding: 36px 28px 32px;
    background: #fff;
    text-align: center;
  }

  .vca-rail-card img {
    width: 100%;
    height: 230px;
    object-fit: contain;
    mix-blend-mode: multiply;
  }

  .vca-rail-card h3 {
    margin: 28px 0 8px;
    font-size: 20px;
    font-weight: 400;
  }

  .vca-rail-card p {
    margin: 0;
    color: var(--home-muted);
    font-size: 14px;
  }

  .vca-band {
    position: relative;
    min-height: 604px;
    overflow: hidden;
    color: #fff;
    background: #c8a66d;
  }

  .vca-band__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .vca-band__product-scene {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background:
      radial-gradient(circle at 70% 45%, rgba(217,179,108,0.18), transparent 24%),
      linear-gradient(112deg, #efe7d8 0%, #efd8d9 48%, #e6efe7 100%);
  }

  .vca-band__product-scene::before {
    position: absolute;
    right: clamp(-180px, -7vw, -70px);
    top: 50%;
    width: clamp(520px, 54vw, 820px);
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background: rgba(32,49,108,0.68);
    content: "";
    transform: translateY(-50%);
  }

  .vca-band__product-scene::after {
    position: absolute;
    right: clamp(120px, 22vw, 360px);
    bottom: clamp(80px, 13vh, 150px);
    width: clamp(170px, 19vw, 300px);
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background: rgba(255,255,255,0.48);
    content: "";
  }

  .vca-band__product-scene img {
    position: absolute;
    right: clamp(90px, 13vw, 230px);
    top: 50%;
    z-index: 1;
    width: clamp(280px, 34vw, 520px);
    height: clamp(280px, 34vw, 520px);
    object-fit: contain;
    filter: drop-shadow(0 32px 34px rgba(82,58,30,0.24));
    mix-blend-mode: multiply;
    transform: translateY(-50%);
  }

  .vca-band__shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(0,0,0,0.38), rgba(0,0,0,0.04) 62%);
  }

  .vca-band.is-light {
    color: #fff;
  }

  .vca-band.is-light .vca-band__shade {
    background: linear-gradient(90deg, rgba(255,255,255,0.08), rgba(0,0,0,0.18) 58%, rgba(0,0,0,0.02));
  }

  .vca-band.has-product-scene {
    color: var(--home-text);
  }

  .vca-band.has-product-scene .vca-band__shade {
    background: linear-gradient(90deg, rgba(255,255,255,0.66), rgba(255,255,255,0.2) 48%, rgba(255,255,255,0));
  }

  .vca-band__copy {
    position: relative;
    z-index: 1;
    display: flex;
    min-height: 604px;
    max-width: 560px;
    flex-direction: column;
    justify-content: center;
    padding: 88px ${PAD};
    text-align: center;
  }

  .vca-band__copy h2 {
    margin: 0 0 22px;
    font-size: clamp(34px, 4vw, 58px);
    line-height: 1.22;
  }

  .vca-band__copy p {
    margin: 0 0 24px;
    font-size: clamp(14px, 1.2vw, 17px);
    line-height: 2;
  }

  .vca-gift {
    padding: clamp(72px, 10vw, 132px) ${PAD} clamp(92px, 12vw, 150px);
    background: #fff;
    text-align: center;
  }

  .vca-gift h2 {
    margin: 0 0 30px;
    font-size: clamp(34px, 4vw, 56px);
    font-weight: 400;
  }

  .vca-gift__image {
    width: min(1120px, 100%);
    aspect-ratio: 2 / 1;
    margin: 0 auto 38px;
    overflow: hidden;
    background: #e7eee2;
  }

  .vca-gift__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .vca-gift p {
    max-width: 760px;
    margin: 0 auto 26px;
    color: var(--home-muted);
    font-size: 16px;
    line-height: 2;
  }

  .vca-occasion {
    padding: clamp(76px, 10vw, 126px) ${PAD};
    background: #eef2e9;
    text-align: center;
  }

  .vca-occasion h2 {
    margin-bottom: 52px;
  }

  .vca-occasion__grid {
    display: grid;
    max-width: 1180px;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    margin: 0 auto;
  }

  .vca-occasion-card {
    min-height: 460px;
    padding: 44px 34px 38px;
    background: rgba(255,255,255,0.62);
    text-align: center;
  }

  .vca-occasion-card img {
    width: 100%;
    height: 250px;
    object-fit: contain;
    mix-blend-mode: multiply;
  }

  .vca-occasion-card h3 {
    margin: 32px 0 12px;
    font-size: 25px;
    font-weight: 400;
  }

  .vca-occasion-card p {
    margin: 0 auto 24px;
    max-width: 260px;
    color: var(--home-muted);
    line-height: 1.8;
  }

  .vca-craft {
    padding: clamp(84px, 11vw, 142px) ${PAD};
    background: ${DK};
    color: ${LT};
    text-align: center;
  }

  .vca-craft > p {
    max-width: 720px;
    margin: 22px auto 58px;
    color: ${LM};
    line-height: 2;
  }

  .vca-craft__grid {
    display: grid;
    max-width: 1180px;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    margin: 0 auto;
    background: rgba(251,247,239,0.16);
  }

  .vca-craft-card {
    background: #2a231d;
    text-align: left;
  }

  .vca-craft-card img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
  }

  .vca-craft-card div {
    padding: 30px;
  }

  .vca-craft-card h3 {
    margin: 0 0 12px;
    font-size: 24px;
    font-weight: 400;
  }

  .vca-craft-card p {
    margin: 0;
    color: ${LM};
    line-height: 1.85;
  }

  .vca-section-title {
    padding: clamp(72px, 9vw, 120px) ${PAD} clamp(46px, 5vw, 72px);
    text-align: center;
    background: #fff;
  }

  .vca-section-title h2 {
    margin: 0 0 14px;
    font-size: clamp(36px, 4.4vw, 64px);
    line-height: 1.18;
  }

  .vca-section-title p {
    margin: 0;
    color: var(--home-muted);
    font-size: 16px;
  }

  .vca-category-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: #fff;
    border-top: 1px solid rgba(37,32,27,0.08);
  }

  .vca-category {
    display: flex;
    min-height: 430px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-right: 1px solid rgba(37,32,27,0.08);
    border-bottom: 1px solid rgba(37,32,27,0.08);
    padding: 42px 28px;
    text-align: center;
    transition: background 180ms ease;
  }

  .vca-category:hover {
    background: #faf8f4;
  }

  .vca-category img {
    width: min(72%, 260px);
    height: 260px;
    object-fit: contain;
    mix-blend-mode: multiply;
  }

  .vca-category h3 {
    margin: 32px 0 0;
    font-size: 20px;
    font-weight: 400;
  }

  .vca-news {
    padding: clamp(78px, 10vw, 128px) ${PAD} 86px;
    background: #fff;
  }

  .vca-news__title {
    margin: 0 0 52px;
    text-align: center;
    font-size: 28px;
    font-weight: 400;
  }

  .vca-news__grid {
    display: grid;
    max-width: 1160px;
    grid-template-columns: repeat(2, 1fr);
    gap: 40px;
    margin: 0 auto;
  }

  .vca-news-card img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: #eee;
  }

  .vca-news-card time {
    display: block;
    margin: 30px 0 12px;
    text-align: center;
    color: var(--home-muted);
    font-size: 15px;
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .vca-news-card h3 {
    margin: 0;
    text-align: center;
    font-size: clamp(24px, 2.5vw, 38px);
    font-weight: 400;
    line-height: 1.35;
    text-decoration: underline;
    text-underline-offset: 6px;
  }

  .vca-service {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid rgba(37,32,27,0.08);
    background: #fff;
  }

  .vca-service article {
    padding: 58px 32px 68px;
    text-align: center;
  }

  .vca-service h2 {
    margin: 0 0 20px;
    font-size: 26px;
  }

  .vca-service p {
    margin: 0 0 24px;
    color: var(--home-muted);
    line-height: 1.8;
  }

  .vca-reveal {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 700ms ease, transform 700ms ease;
  }

  .vca-reveal.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  @media (max-width: 900px) {
    .vca-hero {
      min-height: 82svh;
    }

    .vca-hero__copy {
      left: 24px;
      right: 24px;
      top: 46%;
      max-width: none;
    }

    .vca-product,
    .vca-news__grid,
    .vca-service,
    .vca-rail__grid,
    .vca-occasion__grid,
    .vca-craft__grid {
      grid-template-columns: 1fr;
    }

    .vca-rail__head {
      display: block;
      text-align: center;
    }

    .vca-rail__head p {
      margin: 18px auto 0;
    }

    .vca-product__copy,
    .vca-product__portrait {
      min-height: auto;
    }

    .vca-product__copy {
      padding-top: 66px;
      padding-bottom: 74px;
    }

    .vca-product__portrait {
      aspect-ratio: 1 / 1;
    }

    .vca-hero__stage {
      justify-content: center;
      padding-top: 180px;
      opacity: 0.72;
    }

    .vca-hero__disc {
      right: -220px;
      width: 640px;
    }

    .vca-hero__stage img {
      width: min(64vw, 340px);
      height: min(64vw, 340px);
    }

    .vca-hero__stage img:nth-of-type(2),
    .vca-hero__stage img:nth-of-type(3) {
      display: none;
    }

    .vca-band,
    .vca-band__copy {
      min-height: 520px;
    }

    .vca-band__product-scene::before {
      right: -230px;
      width: 620px;
    }

    .vca-band__product-scene::after {
      display: none;
    }

    .vca-band__product-scene img {
      right: 24px;
      width: 260px;
      height: 260px;
      opacity: 0.62;
    }

    .vca-category-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 560px) {
    .vca-category-grid {
      grid-template-columns: 1fr;
    }

    .vca-category {
      min-height: 330px;
    }

    .vca-category img {
      height: 210px;
    }
  }
`;

function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const rm = useReducedMotion();
  const { ref, visible } = useInView(0.1);
  return (
    <section
      ref={ref}
      className={`vca-reveal ${visible || rm ? "is-visible" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function HeroFilm() {
  const slot = useSlot("HOME_HERO");
  const heroImage = slot?.desktopAsset;

  return (
    <section className="vca-hero">
      {heroImage ? (
        <img
          src={heroImage}
          alt="海川珠宝黄金手镯主视觉"
          className="vca-hero__image"
          fetchPriority="high"
          decoding="sync"
        />
      ) : (
        <div className="vca-hero__stage" aria-hidden="true">
          <span className="vca-hero__disc" />
          <img src={productFocus[0].image} alt="" />
          <img src={productFocus[1].image} alt="" />
          <img src={productFocus[2].image} alt="" />
        </div>
      )}
      <div className="vca-hero__veil" />
      <div className="vca-hero__copy">
        <h1>礼赞东方</h1>
        <p>
          以黄金、纹样与手工细节，铺陈一场关于传承、祝福与佩戴之美的首页叙事。
        </p>
        <Link className="vca-link" to="/products">
          点亮您的身姿
        </Link>
      </div>
    </section>
  );
}

function ProductMoment() {
  return (
    <section className="vca-product">
      <div className="vca-product__copy">
        <div className="vca-product__inner">
          <div className="vca-product__visuals" aria-hidden="true">
            <img src={productFocus[0].image} alt="" loading="eager" />
            <img src={productFocus[1].image} alt="" loading="eager" />
          </div>
          <h2>{productFocus[0].title}</h2>
          <p>{productFocus[0].meta}</p>
          <p>¥ 按克重与工艺核价</p>
          <div className="vca-product__dots" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <Link className="vca-link" to="/products">
            更多作品
          </Link>
        </div>
      </div>
      <div className="vca-product__portrait">
        <img
          src={productRail[0].image}
          alt="龙凤呈祥平安扣正面图"
          loading="lazy"
        />
      </div>
    </section>
  );
}

function ProductRail() {
  return (
    <Reveal className="vca-rail">
      <div className="vca-rail__head">
        <h2>本季精选</h2>
        <p>
          用产品正面图建立首页视觉语言：轮廓清晰、纹样可读、适合转化为主视觉和系列入口。
        </p>
      </div>
      <div className="vca-rail__grid">
        {productRail.map((item) => (
          <Link key={item.title} className="vca-rail-card" to="/products">
            <img src={item.image} alt={item.title} loading="lazy" />
            <h3>{item.title}</h3>
            <p>{item.meta}</p>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}

function StoryBand({ item }: { item: (typeof storyBands)[number] }) {
  return (
    <Reveal
      className={`vca-band ${item.tone === "light" ? "is-light" : ""} ${
        item.productScene ? "has-product-scene" : ""
      }`}
    >
      {item.productScene ? (
        <div className="vca-band__product-scene" aria-hidden="true">
          <img src={item.image} alt="" loading="lazy" />
        </div>
      ) : (
        <img src={item.image} alt="" className="vca-band__image" loading="lazy" />
      )}
      <div className="vca-band__shade" />
      <div className="vca-band__copy">
        <h2>{item.title}</h2>
        <p>{item.desc}</p>
        <Link className="vca-link" to={item.href}>
          {item.action}
        </Link>
      </div>
    </Reveal>
  );
}

function GiftPromenade() {
  return (
    <Reveal className="vca-gift">
      <h2>迷人臻礼</h2>
      <div className="vca-gift__image">
        <img
          src="/images/hero/oriental-water-bangle-v1.png"
          alt="海川珠宝赠礼场景"
          loading="lazy"
        />
      </div>
      <p>
        凭借金工、纹样与细节表达，海川珠宝陪伴生命中的重要时刻，也让日常佩戴拥有更柔和的仪式感。
      </p>
      <Link className="vca-link" to="/catalog">
        步入隽永的世界
      </Link>
    </Reveal>
  );
}

function OccasionPromenade() {
  return (
    <Reveal className="vca-occasion">
      <h2>按场景寻礼</h2>
      <div className="vca-occasion__grid">
        {occasionCards.map((item) => (
          <Link key={item.title} className="vca-occasion-card" to={item.href}>
            <img src={item.image} alt={item.title} loading="lazy" />
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            <span className="vca-link">探索作品</span>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}

function CraftProcess() {
  return (
    <Reveal className="vca-craft">
      <h2>从正面图案到工艺细节</h2>
      <p>
        首页视觉可以围绕产品正面图展开，再用设计、錾刻、抛光等工艺图补足品牌可信度。
      </p>
      <div className="vca-craft__grid">
        {craftSteps.map((item) => (
          <article key={item.title} className="vca-craft-card">
            <img src={item.image} alt={`海川珠宝${item.title}工艺`} loading="lazy" />
            <div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          </article>
        ))}
      </div>
    </Reveal>
  );
}

export function CreationsUniverse() {
  return (
    <>
      <section className="vca-section-title">
        <h2>世家作品</h2>
        <p>探索丰富的作品</p>
      </section>
      <section className="vca-category-grid" aria-label="珠宝品类">
        {categories.map((item) => (
          <Link key={item.name} className="vca-category" to={item.href}>
            <img src={item.image} alt={item.name} loading="lazy" />
            <h3>{item.name}</h3>
          </Link>
        ))}
      </section>
    </>
  );
}

function Newsroom() {
  return (
    <section className="vca-news">
      <h2 className="vca-news__title">新闻中心</h2>
      <div className="vca-news__grid">
        {newsItems.map((item) => (
          <Link key={item.title} to={item.href} className="vca-news-card">
            <img src={item.image} alt="" loading="lazy" />
            <time>{item.date}</time>
            <h3>{item.title}</h3>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ServiceStrip() {
  return (
    <section className="vca-service">
      <article>
        <h2>免费咨询</h2>
        <p>依据预算、场景与佩戴习惯，整理更合适的作品方向。</p>
        <Link className="vca-link" to="/contact">
          预约顾问
        </Link>
      </article>
      <article>
        <h2>联络服务大使</h2>
        <p>欢迎联系海川珠宝顾问，获取作品细节与现货信息。</p>
        <Link className="vca-link" to="/contact">
          联系我们
        </Link>
      </article>
      <article>
        <h2>我们提供的服务</h2>
        <p>定制、调整、工艺沟通与售后维护，让作品长期相伴。</p>
        <Link className="vca-link" to="/custom">
          保养和定制
        </Link>
      </article>
    </section>
  );
}

function FallbackHome() {
  return (
    <div className="vca-home">
      <style>{homeCss}</style>
      <HeroFilm />
      <ProductMoment />
      <ProductRail />
      {storyBands.map((item) => (
        <StoryBand key={item.title} item={item} />
      ))}
      <GiftPromenade />
      <OccasionPromenade />
      <CraftProcess />
      <CreationsUniverse />
      <Newsroom />
      <ServiceStrip />
    </div>
  );
}

const MODULE_MAP: Record<
  string,
  React.ComponentType<{ module: PageModule; editMode?: boolean }>
> = {
  hero: HeroSection,
  singlePoster: SinglePosterSection,
  doublePoster: DoublePosterSection,
  imageText: ImageTextBlock,
  productRow: ProductRowBlock,
  categoryCards: CategoryCardsBlock,
  fullBleed: FullBleedBlock,
  cardGrid: CardGridBlock,
  splitPanel: SplitPanelBlock,
  textBanner: TextBannerBlock,
  carousel: CarouselBlock,
  video: VideoBlock,
  hotspot: HotspotBlock,
};

function EditorModuleFrame({
  module,
  children,
}: {
  module: PageModule;
  children: React.ReactNode;
}) {
  const handleMouseEnter = () => {
    window.parent.postMessage(
      { type: "MODULE_HOVERED", moduleId: module.id },
      "*",
    );
  };
  const handleMouseLeave = () => {
    window.parent.postMessage({ type: "MODULE_HOVERED", moduleId: null }, "*");
  };
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.parent.postMessage(
      { type: "MODULE_SELECTED", moduleId: module.id },
      "*",
    );
  };

  return (
    <section
      data-module-id={module.id}
      data-module-type={module.moduleType}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ position: "relative", cursor: "pointer" }}
    >
      {children}
    </section>
  );
}

function renderModule(m: PageModule, editMode = false) {
  const Comp = MODULE_MAP[m.moduleType];
  if (!Comp) return null;
  const inner = <Comp key={m.id} module={m} editMode={editMode} />;
  if (!editMode) return inner;
  return (
    <EditorModuleFrame key={m.id} module={m}>
      {inner}
    </EditorModuleFrame>
  );
}

function usePublishedPageDocument(pageKey = "home") {
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const response = await pageDocumentApi.getPublished(pageKey);
        if (mountedRef.current) setDocument(unwrapResponse<any>(response));
      } catch {
        if (mountedRef.current) setDocument(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [pageKey],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  return { document, loading, refresh };
}

export default function Home() {
  const {
    modules,
    loading,
    refresh: refreshModules,
  } = usePublishedModules("home");
  const { slots } = usePublishedSlots("home");
  const {
    document,
    loading: documentLoading,
    refresh: refreshDocument,
  } = usePublishedPageDocument("home");

  useEffect(() => {
    trackPageView();
  }, []);

  usePagePublishStream("home", () => {
    void refreshDocument(false);
    void refreshModules(false);
  });

  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);

  useEffect(() => {
    const meta = document?.metadata;
    if (meta && (meta.seoTitle || meta.seoDescription || meta.ogImage)) {
      setPageMeta({
        title: meta.seoTitle || undefined,
        description: meta.seoDescription || undefined,
        image: meta.ogImage || undefined,
      });
    } else {
      clearPageMeta();
    }
    return () => clearPageMeta();
  }, [document, setPageMeta, clearPageMeta]);

  if (loading || documentLoading) {
    return <main style={{ background: LG, minHeight: "100vh" }} />;
  }

  const hasPublished = modules.length > 0;

  return (
    <SlotCtx.Provider value={slots}>
      <main style={{ background: LG }}>
        {document?.puckData ? (
          <PuckDocumentRenderer data={document.puckData} />
        ) : hasPublished ? (
          modules.map((m) => renderModule(m))
        ) : (
          <FallbackHome />
        )}
      </main>
    </SlotCtx.Provider>
  );
}


function useDraftPageDocument(pageKey = "home") {
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const response = await pageDocumentApi.getAdmin(pageKey);
        if (mountedRef.current) setDocument(unwrapResponse<any>(response));
      } catch {
        if (mountedRef.current) setDocument(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [pageKey],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  return { document, loading, refresh };
}

export function HomePreview() {
  const { document, loading } = useDraftPageDocument("home");

  if (loading) {
    return <main style={{ background: LG, minHeight: "100vh" }} />;
  }

  return (
    <main style={{ background: LG }}>
      {document?.puckData ? (
        <PuckDocumentRenderer data={document.puckData} />
      ) : (
        <FallbackHome />
      )}
    </main>
  );
}
