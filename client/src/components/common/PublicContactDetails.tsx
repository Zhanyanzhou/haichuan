import { useEffect, useId, useRef, useState } from "react";
import type { PublicSiteSettingsResource } from "@/hooks/usePublicSiteSettings";
import { isDialablePhone, preferSiteSetting, resolvePublicPhone, resolvePublicWechat, SIGNED_PUBLIC_CONTACT } from "@/config/publicContact";

type PublicContactDetailsProps = {
  resource: PublicSiteSettingsResource;
  preview?: boolean;
  presentation?: "details" | "direct";
};

/** 联系页统一展示公开渠道、读取状态和微信复制反馈。 */
export default function PublicContactDetails({ resource, preview = false, presentation = "details" }: PublicContactDetailsProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const channelId = useId();
  const [qrReady, setQrReady] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const qrImageRef = useRef<HTMLImageElement>(null);
  const setting = (key: string) => {
    const value = resource.settings?.[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const storedPhone = setting("contactPhone");
  const phone = resolvePublicPhone(storedPhone);
  const wechat = resolvePublicWechat(setting("contactWechat"), storedPhone);
  const hours = preferSiteSetting(setting("businessHours"), SIGNED_PUBLIC_CONTACT.hours);
  const dialNumber = isDialablePhone(phone) ? phone.replace(/[^\d+]/g, "") : "";
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
  const loadingNotice = resource.status === "loading"
    ? <p className="public-contact-details__notice" role="status">正在加载联系方式…</p>
    : null;

  useEffect(() => { setCopyStatus(""); }, [wechat, resource.status]);
  useEffect(() => { setQrReady(false); setQrFailed(false); }, [qrCode, resource.status]);
  useEffect(() => {
    const image = qrImageRef.current;
    if (image?.complete && image.naturalWidth > 0) setQrReady(true);
  }, [qrCode, resource.status]);

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
      {loadingNotice}
      {resource.status === "error" ? <section className="contact-direct__unavailable" aria-label="联系方式加载状态">
        <h2>联系方式暂时无法加载</h2>
        <p role="alert">请稍后重试，恢复后即可查看微信与电话。</p>
        <p>您仍可在下方留下咨询需求。</p>
        {resource.retry ? <button type="button" className="contact-direct__primary-action" onClick={resource.retry}>重新加载</button> : null}
      </section> : null}
      {resource.status === "loaded" ? <>
        <div className="contact-methods__grid">
          <section id="wechat-consult" className="contact-methods__channel contact-methods__channel--wechat" aria-labelledby={`${channelId}-wechat`}>
            <div className="contact-wechat">
              <div>
                <h2 id={`${channelId}-wechat`}>微信咨询</h2>
                <p>欢迎添加海川珠宝顾问微信，沟通选款、定制与售后。回复以实际沟通为准。</p>
                <p className="contact-wechat__hint">用另一台设备扫描二维码即可添加。若正在用手机浏览，请复制微信号，或保存二维码后在微信中识别。</p>
                {wechat ? <p className="contact-methods__identity"><span className="contact-methods__label">微信号</span><span className="contact-methods__value">{wechat}</span></p> : null}
                <div className="contact-methods__actions">
                  {wechat ? <button type="button" className="contact-direct__primary-action" onClick={(event) => { void copyWechat(event.currentTarget.ownerDocument); }}>复制微信号</button> : null}
                  {qrCode && qrReady && !qrFailed ? <a className="contact-direct__text-action" href={qrCode} download onClick={preview ? (event) => event.preventDefault() : undefined}>保存二维码</a> : null}
                </div>
                {copyStatus ? <p className="contact-methods__feedback" role="status">{copyStatus}</p> : null}
              </div>
              <div className={`contact-methods__qr${qrCode && !qrFailed ? "" : " contact-methods__qr--empty"}`} aria-busy={Boolean(qrCode) && !qrReady && !qrFailed}>
                {qrCode && !qrFailed ? <img ref={qrImageRef} src={qrCode} alt="公司微信加好友二维码" width="240" height="240" decoding="async"
                  className={qrReady ? "is-ready" : "is-loading"} onLoad={() => setQrReady(true)} onError={() => setQrFailed(true)} /> : null}
                {qrCode && !qrReady && !qrFailed ? <p role="status">正在加载二维码…</p> : null}
                {qrFailed ? <p role="status">二维码暂时无法显示{wechat ? "，可复制微信号添加。" : "，请稍后重试。"}</p> : null}
                {!qrCode ? <p>{wechat ? "二维码尚未配置。请复制微信号，在微信中搜索添加。" : "微信联系方式尚未提供。"}</p> : null}
              </div>
            </div>
          </section>
          <div className="contact-methods__aside">
            <section id="phone-consult" className="contact-methods__channel" aria-labelledby={`${channelId}-phone`}>
              <h2 id={`${channelId}-phone`}>电话咨询</h2>
              <p>可直接沟通作品、到店与服务安排。</p>
              <dl className="contact-facts">
                <div>
                  <dt>电话</dt>
                  <dd>
                    {phone ? <span>{phone}</span> : <span>联系电话尚未提供。</span>}
                    {dialNumber ? <a href={`tel:${dialNumber}`} className="contact-direct__text-action" onClick={preview ? (event) => event.preventDefault() : undefined}>拨打电话</a> : null}
                  </dd>
                </div>
                {hours ? <div><dt>服务时间</dt><dd>{hours}</dd></div> : null}
                {address ? <div><dt>接待地址</dt><dd>{address}</dd></div> : null}
                <div><dt>服务范围</dt><dd>{SIGNED_PUBLIC_CONTACT.serviceArea}</dd></div>
              </dl>
              <p className="contact-methods__note">{SIGNED_PUBLIC_CONTACT.holidayNotice}</p>
            </section>
          </div>
        </div>
        {email ? <section className="contact-methods__letter" aria-labelledby={`${channelId}-email`}>
          <h2 id={`${channelId}-email`}>邮件咨询</h2>
          <p>适合留下需要书面回复的问题。</p>
          <p className="contact-methods__identity"><span className="contact-methods__label">邮箱</span><span className="contact-methods__value">{email}</span></p>
          <a className="contact-direct__text-action" href={`mailto:${email}`} onClick={preview ? (event) => event.preventDefault() : undefined}>发送邮件</a>
        </section> : null}
      </> : null}
    </div>
  );

  return (
    <div className="public-contact-details">
      {loadingNotice}
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
