import { DragOutlined, SearchOutlined } from "@ant-design/icons";
import { Input } from "antd";

export default function TemplateCatalogControls({
  keyword,
  onKeywordChange,
  placeholder,
  searchAriaLabel,
  tip,
  countLabel,
  countTitle,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  placeholder: string;
  searchAriaLabel: string;
  tip: string;
  countLabel?: string;
  countTitle?: string;
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
