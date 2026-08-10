import type { Config } from "@puckeditor/core";
import { HeroBlock } from "../components/HeroBlock";
import type { HeroBlockProps } from "../components/HeroBlock";
import { ProductBlock } from "../components/ProductBlock";
import type { ProductBlockProps } from "../components/ProductBlock";
import { CarouselBlock } from "../components/CarouselBlock";
import type { CarouselBlockProps } from "../components/CarouselBlock";
import { ImagePosterBlock } from "../components/ImagePosterBlock";
import type { ImagePosterBlockProps } from "../components/ImagePosterBlock";
import { TextBannerBlock } from "../components/TextBannerBlock";
import type { TextBannerBlockProps } from "../components/TextBannerBlock";
import { CategoryShowcaseBlock } from "../components/CategoryShowcaseBlock";
import type { CategoryShowcaseBlockProps } from "../components/CategoryShowcaseBlock";
import { VideoBlock } from "../components/VideoBlock";
import type { VideoBlockProps } from "../components/VideoBlock";
import { mockProductApi, mockCategories } from "../mock/products";

type MyComponents = {
  HeroBlock: HeroBlockProps;
  ProductBlock: ProductBlockProps;
  CarouselBlock: CarouselBlockProps;
  ImagePosterBlock: ImagePosterBlockProps;
  TextBannerBlock: TextBannerBlockProps;
  CategoryShowcaseBlock: CategoryShowcaseBlockProps;
  VideoBlock: VideoBlockProps;
};

/**
 * Puck Config — React Block 注册 + Fields + 权限
 * 核心验证：React 组件直接注册，不引入第二套组件模型
 */
export const puckConfig: Config<MyComponents> = {
  components: {
    HeroBlock: {
      label: "首屏主视觉",
      render: ({
        title,
        subtitle,
        imageUrl,
        buttonText,
        buttonUrl,
        alignment,
      }) => (
        <HeroBlock
          title={title}
          subtitle={subtitle}
          imageUrl={imageUrl}
          buttonText={buttonText}
          buttonUrl={buttonUrl}
          alignment={alignment}
        />
      ),

      defaultProps: {
        title: "海川珠宝",
        subtitle: "传承东方美学，匠心铸造经典",
        imageUrl: "https://placehold.co/800x450/1C1A18/B8944E?text=首屏主视觉",
        buttonText: "探索更多",
        buttonUrl: "#",
        alignment: "left",
      } satisfies HeroBlockProps,

      fields: {
        title: { type: "text" as const, label: "标题" },
        subtitle: { type: "textarea" as const, label: "副标题" },
        imageUrl: { type: "text" as const, label: "图片 URL" },
        buttonText: { type: "text" as const, label: "按钮文字" },
        buttonUrl: { type: "text" as const, label: "按钮链接" },
        alignment: {
          type: "radio" as const,
          label: "对齐方式",
          options: [
            { label: "左对齐", value: "left" },
            { label: "居中", value: "center" },
            { label: "右对齐", value: "right" },
          ],
        },
      },

      // ===== 动态权限：模板 Hero (id='hero-locked') 禁止删除/拖动/复制 =====
      resolvePermissions: (data: any, _params: any) => {
        if (data.props?.id === "hero-locked") {
          return { delete: false, duplicate: false, drag: false };
        }
        return {
          delete: true,
          duplicate: true,
          drag: true,
          edit: true,
          insert: true,
        };
      },
    },

    ProductBlock: {
      label: "宝贝推荐",
      render: ({
        title,
        selectionMode,
        selectedProductIds,
        categoryId,
        limit,
      }) => (
        <ProductBlock
          title={title}
          selectionMode={selectionMode}
          selectedProductIds={selectedProductIds}
          categoryId={categoryId}
          limit={limit}
        />
      ),

      defaultProps: {
        title: "精选商品",
        selectionMode: "manual",
        selectedProductIds: [1, 2, 3, 4],
        categoryId: undefined,
        limit: 4,
      } satisfies ProductBlockProps,

      fields: {
        title: { type: "text" as const, label: "区块标题" },
        selectionMode: {
          type: "radio" as const,
          label: "选品方式",
          options: [
            { label: "手动选择商品", value: "manual" },
            { label: "按分类自动", value: "category" },
          ],
        },

        // ===== External Field：商品数据绑定（PoC 核心验证项）=====
        selectedProductIds: {
          type: "external" as const,
          label: "选择商品",
          placeholder: "搜索商品名称或材质...",
          // fetchList：模拟 productApi.search，返回选项列表
          fetchList: async ({ query }: { query: string }) => {
            const results = await mockProductApi.search(query || "");
            return results.map((p) => ({
              id: p.id,
              name: `${p.name} (${p.material})`,
              price: p.price,
            }));
          },
          // mapProp：从选中行提取要存入 JSON 的值
          mapProp: (row: any) => row.id,
          // mapRow：列定义（Puck 0.22.4 API）
          mapRow: (row: any) => ({
            name: row.name,
            meta: `¥${row.price.toLocaleString()}`,
          }),
        } as any, // 0.22.4 ExternalField 泛型复杂，用 as any 绕过（PoC 验证功能，非生产代码）

        categoryId: {
          type: "select" as const,
          label: "商品分类",
          options: mockCategories.map((c) => ({ label: c.name, value: c.id })),
        },
        limit: { type: "number" as const, label: "显示数量", min: 1, max: 20 },
      },
    },

    // ===== 新增区块 1：轮播图 =====
    CarouselBlock: {
      label: "轮播图海报",
      render: ({
        images,
        autoPlay,
        interval,
        showDots,
        showArrows,
        height,
      }) => (
        <CarouselBlock
          images={images}
          autoPlay={autoPlay}
          interval={interval}
          showDots={showDots}
          showArrows={showArrows}
          height={height}
        />
      ),
      defaultProps: {
        images: [
          {
            url: "https://placehold.co/1200x500/B8944E/fff?text=珠宝轮播1",
            link: "#",
            alt: "珠宝轮播图一",
          },
          {
            url: "https://placehold.co/1200x500/2C2C2C/B8944E?text=珠宝轮播2",
            link: "#",
            alt: "珠宝轮播图二",
          },
          {
            url: "https://placehold.co/1200x500/1C1A18/fff?text=珠宝轮播3",
            link: "#",
            alt: "珠宝轮播图三",
          },
        ],
        autoPlay: true,
        interval: 4000,
        showDots: true,
        showArrows: true,
        height: 500,
      } satisfies CarouselBlockProps,
      fields: {
        images: {
          type: "array" as const,
          label: "轮播图片",
          getItemSummary: (item: any) => item.alt || item.url || "图片",
          arrayFields: {
            url: { type: "text" as const, label: "图片 URL" },
            link: { type: "text" as const, label: "跳转链接（可选）" },
            alt: { type: "text" as const, label: "替代文本" },
          },
        } as any,
        autoPlay: {
          type: "radio" as const,
          label: "自动播放",
          options: [
            { label: "开启", value: true },
            { label: "关闭", value: false },
          ],
        },
        interval: {
          type: "number" as const,
          label: "切换间隔(ms)",
          min: 1000,
          max: 10000,
        },
        showDots: {
          type: "radio" as const,
          label: "指示点",
          options: [
            { label: "显示", value: true },
            { label: "隐藏", value: false },
          ],
        },
        showArrows: {
          type: "radio" as const,
          label: "左右箭头",
          options: [
            { label: "显示", value: true },
            { label: "隐藏", value: false },
          ],
        },
        height: {
          type: "number" as const,
          label: "高度(px)",
          min: 200,
          max: 800,
        },
      },
    },

    // ===== 新增区块 2：单图海报 =====
    ImagePosterBlock: {
      label: "单图海报",
      render: ({
        imageUrl,
        title,
        subtitle,
        buttonText,
        buttonUrl,
        textPosition,
        overlayOpacity,
        minHeight,
      }) => (
        <ImagePosterBlock
          imageUrl={imageUrl}
          title={title}
          subtitle={subtitle}
          buttonText={buttonText}
          buttonUrl={buttonUrl}
          textPosition={textPosition}
          overlayOpacity={overlayOpacity}
          minHeight={minHeight}
        />
      ),
      defaultProps: {
        imageUrl: "https://placehold.co/1200x600/1C1A18/fff?text=单图海报",
        title: "东方之形",
        subtitle: "传统金工与现代美学的交汇",
        buttonText: "探索系列",
        buttonUrl: "#",
        textPosition: "left",
        overlayOpacity: 25,
        minHeight: 560,
      } satisfies ImagePosterBlockProps,
      fields: {
        imageUrl: { type: "text" as const, label: "背景图片 URL" },
        title: { type: "text" as const, label: "标题" },
        subtitle: { type: "textarea" as const, label: "副标题/描述" },
        buttonText: { type: "text" as const, label: "按钮文字" },
        buttonUrl: { type: "text" as const, label: "按钮链接" },
        textPosition: {
          type: "radio" as const,
          label: "文字位置",
          options: [
            { label: "左侧", value: "left" },
            { label: "居中", value: "center" },
            { label: "右侧", value: "right" },
            { label: "左下角", value: "bottomLeft" },
          ],
        },
        overlayOpacity: {
          type: "number" as const,
          label: "遮罩深度(0-100)",
          min: 0,
          max: 80,
        },
        minHeight: {
          type: "number" as const,
          label: "最小高度(px)",
          min: 300,
          max: 1000,
        },
      },
    },

    // ===== 新增区块 3：文字横幅 =====
    TextBannerBlock: {
      label: "文字标题",
      render: ({
        eyebrow,
        title,
        body,
        buttonText,
        buttonUrl,
        alignment,
        backgroundColor,
        textColor,
        spacing,
      }) => (
        <TextBannerBlock
          eyebrow={eyebrow}
          title={title}
          body={body}
          buttonText={buttonText}
          buttonUrl={buttonUrl}
          alignment={alignment}
          backgroundColor={backgroundColor}
          textColor={textColor}
          spacing={spacing}
        />
      ),
      defaultProps: {
        eyebrow: "品牌理念",
        title: "器有形，意无界",
        body: "海川珠宝致力于将东方美学融入每一件作品，以精湛工艺诠释永恒之美。",
        buttonText: "了解更多",
        buttonUrl: "#",
        alignment: "center",
        backgroundColor: "#FBF9F6",
        textColor: "#2C2C2C",
        spacing: "normal",
      } satisfies TextBannerBlockProps,
      fields: {
        eyebrow: { type: "text" as const, label: "眉题（小字）" },
        title: { type: "textarea" as const, label: "主标题" },
        body: { type: "textarea" as const, label: "正文" },
        buttonText: { type: "text" as const, label: "按钮文字" },
        buttonUrl: { type: "text" as const, label: "按钮链接" },
        alignment: {
          type: "radio" as const,
          label: "对齐",
          options: [
            { label: "居中", value: "center" },
            { label: "左对齐", value: "left" },
          ],
        },
        backgroundColor: {
          type: "select" as const,
          label: "背景色",
          options: [
            { label: "浅米", value: "#FBF9F6" },
            { label: "白色", value: "#FFFFFF" },
            { label: "深棕", value: "#1C1A18" },
            { label: "黑色", value: "#0F0D0C" },
          ],
        },
        textColor: {
          type: "select" as const,
          label: "文字颜色",
          options: [
            { label: "深棕", value: "#2C2C2C" },
            { label: "白色", value: "#FFFFFF" },
            { label: "金色", value: "#B8944E" },
          ],
        },
        spacing: {
          type: "select" as const,
          label: "间距",
          options: [
            { label: "紧凑", value: "compact" },
            { label: "标准", value: "normal" },
            { label: "宽松", value: "spacious" },
          ],
        },
      },
    },

    // ===== 新增区块 4：分类展示 =====
    CategoryShowcaseBlock: {
      label: "分类货架",
      render: ({ title, columns, categories }) => (
        <CategoryShowcaseBlock
          title={title}
          columns={columns}
          categories={categories}
        />
      ),
      defaultProps: {
        title: "探索分类",
        columns: 3,
        categories: [
          {
            name: "吊坠系列",
            imageUrl: "https://placehold.co/400x500/B8944E/fff?text=吊坠",
            link: "#",
            count: 28,
          },
          {
            name: "手镯系列",
            imageUrl: "https://placehold.co/400x500/2C2C2C/B8944E?text=手镯",
            link: "#",
            count: 16,
          },
          {
            name: "戒指系列",
            imageUrl: "https://placehold.co/400x500/1C1A18/fff?text=戒指",
            link: "#",
            count: 22,
          },
        ],
      } satisfies CategoryShowcaseBlockProps,
      fields: {
        title: { type: "text" as const, label: "区块标题" },
        columns: {
          type: "radio" as const,
          label: "列数",
          options: [
            { label: "2列", value: 2 },
            { label: "3列", value: 3 },
            { label: "4列", value: 4 },
          ],
        },
        categories: {
          type: "array" as const,
          label: "分类列表",
          getItemSummary: (item: any) => item.name || "分类",
          arrayFields: {
            name: { type: "text" as const, label: "分类名称" },
            imageUrl: { type: "text" as const, label: "图片 URL" },
            link: { type: "text" as const, label: "跳转链接" },
            count: { type: "number" as const, label: "作品数量(可选)", min: 0 },
          },
        } as any,
      },
    },

    // ===== 新增区块 5：视频模块 =====
    VideoBlock: {
      label: "单视频",
      render: ({
        videoUrl,
        posterUrl,
        autoPlay,
        loop,
        muted,
        showControls,
        aspectRatio,
        maxHeight,
      }) => (
        <VideoBlock
          videoUrl={videoUrl}
          posterUrl={posterUrl}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          showControls={showControls}
          aspectRatio={aspectRatio}
          maxHeight={maxHeight}
        />
      ),
      defaultProps: {
        videoUrl: "",
        posterUrl:
          "https://placehold.co/1280x720/1C1A18/B8944E?text=Video+Cover",
        autoPlay: false,
        loop: true,
        muted: true,
        showControls: true,
        aspectRatio: "16:9",
        maxHeight: 720,
      } satisfies VideoBlockProps,
      fields: {
        videoUrl: { type: "text" as const, label: "视频 URL" },
        posterUrl: { type: "text" as const, label: "封面图 URL" },
        autoPlay: {
          type: "radio" as const,
          label: "自动播放",
          options: [
            { label: "开启", value: true },
            { label: "关闭", value: false },
          ],
        },
        loop: {
          type: "radio" as const,
          label: "循环播放",
          options: [
            { label: "开启", value: true },
            { label: "关闭", value: false },
          ],
        },
        muted: {
          type: "radio" as const,
          label: "静音",
          options: [
            { label: "开启", value: true },
            { label: "关闭", value: false },
          ],
        },
        showControls: {
          type: "radio" as const,
          label: "播放控件",
          options: [
            { label: "显示", value: true },
            { label: "隐藏", value: false },
          ],
        },
        aspectRatio: {
          type: "radio" as const,
          label: "比例",
          options: [
            { label: "16:9", value: "16:9" as const },
            { label: "4:3", value: "4:3" as const },
            { label: "9:16", value: "9:16" as const },
          ],
        },
        maxHeight: {
          type: "number" as const,
          label: "最大高度(px)",
          min: 300,
          max: 1080,
        },
      },
    },
  },

  root: {
    render: ({ children }) => <div>{children}</div>,
    fields: {},
  },
};

/** 模板默认布局：Hero + 轮播 + 单图海报 + 文字横幅 + 分类展示 + 视频 + 产品 */
export const jewelryHomeTemplate = {
  content: [
    {
      type: "HeroBlock",
      props: {
        id: "hero-locked",
        ...puckConfig.components.HeroBlock.defaultProps,
      },
    },
    {
      type: "CarouselBlock",
      props: {
        id: "carousel-editable",
        ...puckConfig.components.CarouselBlock.defaultProps,
      },
    },
    {
      type: "ImagePosterBlock",
      props: {
        id: "poster-editable",
        ...puckConfig.components.ImagePosterBlock.defaultProps,
      },
    },
    {
      type: "TextBannerBlock",
      props: {
        id: "textbanner-editable",
        ...puckConfig.components.TextBannerBlock.defaultProps,
      },
    },
    {
      type: "CategoryShowcaseBlock",
      props: {
        id: "categories-editable",
        ...puckConfig.components.CategoryShowcaseBlock.defaultProps,
      },
    },
    {
      type: "VideoBlock",
      props: {
        id: "video-editable",
        ...puckConfig.components.VideoBlock.defaultProps,
      },
    },
    {
      type: "ProductBlock",
      props: {
        id: "product-editable",
        ...puckConfig.components.ProductBlock.defaultProps,
      },
    },
  ],
  root: { props: {} },
};
