import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LEGAL_ENTITY } from "@/config/legalEntity";
import { usePageMetaStore } from "@/store/pageMetaStore";

const DISCLOSURE_ITEMS = [
  { label: "企业名称", value: LEGAL_ENTITY.name },
  {
    label: "统一社会信用代码",
    value: LEGAL_ENTITY.unifiedSocialCreditCode,
  },
  {
    label: "法定代表人",
    value: LEGAL_ENTITY.legalRepresentative,
  },
  { label: "企业类型", value: LEGAL_ENTITY.enterpriseType },
  { label: "注册资本", value: LEGAL_ENTITY.registeredCapital },
  { label: "成立日期", value: LEGAL_ENTITY.establishedOn },
  { label: "登记状态", value: LEGAL_ENTITY.registrationStatus },
  {
    label: "登记机关",
    value: LEGAL_ENTITY.registrationAuthority,
  },
  { label: "注册地址", value: LEGAL_ENTITY.registeredAddress },
] as const;

export default function BusinessInfo() {
  const setPageMeta = usePageMetaStore((state) => state.setMeta);
  const clearPageMeta = usePageMetaStore((state) => state.clear);

  useEffect(() => {
    setPageMeta({
      title: "经营主体信息 | 海川珠宝",
      description: `海川珠宝网站运营主体${LEGAL_ENTITY.name}的公开登记信息。`,
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);

  return (
    <article className="bg-brand-surface text-brand-text">
      <section className="border-b border-brand-line">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-12 px-5 py-12 md:px-8 md:py-14 lg:grid-cols-12 lg:gap-x-10 lg:px-12 lg:py-16">
          <header className="lg:col-span-4">
            <p className="font-sans text-[10px] uppercase tracking-[0.24em] text-brand-muted">
              Legal disclosure
            </p>
            <h1 className="mt-5 font-body text-[38px] font-normal leading-[1.16] tracking-[0.04em] text-brand-text md:text-[44px]">
              经营主体信息
            </h1>
            <p className="mt-5 max-w-[360px] font-sans text-sm leading-7 text-brand-muted">
              本页如实披露海川珠宝网站运营主体的法定登记资料，供您识别与核验。
            </p>

            <div className="mt-10 border-t border-brand-text pt-5">
              <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-brand-muted">
                Current status
              </p>
              <p className="mt-3 font-body text-[24px] font-normal text-brand-text">
                {LEGAL_ENTITY.registrationStatus}
              </p>
              <p className="mt-4 font-sans text-[11px] leading-6 text-brand-muted">
                资料核对
                <span className="ml-3 text-brand-text">
                  {LEGAL_ENTITY.verifiedOn}
                </span>
              </p>
            </div>
          </header>

          <section
            aria-labelledby="registration-details"
            className="lg:col-span-7 lg:col-start-6"
          >
            <div className="border-b border-brand-text pb-5">
              <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-brand-muted">
                Registered entity
              </p>
              <h2
                id="registration-details"
                className="mt-3 font-body text-[26px] font-normal tracking-[0.04em] text-brand-text"
              >
                工商登记
              </h2>
            </div>

            <dl>
              {DISCLOSURE_ITEMS.map(({ label, value }) => (
                <div
                  key={label}
                  className="grid grid-cols-1 gap-2 border-b border-brand-line py-3.5 sm:grid-cols-[148px_minmax(0,1fr)] sm:items-baseline sm:gap-8"
                >
                  <dt className="font-sans text-[11px] leading-5 tracking-[0.04em] text-brand-muted">
                    {label}
                  </dt>
                  <dd
                    className={`m-0 break-words font-sans text-[15px] font-normal leading-6 text-brand-text ${
                      label === "统一社会信用代码"
                        ? "font-medium tabular-nums tracking-[0.06em]"
                        : ""
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </section>

      <section
        aria-labelledby="verification-heading"
        className="bg-[var(--hc-inverse)] text-[var(--hc-inverse-text)]"
      >
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-5 py-10 md:px-8 md:py-12 lg:grid-cols-12 lg:items-center lg:gap-x-10 lg:px-12">
          <div className="lg:col-span-3">
            <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-white/50">
              Verification
            </p>
            <h2
              id="verification-heading"
              className="mt-3 font-body text-[24px] font-normal tracking-[0.04em] text-[var(--hc-inverse-text)]"
            >
              信息核验
            </h2>
          </div>

          <p className="max-w-[560px] font-sans text-sm leading-7 text-white/65 lg:col-span-5">
            工商登记发生变更后，本页将依据最新营业执照同步更新。您也可以使用企业名称或统一社会信用代码，在国家企业信用信息公示系统查询。
          </p>

          <div className="flex flex-col items-start gap-2 lg:col-span-3 lg:col-start-10 lg:items-end">
            <a
              href={LEGAL_ENTITY.officialRegistryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center border-b border-white/40 font-sans text-sm text-[var(--hc-inverse-text)] transition-colors hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              国家企业信用信息公示系统
              <span aria-hidden="true" className="ml-3">
                ↗
              </span>
            </a>
            <Link
              to="/contact"
              className="inline-flex min-h-11 items-center font-sans text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              联系海川珠宝
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
