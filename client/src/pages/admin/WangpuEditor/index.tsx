/**
 * WangpuEditor — 1:1 对标千牛旺铺装修编辑器 v2
 */
import { useState, useEffect } from "react";
import { Button, Input, Switch, Tabs, message, Modal } from "antd";
import {
  EyeOutlined,
  SendOutlined,
  DownloadOutlined,
  CustomerServiceOutlined,
  FormOutlined,
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CopyOutlined,
  QuestionCircleOutlined,
  CaretDownOutlined,
} from "@ant-design/icons";
import { Render } from "@puckeditor/core";
import { puckConfig } from "@/page-builder/config/puckConfig";
import { jewelryHomeTemplate } from "@/page-builder/templates/templates";
import { pageDocumentApi } from "@/services/api";

/* ═══════ 类型 ═══════ */
interface ModuleItem {
  type: string;
  props: Record<string, any>;
}
interface CatalogItem {
  key: string;
  title: string;
  modules: string[];
  badges?: Record<string, { text: string; color: string }>;
}

/* ═══════ 模块目录 ═══════ */
const officialCatalog: CatalogItem[] = [
  { key: "free", title: "限免专区", modules: [] },
  {
    key: "basic-img",
    title: "图文视频(6)",
    modules: [
      "首屏主视觉",
      "单图海报",
      "双图海报",
      "图文混排",
      "全屏出血图",
      "轮播图",
    ],
    badges: {
      轮播图: { text: "NEW", color: "#FF6B6B" },
      首屏主视觉: { text: "必备", color: "#B8944E" },
    },
  },
  {
    key: "basic-product",
    title: "宝贝货架(4)",
    modules: ["产品展示行", "分类卡片", "卡片网格", "分割面板"],
    badges: { 产品展示行: { text: "精", color: "#B8944E" } },
  },
  {
    key: "basic-marketing",
    title: "营销互动(4)",
    modules: ["文字横幅", "热区图", "单视频", "系列商品卡"],
    badges: {
      热区图: { text: "HOT", color: "#FF6B6B" },
      单视频: { text: "NEW", color: "#FF6B6B" },
    },
  },
];

const moduleIcons: Record<string, string> = {
  首屏主视觉: "🏠",
  单图海报: "🖼️",
  双图海报: "🖼️",
  图文混排: "📝",
  全屏出血图: "🌄",
  轮播图: "🎠",
  产品展示行: "🛍️",
  分类卡片: "📂",
  卡片网格: "🎴",
  分割面板: "◧",
  文字横幅: "📋",
  热区图: "🖱️",
  单视频: "🎬",
  系列商品卡: "🏷️",
};

export default function WangpuEditor() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [puckData, setPuckData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [customPage, setCustomPage] = useState(false);
  const [tab1, setTab1] = useState("official");
  const [tab2, setTab2] = useState("basic-img");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await pageDocumentApi.getAdmin("home");
        const doc = res?.data ?? res;
        if (doc?.puckData) {
          setPuckData(doc.puckData);
          setModules(doc.puckData.content || []);
          setLastSaved(
            doc.updatedAt
              ? new Date(doc.updatedAt).toLocaleString("zh-CN")
              : "",
          );
          return;
        }
      } catch {
        // Fall back to the bundled template when the draft is unavailable.
      }
      const tpl = jewelryHomeTemplate.puckData || {
        content: [],
        root: { props: {} },
      };
      setPuckData(tpl);
      setModules(tpl.content || []);
    })();
  }, []);

  const sync = (mods: ModuleItem[]) => {
    setModules(mods);
    setPuckData((d: any) => ({ ...(d || {}), content: mods }));
  };
  const add = (type: string, at?: number) => {
    const idx = at ?? modules.length;
    const defs = (puckConfig.components as any)?.[type]?.defaultProps || {};
    sync([
      ...modules.slice(0, idx),
      { type, props: { ...defs } },
      ...modules.slice(idx),
    ]);
    setSelectedIdx(idx);
  };
  const remove = (i: number) => {
    sync(modules.filter((_, j) => j !== i));
    if (selectedIdx === i) setSelectedIdx(null);
  };
  const move = (i: number, d: -1 | 1) => {
    const n = i + d;
    if (n < 0 || n >= modules.length) return;
    const m = [...modules];
    [m[i], m[n]] = [m[n], m[i]];
    sync(m);
    setSelectedIdx(n);
  };
  const dup = (i: number) => {
    const m = [...modules];
    m.splice(i + 1, 0, structuredClone(modules[i]));
    sync(m);
    setSelectedIdx(i + 1);
  };
  const upd = (i: number, k: string, v: any) => {
    const m = [...modules];
    m[i] = { ...m[i], props: { ...m[i].props, [k]: v } };
    sync(m);
  };
  const save = async () => {
    setSaving(true);
    try {
      await pageDocumentApi.save({ pageKey: "home", puckData });
      message.success("已保存");
      setLastSaved(new Date().toLocaleString("zh-CN"));
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };
  const publish = () =>
    Modal.confirm({
      title: "确认发布上线",
      content: "发布后将立即更新前台页面",
      okText: "确认发布",
      onOk: async () => {
        try {
          await pageDocumentApi.publish("home");
          message.success("已发布上线");
        } catch {
          message.error("发布失败");
        }
      },
    });

  const catalog = tab1 === "official" ? officialCatalog : [];
  const activeCatalog = catalog.find((c) => c.key === tab2);
  const visibleMods = searchText
    ? (activeCatalog?.modules || []).filter((m) => m.includes(searchText))
    : activeCatalog?.modules || [];

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#F0F0F0",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}
    >
      {/* ═══ 顶部栏 ═══ */}
      <div
        style={{
          flexShrink: 0,
          background: "#fff",
          borderBottom: "1px solid #E5E5E5",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#222" }}>
            推荐
          </span>
          <span style={{ fontSize: 12, color: "#666" }}>
            当前页面：<b style={{ color: "#333" }}>店铺默认页面</b>
          </span>
          {lastSaved && (
            <span style={{ fontSize: 12, color: "#999" }}>
              上次保存时间：{lastSaved}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontSize: 12,
              color: "#666",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <DownloadOutlined /> 下载
          </span>
          <span
            style={{
              fontSize: 12,
              color: "#666",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <CustomerServiceOutlined /> 官方客服
          </span>
          <span
            style={{
              fontSize: 12,
              color: "#666",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <FormOutlined /> 反馈
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#666" }}>个性化页面</span>
            <Switch
              size="small"
              checked={customPage}
              onChange={setCustomPage}
            />
          </div>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => window.open("/", "_blank")}
          >
            预览
          </Button>
          <Button
            size="small"
            onClick={publish}
            type="primary"
            icon={<SendOutlined />}
            style={{ background: "#FF5000", borderColor: "#FF5000" }}
          >
            发布 <CaretDownOutlined style={{ fontSize: 10 }} />
          </Button>
        </div>
      </div>
      {/* ═══ 三栏主体 ═══ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 左栏 */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            background: "#FAFAFA",
            borderRight: "1px solid #E5E5E5",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "10px 12px" }}>
            <Input
              prefix={<SearchOutlined style={{ color: "#bbb" }} />}
              placeholder="搜索"
              size="small"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </div>
          <Tabs
            activeKey={tab1}
            onChange={setTab1}
            size="small"
            tabBarStyle={{ padding: "0 12px", marginBottom: 0 }}
            items={[
              { key: "official", label: "官方模块" },
              { key: "purchased", label: "已购模块" },
            ]}
          />
          <Tabs
            activeKey={tab2}
            onChange={setTab2}
            size="small"
            tabBarStyle={{ padding: "0 8px", marginBottom: 0 }}
            items={catalog.map((c) => ({ key: c.key, label: c.title }))}
          />
          <div style={{ flex: 1, overflow: "auto", padding: "4px 10px 10px" }}>
            {visibleMods.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "#999",
                  fontSize: 12,
                }}
              >
                <div>当前类目下没有可用模块</div>
                <div
                  style={{ color: "#B8944E", marginTop: 8, cursor: "pointer" }}
                >
                  去服务市场购买更多模块
                </div>
              </div>
            ) : (
              visibleMods.map((name) => {
                const badge = activeCatalog?.badges?.[name];
                const c = [
                  "#FAF8F5",
                  "#F5F1EB",
                  "#EDE9E2",
                  "#F8F4EE",
                  "#F2ECE1",
                ];
                return (
                  <div
                    key={name}
                    onClick={() => add(name)}
                    style={{
                      cursor: "pointer",
                      marginBottom: 8,
                      border: "1px solid #E8E8E8",
                      borderRadius: 6,
                      background: "#fff",
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.boxShadow =
                        "0 2px 10px rgba(0,0,0,0.08)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.boxShadow =
                        "none")
                    }
                  >
                    <div
                      style={{
                        height: 80,
                        background: `linear-gradient(135deg, ${c[name.length % 5]}, ${c[(name.length + 1) % 5]})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                      }}
                    >
                      {badge && (
                        <span
                          style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            padding: "0 5px",
                            borderRadius: 2,
                            fontSize: 10,
                            background: badge.color,
                            color: "#fff",
                            fontWeight: 500,
                          }}
                        >
                          {badge.text}
                        </span>
                      )}
                      <span style={{ fontSize: 28, opacity: 0.35 }}>
                        {moduleIcons[name] || "📦"}
                      </span>
                    </div>
                    <div style={{ padding: "6px 10px" }}>
                      <span
                        style={{ fontSize: 12, fontWeight: 500, color: "#333" }}
                      >
                        {name}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        {/* 中栏画布 */}
        <div style={{ flex: 1, overflow: "auto", background: "#E8E4DD" }}>
          <div
            style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 0 80px" }}
          >
            <div
              style={{
                background: "#fff",
                margin: "0 16px 8px",
                borderRadius: 4,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                color: "#333",
                border: "1px solid #E5E5E5",
              }}
            >
              海川珠宝店的小店86
            </div>
            {modules.map((mod, i) => (
              <div key={i}>
                <DropZone onClick={() => add("文字横幅", i)} />
                <div
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    margin: "8px 16px",
                    border: `2px solid ${selectedIdx === i ? "#B8944E" : "transparent"}`,
                    borderRadius: 4,
                    background: "#fff",
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "#FAF5F0",
                      padding: "5px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#8C6D3F",
                      borderBottom: "1px solid #EDE5D8",
                    }}
                  >
                    <span>{mod.type}</span>
                    <div style={{ display: "flex", gap: 2 }}>
                      <Btn
                        icon={<ArrowUpOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          move(i, -1);
                        }}
                      />
                      <Btn
                        icon={<ArrowDownOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          move(i, 1);
                        }}
                      />
                      <Btn
                        icon={<CopyOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          dup(i);
                        }}
                      />
                      <Btn
                        icon={<DeleteOutlined />}
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(i);
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      minHeight: 60,
                      pointerEvents: "none",
                      overflow: "hidden",
                    }}
                  >
                    {puckData && (
                      <Render
                        config={puckConfig}
                        data={{ ...puckData, content: [mod] }}
                      />
                    )}
                  </div>
                </div>
                {i === modules.length - 1 && (
                  <DropZone onClick={() => add("文字横幅")} />
                )}
              </div>
            ))}
            {modules.length === 0 && (
              <DropZone
                onClick={() => add("首屏主视觉")}
                label="将模块放置于此 — 从左侧点击添加"
              />
            )}
          </div>
        </div>
        {/* 右栏 */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            background: "#fff",
            borderLeft: "1px solid #E5E5E5",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{ padding: "8px 12px", borderBottom: "1px solid #F0F0F0" }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#999",
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              页面模块
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {modules.map((m, i) => (
                <span
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontSize: 11,
                    background: selectedIdx === i ? "#FDF5EC" : "#F5F5F5",
                    color: selectedIdx === i ? "#B8944E" : "#666",
                    border: `1px solid ${selectedIdx === i ? "#B8944E" : "transparent"}`,
                  }}
                >
                  {m.type}
                </span>
              ))}
              {modules.length === 0 && (
                <span style={{ fontSize: 11, color: "#ccc" }}>暂无模块</span>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
            {selectedIdx !== null && modules[selectedIdx] ? (
              <Section title="模块基础内容" defaultOpen>
                {(Object.entries(modules[selectedIdx].props) as [string, any][])
                  .filter(
                    ([k]) =>
                      typeof modules[selectedIdx].props[k] !== "object" ||
                      k === "images",
                  )
                  .slice(0, 8)
                  .map(([key, val]) => (
                    <Field
                      key={key}
                      label={key}
                      value={val}
                      onChange={(v) => upd(selectedIdx, key, v)}
                      type={
                        typeof val === "number"
                          ? "number"
                          : typeof val === "boolean"
                            ? "bool"
                            : "text"
                      }
                    />
                  ))}
              </Section>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "#ccc",
                  fontSize: 12,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
                <div>点击左侧模块添加到页面</div>
                <div>点击画布中的模块进行编辑</div>
              </div>
            )}
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid #F0F0F0",
              display: "flex",
              gap: 8,
            }}
          >
            <Button size="small" block onClick={save} loading={saving}>
              保存
            </Button>
            <Button size="small" block onClick={() => setSelectedIdx(null)}>
              取消
            </Button>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 310,
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
          padding: "6px 16px",
          fontSize: 12,
          color: "#666",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <QuestionCircleOutlined /> <span>分类在哪里分</span>
      </div>
    </div>
  );
}

/* ═══════ 子组件 ═══════ */
function DropZone({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <div
      onClick={onClick}
      style={{
        margin: "0 16px",
        padding: "16px",
        textAlign: "center",
        border: "1px dashed #D9D9D9",
        borderRadius: 4,
        color: "#999",
        fontSize: 12,
        cursor: "pointer",
        background: "rgba(255,255,255,0.5)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#B8944E";
        e.currentTarget.style.color = "#B8944E";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#D9D9D9";
        e.currentTarget.style.color = "#999";
      }}
    >
      <PlusOutlined style={{ marginRight: 4 }} />
      {label || "将模块放置于此"}
    </div>
  );
}

function Btn({
  icon,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <Button
      type="text"
      size="small"
      danger={danger}
      icon={icon}
      onClick={onClick}
      style={{ color: danger ? undefined : "#8C6D3F", fontSize: 12 }}
    />
  );
}

function Section({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 0",
          borderBottom: open ? "1px solid #F0F0F0" : "none",
          marginBottom: open ? 8 : 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
          {title}
        </span>
        <CaretDownOutlined
          style={{
            fontSize: 10,
            color: "#999",
            transform: open ? "rotate(0)" : "rotate(-90deg)",
            transition: "0.2s",
          }}
        />
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type: "text" | "number" | "bool";
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>
        {label}
      </div>
      {type === "bool" ? (
        <Switch size="small" checked={value} onChange={onChange} />
      ) : type === "number" ? (
        <Input
          size="small"
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <Input
          size="small"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`输入${label}`}
        />
      )}
    </div>
  );
}
