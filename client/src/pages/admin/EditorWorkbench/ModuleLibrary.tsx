/**
 * ModuleLibrary.tsx — 模块库面板
 * 左侧固定面板，搜索+分类Tab+模块卡片
 */
import { useState, useMemo } from "react";
import { Input } from "antd";
import {
  SearchOutlined,
  PictureOutlined,
  FileImageOutlined,
  BlockOutlined,
  FileTextOutlined,
  BgColorsOutlined,
  AlertOutlined,
  ShoppingCartOutlined,
  AppstoreOutlined,
  TableOutlined,
  ColumnWidthOutlined,
  PlayCircleOutlined,
  VideoCameraOutlined,
  AimOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { useEditorStore } from "./editorStore";

/* ── 模块元数据 ── */
interface ModuleMeta {
  key: string;
  name: string;
  icon: ReactNode;
  desc: string;
  category: string;
  badge?: string;
  badgeColor?: string;
}

const ALL_MODULES: ModuleMeta[] = [
  {
    key: "首屏主视觉",
    name: "首屏主视觉",
    icon: <PictureOutlined />,
    desc: "全屏品牌主视觉，支持多图轮播",
    category: "基础",
    badge: "核心",
    badgeColor: "#F5222D",
  },
  {
    key: "单图海报",
    name: "单图海报",
    icon: <FileImageOutlined />,
    desc: "单张营销海报，支持热区链接",
    category: "基础",
  },
  {
    key: "双图海报",
    name: "双图海报",
    icon: <BlockOutlined />,
    desc: "左右双图布局，双焦点展示",
    category: "基础",
    badge: "推荐",
    badgeColor: "#FA8C16",
  },
  {
    key: "图文混排",
    name: "图文混排",
    icon: <FileTextOutlined />,
    desc: "左图右文/右图左文等多种布局",
    category: "基础",
  },
  {
    key: "全屏出血图",
    name: "全屏出血图",
    icon: <BgColorsOutlined />,
    desc: "全宽无间距大图展示",
    category: "基础",
  },
  {
    key: "产品展示行",
    name: "产品展示行",
    icon: <ShoppingCartOutlined />,
    desc: "横向展示商品卡片列表",
    category: "商品",
    badge: "推荐",
    badgeColor: "#FA8C16",
  },
  {
    key: "分类卡片",
    name: "分类卡片",
    icon: <AppstoreOutlined />,
    desc: "分类导航卡片，支持图片+标题",
    category: "商品",
  },
  {
    key: "卡片网格",
    name: "卡片网格",
    icon: <TableOutlined />,
    desc: "多列网格布局容器",
    category: "商品",
  },
  {
    key: "文字横幅",
    name: "文字横幅",
    icon: <AlertOutlined />,
    desc: "纯文字促销/公告横幅",
    category: "品牌",
  },
  {
    key: "轮播图",
    name: "轮播图",
    icon: <PlayCircleOutlined />,
    desc: "滑动轮播展示多张图片",
    category: "媒体",
    badge: "新",
    badgeColor: "#1890FF",
  },
  {
    key: "视频区块",
    name: "视频区块",
    icon: <VideoCameraOutlined />,
    desc: "嵌入视频播放区块",
    category: "媒体",
  },
  {
    key: "分割面板",
    name: "分割面板",
    icon: <ColumnWidthOutlined />,
    desc: "左右分割内容面板",
    category: "转化",
  },
  {
    key: "热区图",
    name: "热区图",
    icon: <AimOutlined />,
    desc: "图片上设置可点击热区",
    category: "转化",
  },
];

const CATEGORIES = ["全部", "基础", "商品", "品牌", "媒体", "转化"];

export default function ModuleLibrary() {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("全部");
  const setPageData = useEditorStore((s) => s.setPageData);
  const pageData = useEditorStore((s) => s.pageData);

  const filtered = useMemo(() => {
    let list = ALL_MODULES;
    if (activeCat !== "全部")
      list = list.filter((m) => m.category === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.name.includes(q) || m.desc.includes(q));
    }
    return list;
  }, [search, activeCat]);

  /** 点击添加模块到页面末尾 */
  const handleAdd = (mod: ModuleMeta) => {
    if (!pageData) return;
    const newBlock = {
      type: mod.key,
      props: { id: `${mod.key}-${Date.now()}` },
    };
    const updated = {
      ...pageData,
      content: [...(pageData.content ?? []), newBlock],
    };
    setPageData(updated);
  };

  return (
    <div
      className="flex flex-col h-full bg-white border-r border-gray-200 select-none"
      style={{ width: 240 }}
    >
      {/* 搜索 */}
      <div className="p-3 pb-0">
        <Input
          size="small"
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="搜索模块"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
      </div>

      {/* 分类 Tab */}
      <div className="flex flex-wrap gap-0.5 px-3 py-2 border-b border-gray-100">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              activeCat === cat
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-gray-500 hover:bg-gray-50"
            }`}
            onClick={() => setActiveCat(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 模块卡片列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.map((mod) => (
          <button
            key={mod.key}
            className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-gray-100 bg-white
              hover:border-blue-300 hover:shadow-sm hover:bg-blue-50/30 transition-all text-left cursor-pointer"
            onClick={() => handleAdd(mod)}
            draggable
          >
            <div className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-50 text-gray-500 flex-shrink-0 text-base">
              {mod.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 leading-tight">
                {mod.name}
              </div>
              <div className="text-[10px] text-gray-400 leading-tight truncate">
                {mod.desc}
              </div>
            </div>
            {mod.badge && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                style={{
                  color: mod.badgeColor,
                  background: `${mod.badgeColor}15`,
                }}
              >
                {mod.badge}
              </span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-8">
            无匹配模块
          </div>
        )}
      </div>
    </div>
  );
}
