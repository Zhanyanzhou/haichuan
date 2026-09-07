import { AppstoreOutlined, DragOutlined, MenuOutlined, SearchOutlined } from "@ant-design/icons";
import { Input } from "antd";

export type TemplateCatalogViewMode = "single" | "double";

export default function TemplateCatalogControls({
  keyword,
  onKeywordChange,
  placeholder,
  searchAriaLabel,
  viewMode,
  onViewModeChange,
  tip,
  countLabel,
  countTitle,
  singleViewToggle = false,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  placeholder: string;
  searchAriaLabel: string;
  viewMode: TemplateCatalogViewMode;
  onViewModeChange: (mode: TemplateCatalogViewMode) => void;
  tip: string;
  countLabel?: string;
  countTitle?: string;
  singleViewToggle?: boolean;
}) {
  return (
    <>
      <div className="homepage-editor__library-search-row">
        <Input
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder={placeholder}
          prefix={<SearchOutlined />}
          aria-label={searchAriaLabel}
        />
        <div
          className="homepage-editor__view-toggle"
          role="group"
          aria-label="模板目录视图模式"
        >
          {singleViewToggle ? (
            <button
              type="button"
              onClick={() => onViewModeChange(viewMode === "single" ? "double" : "single")}
              title={viewMode === "single" ? "切换为双列查看" : "切换为单列查看"}
              aria-label={viewMode === "single" ? "切换为双列查看" : "切换为单列查看"}
            >
              {viewMode === "single" ? <MenuOutlined /> : <AppstoreOutlined />}
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={viewMode === "single"}
                className={viewMode === "single" ? "is-active" : ""}
                onClick={() => onViewModeChange("single")}
                title="单列查看"
                aria-label="单列查看"
              >
                <MenuOutlined />
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "double"}
                className={viewMode === "double" ? "is-active" : ""}
                onClick={() => onViewModeChange("double")}
                title="双列查看"
                aria-label="双列查看"
              >
                <AppstoreOutlined />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="homepage-editor__library-drag-tip">
        <DragOutlined /> {tip}
        {countLabel ? (
          <span className="homepage-editor__library-count" title={countTitle}>
            {countLabel}
          </span>
        ) : null}
      </div>
    </>
  );
}
