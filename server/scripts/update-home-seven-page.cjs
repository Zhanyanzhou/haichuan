/**
 * update-home-seven-page.cjs — 一次性脚本（2026-08-18）
 * 把首页 PageDocument(pageKey="home") 的草稿 puckData 更新为 7 页画册结构。
 *
 * 安全说明：
 * - 更新前先把当前 puckData + metadata 备份到 backups/；
 * - 只改草稿(status=DRAFT)，前台 getPublishedPageDocument 读 PageDocumentRevision
 *   发布快照，不受本脚本影响；线上内容在运营点「发布」前不会改变。
 *
 * 运行：cd server && node scripts/update-home-seven-page.cjs
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

/* ── 7 页画册结构（与 client templates.ts jewelryHomeTemplate 一致，带合同印记） ── */
const SEVEN_PAGE_CONTENT = [
  {
    type: "首屏主视觉",
    props: {
      id: "hero-cover",
      title: "海川珠宝",
      subtitle: "以东方美学，铸当代珠宝",
      desktopImage: "",
      mobileImage: "",
      actionText: "",
      linkUrl: "",
      targetType: "none",
      productId: 0,
      altText: "",
      alignment: "left",
      desktopFocusX: 33,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
      locked: false,
      __contentTemplate: { key: "hero", version: 1 },
    },
  },
  {
    type: "文字横幅",
    props: {
      id: "cover-letter",
      eyebrow: "THE HOUSE OF HAICHUAN",
      title: "珠宝，沿着时间生长",
      body: "我们从材质的纹理、光的变化与佩戴的关系出发，让每一件作品在日常之中，慢慢形成属于佩戴者自己的意义。",
      buttonText: "",
      linkUrl: "",
      targetType: "none",
      productId: 0,
      template: "center",
      bgColor: "#FBF9F6",
      textColor: "#2C2C2C",
      spacing: "spacious",
      locked: false,
      __contentTemplate: { key: "textBanner", version: 1 },
    },
  },
  {
    type: "全屏出血图",
    props: {
      id: "feature-collection",
      image: "",
      mobileImage: "",
      title: "当季主题",
      subtitle: "一段关于系列的诗意描述，留给作品自己说话。",
      buttonText: "",
      linkUrl: "",
      targetType: "none",
      productId: 0,
      template: "captionBelow",
      overlayPreset: "none",
      altText: "",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
      locked: false,
      __contentTemplate: { key: "fullBleed", version: 1 },
    },
  },
  {
    type: "单品焦点推荐",
    props: {
      id: "hero-piece",
      eyebrow: "SIGNATURE PIECE",
      title: "代表作品",
      summary: "为重要时刻挑选一件值得珍藏的珠宝，细节与光泽都经得起近距离凝视。",
      productId: 0,
      primaryText: "查看作品",
      secondaryText: "预约鉴赏",
      secondaryLink: "/contact",
      layout: "imageLeft",
      showPrice: false,
      bgColor: "#FFFFFF",
      locked: false,
      __contentTemplate: { key: "featuredProduct", version: 1 },
    },
  },
  {
    type: "单图海报",
    props: {
      id: "craft-section",
      number: "02",
      label: "CRAFTMANSHIP",
      title: "匠心",
      subtitle: "一凿一刻，皆是时光的痕迹。",
      desktopImage: "",
      mobileImage: "",
      linkUrl: "/about",
      actionText: "了解海川",
      template: "leftImageRightText",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
      locked: false,
      __contentTemplate: { key: "singlePoster", version: 1 },
    },
  },
  {
    type: "佩戴灵感",
    props: {
      id: "editorial-spread",
      title: "",
      subtitle: "",
      image: "",
      imageAlt: "珠宝佩戴大片",
      productIds: [],
      actionText: "",
      linkUrl: "",
      targetType: "none",
      productId: 0,
      bgColor: "#FCFCFB",
      locked: false,
      __contentTemplate: { key: "wearingInspiration", version: 1 },
    },
  },
  {
    type: "预约入口",
    props: {
      id: "colophon",
      title: "预约鉴赏",
      subtitle: "一对一珠宝顾问，为您安排专属服务",
      buttonText: "预约鉴赏",
      linkUrl: "/contact",
      phone: "",
      altText: "",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
      tone: "dark",
      bgColor: "#1A1714",
      locked: false,
      __contentTemplate: { key: "booking", version: 1 },
    },
  },
];

async function main() {
  const pageKey = "home";
  const existing = await prisma.pageDocument.findUnique({ where: { pageKey } });

  const backupDir = path.resolve(__dirname, "..", "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  if (existing) {
    const backupPath = path.join(
      backupDir,
      `home-page-puckdata-backup-${Date.now()}.json`,
    );
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        {
          pageKey: existing.pageKey,
          status: existing.status,
          metadata: existing.metadata,
          puckData: existing.puckData,
        },
        null,
        2,
      ),
    );
    console.log(`[备份] 当前首页草稿已备份 → ${backupPath}`);

    const updated = await prisma.pageDocument.update({
      where: { pageKey },
      data: {
        puckData: { content: SEVEN_PAGE_CONTENT, root: { props: {} } },
        status: "DRAFT",
      },
    });
    console.log(
      `[更新] 首页草稿已替换为 7 页画册结构，共 ${updated.puckData.content.length} 个区块（status=DRAFT）。`,
    );
  } else {
    const created = await prisma.pageDocument.create({
      data: {
        pageKey,
        puckData: { content: SEVEN_PAGE_CONTENT, root: { props: {} } },
        metadata: {},
        schemaVersion: 1,
      },
    });
    console.log(
      `[创建] 首页文档不存在，已创建 7 页画册草稿，共 ${created.puckData.content.length} 个区块。`,
    );
  }

  const doc = await prisma.pageDocument.findUnique({ where: { pageKey } });
  console.log("\n当前首页草稿区块顺序：");
  doc.puckData.content.forEach((block, index) => {
    console.log(`  ${index + 1}. ${block.type}`);
  });
  console.log("\n完成后请在编辑器刷新页面查看画布。");
}

main()
  .catch((error) => {
    console.error("执行失败：", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
