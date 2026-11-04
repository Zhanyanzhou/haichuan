/**
 * 第六轮首屏选图验收夹具。只由独立诊断页加载，应用入口不引用它。
 * 素材、比例和失败态都是本任务的试样，不读取用户草稿或业务库。
 */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import HeroSection from "@/components/blocks/HeroSection";
import { PublicImageFactsProvider } from "@/page-builder/runtime/publicImageFacts";
import type { PageModule } from "@/types/pageModule";
import "@/styles/globals.css";

const STAMP = "2026-11-05T00:00:00.000Z";

function asset(name: string) {
  return `/uploads/page-assets/${name}.png`;
}

const FACTS = {
  [asset("r6-desktop-a")]: { displayWidth: 3840, displayHeight: 2160 },
  [asset("r6-mobile-a")]: { displayWidth: 2000, displayHeight: 2500 },
  [asset("r6-desktop-b")]: { displayWidth: 3840, displayHeight: 2160 },
  [asset("r6-mobile-b")]: { displayWidth: 2000, displayHeight: 2500 },
};

function moduleFor(generation: "a" | "b"): PageModule {
  const only = new URLSearchParams(window.location.search).get("only");
  return {
    id: 1,
    pageKey: "r6-hero",
    moduleType: "hero",
    sortOrder: 0,
    isVisible: true,
    status: "PUBLISHED",
    content: {
      desktopImage: only === "mobile" ? "" : asset(`r6-desktop-${generation}`),
      mobileImage: only === "desktop" ? "" : asset(`r6-mobile-${generation}`),
      title: "试样",
      altText: "试样",
    },
    layoutConfig: { alignment: "center" },
    styleConfig: {},
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function Fixture() {
  const mode = new URLSearchParams(window.location.search).get("mode") ?? "geometry";
  const editMode = mode === "edit" || mode === "edit-fail";
  const [generation, setGeneration] = useState<"a" | "b">("a");
  const pageModule = useMemo(() => moduleFor(generation), [generation]);
  return (
    <BrowserRouter>
      <PublicImageFactsProvider facts={editMode ? {} : FACTS}>
        <div data-page-document-state="published">
          <HeroSection module={pageModule} editMode={editMode} priority />
        </div>
        <div style={{ height: 1600 }} />
        <button id="r6-swap" type="button" onClick={() => setGeneration((current) => current === "a" ? "b" : "a")}>更换图片</button>
      </PublicImageFactsProvider>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Fixture />);
