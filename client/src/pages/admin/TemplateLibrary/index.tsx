import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal, message } from "antd";
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  EyeOutlined,
} from "@ant-design/icons";
import { pageDocumentApi } from "@/services/api";
import "./styles.css";

type TemplateStatus = "ready" | "planned";

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  pageLabel: string;
  pageKey: string;
  moduleCount: number;
  version: string;
  updatedAt: string;
  updatedBy: string;
  image: string;
  status: TemplateStatus;
}

const templateOptions: TemplateOption[] = [
  {
    id: "jewelry-home",
    name: "典藏首页",
    description: "适用于品牌展示、系列入口与精选商品",
    pageLabel: "店铺首页",
    pageKey: "home",
    moduleCount: 5,
    version: "v1.3.0",
    updatedAt: "2026-08-08 10:24",
    updatedBy: "超级管理员",
    image: "/images/admin/templates/jewelry-home-wireframe.png",
    status: "ready",
  },
  {
    id: "brand-story",
    name: "品牌故事",
    description: "适用于品牌历程、工艺与价值表达",
    pageLabel: "品牌故事页",
    pageKey: "about",
    moduleCount: 6,
    version: "v1.1.0",
    updatedAt: "2026-08-06 16:42",
    updatedBy: "内容编辑",
    image: "/images/admin/templates/brand-story-wireframe.png",
    status: "planned",
  },
  {
    id: "selection-service",
    name: "选款服务",
    description: "适用于系列筛选、服务说明与预约转化",
    pageLabel: "选款中心",
    pageKey: "catalog",
    moduleCount: 7,
    version: "v1.0.0",
    updatedAt: "2026-08-05 09:18",
    updatedBy: "系统",
    image: "/images/admin/templates/selection-service-wireframe.png",
    status: "planned",
  },
];

const versionHistory = [
  { version: "v1.3.0", time: "2026-08-08 10:24", author: "超级管理员" },
  { version: "v1.2.0", time: "2026-08-06 16:42", author: "内容编辑" },
  { version: "v1.1.0", time: "2026-08-05 11:03", author: "超级管理员" },
  { version: "v1.0.0", time: "2026-08-03 09:18", author: "系统" },
];

function TemplateImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  return (
    <div className={`template-image template-image--${state}`}>
      {state === "loading" && <span>加载预览…</span>}
      {state === "error" && <span>预览图暂不可用</span>}
      <img
        src={src}
        alt={alt}
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
      />
    </div>
  );
}

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(templateOptions[0].id);
  const [publishing, setPublishing] = useState(false);

  const selected = useMemo(
    () =>
      templateOptions.find((template) => template.id === selectedId) ??
      templateOptions[0],
    [selectedId],
  );

  const enterEditor = () => {
    if (selected.status !== "ready") {
      message.info("该页面模板正在接入编辑器，当前可先使用典藏首页");
      return;
    }
    navigate(`/admin/editor/${selected.pageKey}?template=${selected.id}`);
  };

  const preview = () => {
    const route = selected.pageKey === "home" ? "/" : `/${selected.pageKey}`;
    window.open(route, "_blank", "noopener,noreferrer");
  };

  const publish = () => {
    if (selected.status !== "ready") {
      message.info("该模板尚未启用，暂不能发布");
      return;
    }

    Modal.confirm({
      title: "发布当前页面？",
      content: "发布后，店铺首页将更新为当前编辑器中的最新版本。",
      okText: "确认发布",
      cancelText: "取消",
      onOk: async () => {
        setPublishing(true);
        try {
          await pageDocumentApi.publish(selected.pageKey);
          message.success("页面已发布");
        } catch {
          message.error("发布失败，请检查服务状态后重试");
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  return (
    <section className="template-library" aria-labelledby="template-page-title">
      <header className="template-library__header">
        <div>
          <h1 id="template-page-title">页面装修</h1>
          <span className="template-library__slash">/</span>
          <span>模板</span>
        </div>
        <div className="template-library__actions">
          <span className="template-library__saved">
            <CheckCircleFilled /> 已保存
          </span>
          <Button icon={<EyeOutlined />} onClick={preview}>
            预览
          </Button>
          <Button
            type="primary"
            loading={publishing}
            onClick={publish}
            className="template-library__publish"
          >
            发布
          </Button>
        </div>
      </header>

      <div className="template-library__body">
        <aside className="template-library__picker" aria-label="模板列表">
          <h2>选择模板</h2>
          <div className="template-library__cards">
            {templateOptions.map((template) => {
              const isSelected = template.id === selected.id;
              return (
                <button
                  type="button"
                  key={template.id}
                  className={`template-card${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(template.id)}
                  aria-pressed={isSelected}
                >
                  <TemplateImage
                    src={template.image}
                    alt={`${template.name}模板预览`}
                  />
                  <span className="template-card__copy">
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                  </span>
                  {isSelected && (
                    <CheckCircleFilled className="template-card__check" />
                  )}
                </button>
              );
            })}
          </div>

          <ol className="template-workflow" aria-label="页面发布流程">
            {["选择模板", "编辑内容", "预览", "发布"].map((label, index) => (
              <li key={label} className={index === 0 ? "is-current" : ""}>
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </aside>

        <main className="template-library__preview">
          <div className="template-library__preview-sheet">
            <TemplateImage
              src={selected.image}
              alt={`${selected.name}完整结构预览`}
            />
            <div className="template-library__preview-tail" aria-hidden="true">
              <div className="template-preview-section template-preview-section--cards">
                <span />
                <span />
                <span />
              </div>
              <div className="template-preview-section template-preview-section--story">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="template-preview-section template-preview-section--footer">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </main>

        <aside className="template-library__details" aria-label="模板详情">
          <div className="template-library__details-heading">
            <div>
              <h2>{selected.name}</h2>
              <span>{selected.version}</span>
            </div>
            <p>{selected.description}</p>
          </div>

          <dl className="template-library__meta">
            <div>
              <dt>适用页面</dt>
              <dd>{selected.pageLabel}</dd>
            </div>
            <div>
              <dt>模块数</dt>
              <dd>{selected.moduleCount} 个模块</dd>
            </div>
            <div>
              <dt>最近修改</dt>
              <dd>{selected.updatedAt}</dd>
              <dd>由 {selected.updatedBy} 修改</dd>
            </div>
          </dl>

          <div className="template-library__versions">
            <h3>版本历史</h3>
            {versionHistory.map((item) => (
              <div key={item.version} className="template-version">
                <strong>{item.version}</strong>
                <span>{item.time}</span>
                <span>{item.author}</span>
              </div>
            ))}
          </div>

          <Button
            type="primary"
            block
            size="large"
            onClick={enterEditor}
            className="template-library__enter"
          >
            {selected.status === "ready" ? "进入编辑" : "即将开放"}
            {selected.status === "ready" && <ArrowRightOutlined />}
          </Button>
        </aside>
      </div>
    </section>
  );
}
