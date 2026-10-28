import { Link } from "react-router-dom";
import {
  CONTENT_TEMPLATE_PAGE_KEYS,
  CONTENT_TEMPLATE_PAGE_PATHS,
} from "@/page-builder/generated/contentTemplates.generated";

/** 国内公网上线完成备案后填写；空值时不渲染占位信息。 */
const FOOTER_ICP_NUMBER = "";

type StorefrontFooterProps = {
  siteName: string;
  showService?: boolean;
  preview?: boolean;
  onPreviewNavigate?: (path: string) => void;
};

const FOOTER_PAGE_LABELS = {
  products: "珠宝作品",
  catalog: "选款中心",
  custom: "定制服务",
  about: "品牌故事",
} as const;

const footerLinks = [
  ...CONTENT_TEMPLATE_PAGE_KEYS.flatMap((key) => {
    if (!(key in FOOTER_PAGE_LABELS)) return [];
    return [{
      label: FOOTER_PAGE_LABELS[key as keyof typeof FOOTER_PAGE_LABELS],
      path: CONTENT_TEMPLATE_PAGE_PATHS[key],
    }];
  }),
  { label: "隐私说明", path: "/privacy" },
  { label: "经营主体信息", path: "/business-info" },
];

/** 公开网站与装修画布共用的唯一页脚。 */
export default function StorefrontFooter({
  siteName,
  showService = true,
  preview = false,
  onPreviewNavigate,
}: StorefrontFooterProps) {
  const previewLinkProps = (path: string) =>
    preview
      ? {
          onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            onPreviewNavigate?.(path);
          },
          title: "画布预览，点击不离开编辑器",
        }
      : undefined;

  return (
    <footer className="site-footer" aria-label={preview ? "页脚预览" : undefined}>
      <div className="site-footer__inner">
        {showService ? (
          <div className="site-footer__service">
            <p className="site-footer__service-label">私人预约</p>
            <Link
              to="/contact"
              className="site-footer__service-link"
              {...previewLinkProps("/contact")}
            >
              <span>预约私人珠宝顾问</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : null}

        <nav className="site-footer__links" aria-label="页脚导航">
          {footerLinks.map((item) => (
            <Link key={item.path} to={item.path} {...previewLinkProps(item.path)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-footer__signature">
          <span className="site-footer__brandmark">{siteName}</span>
          <span aria-hidden="true" className="site-footer__signature-divider" />
          <span>© {new Date().getFullYear()} {siteName}</span>
        </div>

        {!preview && FOOTER_ICP_NUMBER ? (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer__filing"
          >
            {FOOTER_ICP_NUMBER}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
