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

const CONSULTATION_SUBJECTS = [
  {
    title: "珠宝甄选",
    body: "说明佩戴场景与偏好，顾问据此了解您想看的作品。具体建议以实际沟通为准。",
    type: "product",
    action: "咨询选款",
  },
  {
    title: "材质与品质",
    body: "可询问贵金属、宝石与证书。本页不替代实物鉴定，具体说明以沟通为准。",
    type: "product",
    action: "咨询材质",
  },
  {
    title: "专属定制",
    body: "可提交设计、材质、宝石与尺寸意向。是否可制作，以实际评估为准。",
    type: "custom",
    action: "咨询定制",
  },
  {
    title: "订单与配送",
    body: "订单进度可在我的账户查看。配送问题也可写在下方咨询中，以对应订单为准。",
    type: "order",
    action: "咨询订单",
  },
  {
    title: "保养与维修",
    body: "可说明保养或维修需求。是否承接、费用与时间，以实际评估为准。",
    type: "care",
    action: "咨询保养",
  },
  {
    title: "一对一沟通",
    body: "微信和电话可直接联系。不方便时，留下需求并选择方便的回复方式。",
    type: "",
    action: "填写咨询",
  },
] as const;
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
    setPageMeta({ title: "联系海川 | 海川珠宝", description: "添加顾问微信或致电联系海川，也可提交选款、定制、订单与售后咨询。" });
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
  const consultationHref = (type: string) => {
    const next = new URLSearchParams(params);
    next.delete("view");
    if (type) next.set("type", type);
    const search = next.toString();
    return { pathname: "/contact", search: search ? `?${search}` : "", hash: "consultation" };
  };
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
        {decorated ? null : <header className="contact-masthead">
          <h2 className="contact-masthead__title">客户服务</h2>
          <p className="contact-masthead__lede">选款、定制、到店与售后，都可以直接联系海川顾问。微信与电话无需填写表单；书面需求留在本页咨询中。具体安排以实际沟通为准。</p>
          <nav className="contact-masthead__paths" aria-label="本页联系路径">
            <a href="#wechat-consult">微信咨询</a>
            <a href="#phone-consult">电话咨询</a>
            <a href="#consultation">填写咨询</a>
          </nav>
        </header>}
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
        <section className="contact-services" aria-labelledby="contact-services-title">
          <h2 id="contact-services-title">咨询事项</h2>
          <p>选择一项后，对应的咨询类型会带到下方表单。是否能够安排，以实际沟通为准。</p>
          <ul className="contact-services__list">
            {CONSULTATION_SUBJECTS.map((subject) => (
              <li key={subject.title}>
                <h3>{subject.title}</h3>
                <p>{subject.body}</p>
                <Link
                  to={subject.type ? consultationHref(subject.type) : { hash: "consultation" }}
                  className="contact-direct__text-action"
                  onClick={preview ? (event) => event.preventDefault() : undefined}
                >
                  {subject.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {recovery ? <aside className="contact-direct__recovery">
          <p>您有一份尚未完成或待确认的咨询。</p>
          <a href="#consultation" className="contact-direct__text-action">继续填写下方咨询</a>
        </aside> : null}
      </div>
    </div>
  );
}
