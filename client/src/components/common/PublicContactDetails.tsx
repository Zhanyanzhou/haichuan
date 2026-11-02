import { useEffect, useId, useState } from "react";
import type { PublicSiteSettingsResource } from "@/hooks/usePublicSiteSettings";
import { preferSiteSetting, SIGNED_PUBLIC_CONTACT } from "@/config/publicContact";
import RouteLoading from "./RouteLoading";

type PublicContactDetailsProps = {
  resource: PublicSiteSettingsResource;
  preview?: boolean;
  presentation?: "details" | "direct";
};

/** 联系与预约页面统一展示公开渠道、读取状态和微信复制反馈。 */
export default function PublicContactDetails({ resource, preview = false, presentation = "details" }: PublicContactDetailsProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const channelId = useId();
  const [qrReady, setQrReady] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const setting = (key: string) => {
    const value = resource.settings?.[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const phone = preferSiteSetting(setting("contactPhone"), SIGNED_PUBLIC_CONTACT.phone);
  const wechat = setting("contactWechat");
  const hours = preferSiteSetting(setting("businessHours"), SIGNED_PUBLIC_CONTACT.hours);
  const dialNumber = /^\+?[\d\s()-]+$/.test(phone) && /\d/.test(phone) ? phone.replace(/[^\d+]/g, "") : "";
  const email = preferSiteSetting(setting("contactEmail"), SIGNED_PUBLIC_CONTACT.email);
  const qrReference = setting("contactWechatQrCode");
  const qrCode = /^(?:\/uploads\/page-assets\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif)|\/api\/upload\/public-media\/[1-9]\d*)$/i.test(qrReference) ? qrReference : "";
  const address = preferSiteSetting(setting("contactAddress"), SIGNED_PUBLIC_CONTACT.address);
  const channels: Array<{ label: string; value: string; href?: string; wechat?: boolean }> = [
    { label: "服务热线", value: phone, href: dialNumber ? `tel:${dialNumber}` : undefined },
    { label: "公司微信", value: wechat, wechat: true },
    { label: "电子邮箱", value: email, href: email ? `mailto:${email}` : undefined },
    { label: "接待地址", value: address },
    { label: "服务时间", value: hours },
    { label: "服务范围", value: SIGNED_PUBLIC_CONTACT.serviceArea },
  ].filter((channel) => channel.value);

  useEffect(() => { setCopyStatus(""); }, [wechat, resource.status]);
  useEffect(() => { setQrReady(false); setQrFailed(false); }, [qrCode, resource.status]);

  const copyWechat = async (ownerDocument: Document) => {
    if (preview) {
      setCopyStatus("预览中不执行复制");
      return;
    }
    try {
      const clipboard = ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error("clipboard unavailable");
      await clipboard.writeText(wechat);
      setCopyStatus("微信号已复制，请在微信中搜索添加");
    } catch {
      setCopyStatus("复制未成功，请选中微信号手动复制");
    }
  };

  if (presentation === "direct") return (
    <div className="contact-methods">
      {resource.status === "loading" ? <RouteLoading scope="inline" surface="public" label="正在加载联系方式…" /> : null}
      {resource.status === "error" ? <section className="contact-direct__unavailable" aria-label="联系方式加载状态">
        <h2>联系方式暂时无法加载</h2>
        <p role="alert">请稍后重试，恢复后即可查看微信与电话。</p>
        <p>您仍可在下方留下咨询需求。</p>
        {resource.retry ? <button type="button" className="contact-direct__primary-action" onClick={resource.retry}>重新加载</button> : null}
      </section> : null}
      {resource.status === "loaded" ? <>
        <div className="contact-methods__grid">
          <section className="contact-methods__channel" aria-labelledby={`${channelId}-wechat`}>
            <h2 id={`${channelId}-wechat`}>微信咨询</h2>
            <p>添加商家微信，交流选款与定制需求。</p>
            <div className={`contact-methods__qr${qrCode ? "" : " contact-methods__qr--empty"}`} aria-busy={Boolean(qrCode) && !qrReady && !qrFailed}>
              {qrCode && !qrFailed ? <img src={qrCode} alt="公司微信加好友二维码" width="240" height="240" decoding="async"
                className={qrReady ? "is-ready" : "is-loading"} onLoad={() => setQrReady(true)} onError={() => setQrFailed(true)} /> : null}
              {qrCode && !qrReady && !qrFailed ? <p role="status">正在加载二维码…</p> : null}
              {qrFailed ? <p role="status">二维码暂时无法显示{wechat ? "，可复制微信号添加。" : "，请稍后重试。"}</p> : null}
              {!qrCode ? <p>{wechat ? "可复制下方微信号，在微信中搜索添加。" : "微信联系方式尚未提供。"}</p> : null}
            </div>
            {wechat ? <p className="contact-methods__account"><span>微信号</span><span>{wechat}</span></p> : null}
            <div className="contact-methods__actions">
              {wechat ? <button type="button" className="contact-direct__primary-action" onClick={(event) => { void copyWechat(event.currentTarget.ownerDocument); }}>复制微信号</button> : null}
              {qrCode && qrReady && !qrFailed ? <a className="contact-direct__text-action" href={qrCode} download onClick={preview ? (event) => event.preventDefault() : undefined}>保存二维码</a> : null}
            </div>
            {wechat || qrCode ? <p className="contact-methods__hint">电脑端可使用微信扫一扫；手机端可保存二维码，或复制微信号在微信中添加。</p> : null}
            {copyStatus ? <p className="contact-methods__feedback" role="status">{copyStatus}</p> : null}
          </section>
          <section className="contact-methods__channel" aria-labelledby={`${channelId}-phone`}>
            <h2 id={`${channelId}-phone`}>电话联系</h2>
            <p>直接沟通作品、到店与服务安排。</p>
            {phone ? <p className="contact-methods__phone">{phone}</p> : <p className="contact-methods__phone-empty">联系电话尚未提供。</p>}
            {dialNumber ? <a href={`tel:${dialNumber}`} className="contact-direct__primary-action" onClick={preview ? (event) => event.preventDefault() : undefined}>拨打电话</a> : null}
            {hours ? <div className="contact-methods__hours"><h3>服务时间</h3><p>{hours}</p></div> : null}
            {address ? <div className="contact-methods__address"><h3>接待地址</h3><p>{address}</p></div> : null}
            {email ? <div className="contact-methods__address"><h3>邮箱</h3><p><a className="contact-direct__text-action" href={`mailto:${email}`} onClick={preview ? (event) => event.preventDefault() : undefined}>{email}</a></p></div> : null}
          </section>
        </div>
      </> : null}
    </div>
  );

  return (
    <div className="public-contact-details">
      {resource.status === "loading" ? <RouteLoading scope="inline" surface="public" label="正在加载联系方式…" /> : null}
      {resource.status === "error" ? <p role="alert" className="public-contact-details__notice">
        联系信息暂时无法加载，您仍可通过本页表单提交需求。
      </p> : null}
      {resource.status === "loaded" ? <>
        <dl className="public-contact-details__channels">
          {channels.map((channel) => <div key={channel.label}>
            <dt>{channel.label}</dt>
            <dd className={channel.wechat ? "public-contact-details__wechat" : undefined}>
              {channel.href ? <a href={channel.href} onClick={preview ? (event) => event.preventDefault() : undefined}>{channel.value}</a> : <span>{channel.value}</span>}
              {channel.wechat ? <button type="button" onClick={(event) => { void copyWechat(event.currentTarget.ownerDocument); }}>复制微信号</button> : null}
            </dd>
          </div>)}
        </dl>
        <p className="public-contact-details__notice">{SIGNED_PUBLIC_CONTACT.holidayNotice}</p>
        {channels.length === 0 ? <p className="public-contact-details__notice">公开联系方式正在完善，您仍可通过本页表单提交需求。</p> : null}
      </> : null}
      {copyStatus ? <p className="public-contact-details__notice" role="status">{copyStatus}</p> : null}
    </div>
  );
}
