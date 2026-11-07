import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PublicContactDetails from "@/components/common/PublicContactDetails";
import type { PublicSiteSettingsResource } from "@/hooks/usePublicSiteSettings";
import { usePageDecorationState } from "@/page-builder/runtime/PublishedPageDecoration";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { lookupPublicWork, type PublicWorkResolution } from "@/data/publicWorkLookup";
import { normalizePublicProductReference } from "@/utils/publicProductPath";
import { consultationDraftOwner, hasContactConsultationRecovery } from "@/utils/consultationJourneyState";
import { trackPageView } from "@/hooks/useAnalytics";
import { clampProductTitle } from "@/utils/productTitleLength";
import "./contact.css";

export default function ContactLanding({
  mode = "public",
  contact,
}: {
  mode?: "public" | "editor-preview";
  contact: PublicSiteSettingsResource;
}) {
  const preview = mode === "editor-preview";
  const resource = contact;
  const { active: decorated, ownsPrimaryHeading } = usePageDecorationState();
  const setPageMeta = usePageMetaStore((state) => state.setMeta);
  const clearPageMeta = usePageMetaStore((state) => state.clear);
  const customer = useCustomerAuthStore((state) => state.customer);
  const authStatus = useCustomerAuthStore((state) => state.status);
  const [params] = useSearchParams();
  const rawReference = preview ? null : params.get("productRef");
  const reference = normalizePublicProductReference(rawReference);
  const [work, setWork] = useState<PublicWorkResolution | null>(null);
  const [workRevision, setWorkRevision] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const recovery = !preview && authStatus !== "unknown"
    && hasContactConsultationRecovery(consultationDraftOwner(customer?.id), reference ?? "");

  useEffect(() => {
    if (preview) return;
    setPageMeta({ title: "联系海川 | 海川珠宝", description: "添加微信或致电联系海川，也可在本页提交选款、定制与到店咨询。" });
    trackPageView();
    return () => clearPageMeta();
  }, [preview, setPageMeta, clearPageMeta]);

  useEffect(() => {
    let active = true;
    setWork(null);
    setCopyStatus("");
    if (reference) void lookupPublicWork(reference).then((value) => { if (active) setWork(value); });
    return () => { active = false; };
  }, [reference, workRevision]);

  const product = work?.kind === "published" || work?.kind === "virtual" ? work.product : null;
  const copyProduct = async (ownerDocument: Document) => {
    if (!product) return;
    try {
      const clipboard = ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error("clipboard unavailable");
      await clipboard.writeText(`我想咨询${work?.kind === "virtual" ? "演示作品" : "作品"}：${clampProductTitle(product.name)}（${product.code || reference}）`);
      setCopyStatus("作品信息已复制，添加微信后可粘贴给商家");
    } catch {
      setCopyStatus("复制未成功，请选中下方作品名称与编号手动复制");
    }
  };

  return (
    <div className="contact-direct">
      {!preview && !ownsPrimaryHeading ? <h1 className="sr-only">联系海川</h1> : null}
      <div className={`contact-direct__content${decorated ? " contact-direct__content--decorated" : ""}`}>
        {rawReference ? <section className="contact-direct__context" aria-label="咨询作品">
          <h2>关于这件作品</h2>
          {!reference ? <p role="alert">作品引用无效，请从作品详情重新进入。</p> : null}
          {reference && !work ? <p role="status">正在读取作品信息…</p> : null}
          {product ? <>
            <p className="contact-direct__work" title={product.name}>{clampProductTitle(product.name)}<span>作品编号：{product.code || reference}</span></p>
            {work?.kind === "virtual" ? <p>这是演示作品，仅供说明款式偏好。</p> : null}
            <button type="button" className="contact-direct__text-action" onClick={(event) => { void copyProduct(event.currentTarget.ownerDocument); }}>复制作品信息</button>
          </> : null}
          {work?.kind === "error" ? <><p role="alert">作品信息暂时无法加载。</p><button type="button" className="contact-direct__text-action" onClick={() => setWorkRevision((value) => value + 1)}>重新读取作品</button></> : null}
          {work?.kind === "missing" ? <p role="alert">这件作品当前不可用，您可以先浏览其他作品。</p> : null}
          {(!reference || work?.kind === "missing") ? <Link to="/catalog" className="contact-direct__text-action">返回选款中心</Link> : null}
          {copyStatus ? <p role="status">{copyStatus}</p> : null}
        </section> : null}
        <PublicContactDetails resource={resource} presentation="direct" preview={preview} />
        {recovery ? <aside className="contact-direct__recovery">
          <p>您有一份尚未完成或待确认的咨询。</p>
          <a href="#consultation" className="contact-direct__text-action">继续填写下方咨询</a>
        </aside> : null}
      </div>
    </div>
  );
}
