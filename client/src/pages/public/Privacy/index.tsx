import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { LEGAL_ENTITY } from "@/config/legalEntity";

const T = {
  bg: "#FFFFFF",
  warmBg: "#F4F5F5",
  txt: "#181A1B",
  sec: "#5F6568",
  light: "#6E7477",
  line: "#DDE1E2",
  gold: "#181A1B",
};
const MW = 1120;
const PX = "clamp(24px,5vw,64px)";

// 隐私说明各章节：依据当前代码真实收集行为编写；运营主体统一读取法定信息配置。
const SECTIONS = [
  {
    title: "我们收集哪些信息",
    body: "我们只收集完成咨询、选款与会员服务所需的最少信息：",
    items: [
      "咨询与选款表单：姓名、手机号码、咨询类型、希望联系方式与时间、预算区间（选填）、电子邮箱（选填）以及您主动填写的需求描述。",
      "会员账户：注册或登录时提交的姓名、手机号码、电子邮箱与密码（密码以单向哈希存储，不以明文形式被任何人读取）。",
      "选款记录：您在选款中心加入的作品与提交时生成的作品名、规格与图片快照。",
      "收货地址：仅在您主动保存时收集，用于未来服务与寄送。",
      "技术日志：为保证站点稳定运行而记录的访问时间、页面路径与错误信息，不包含您的明文密码或支付凭证。",
    ],
  },
  {
    title: "我们如何使用这些信息",
    items: [
      "由珠宝顾问与您联系，提供选款建议、定制咨询与售后服务。",
      "在您登录后，跨设备同步您的选款记录与咨询记录。",
      "保障站点安全、排查故障与防止欺诈，不会在未授权情况下进行用户行为画像。",
    ],
  },
  {
    title: "行为分析",
    body: "为改进服务与了解访问情况，本站会采集匿名的浏览行为数据（如页面访问、点击等），并使用一个随机生成的匿名会话标识来区分访问次数。该标识不含、也无法单独识别您的个人身份；我们不会将其与您的姓名、手机号等个人信息关联用于定向营销。您可在浏览器无痕模式下访问，或清除浏览器数据后重置该标识。",
  },
  {
    title: "信息保存",
    items: [
      "待处理、已联系和跟进中的咨询与选款记录，在提供顾问服务所需期间保存。",
      "已完成的咨询与选款记录自完成之日起保存 12 个月；标记为无效的记录自标记之日起保存 30 天。到期后进入受控清理流程；法律法规要求继续保留的除外。",
      "会员账户信息在账户有效期间保存；账户删除后，我们会在合理期限内移除或匿名化您的可识别信息。",
      "技术日志仅用于安全与稳定性目的，保存期限不超过排查所需的合理周期。",
      "法律法规另有要求的，依照相应要求执行。",
    ],
  },
  {
    title: "你的权利",
    items: [
      "查询：您可以在登录后于个人中心查看您的账户资料、选款与咨询记录。",
      "更正：您可以在个人中心更正姓名、联系方式与地址等资料；如需修改其他信息，可通过咨询表单联系顾问协助。",
      "删除：您可以请求删除您的账户和相关咨询记录；法律法规要求保留的除外。",
      "撤回同意：您可以不再勾选服务隐私同意；这会影响顾问与您联系，但不影响您浏览公开作品。",
    ],
  },
  {
    title: "本地存储",
    body: "登录会话由浏览器以 HttpOnly Cookie 管理，页面脚本不能读取其中的会话凭证。浏览器本地存储仅用于保存尚未提交的选款清单和匿名统计会话标识，您可以在浏览器设置中随时清除这些本地数据。",
  },
  {
    title: "未成年人",
    body: "本站面向成年人提供珠宝顾问服务。如您是未成年人，请在监护人同意后使用，并避免在表单中提交非必要个人信息。",
  },
];

export default function Privacy() {
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  const [contact, setContact] = useState<{
    phone?: string;
    email?: string;
  }>({});

  // SEO：隐私页独立标题与描述
  useEffect(() => {
    setPageMeta({
      title: "隐私说明 | 海川珠宝",
      description:
        "海川珠宝隐私说明：收集的信息类型、用途、保存原则与您的查询、更正、删除权利。",
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getPublicSettings()
      .then((res) => {
        if (cancelled) return;
        const s = unwrapResponse<{
          contactPhone?: string | null;
          contactEmail?: string | null;
        }>(res);
        setContact({
          phone: s?.contactPhone?.trim() || "",
          email: s?.contactEmail?.trim() || "",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setContact({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasContact = contact.phone || contact.email;

  return (
    <div style={{ background: T.bg }}>
      {/* ═══ 标题区 ═══ */}
      <section
        style={{
          padding: "clamp(32px,5vh,56px) 0 clamp(20px,3vh,32px)",
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div style={{ maxWidth: MW, marginInline: "auto", paddingInline: PX }}>
          <p
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              color: T.light,
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            PRIVACY NOTICE
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,2.8vw,32px)",
              fontWeight: 400,
              color: T.txt,
              margin: "0 0 8px",
              letterSpacing: "0.04em",
            }}
          >
            隐私说明
          </h1>
          <p style={{ fontSize: 14, color: T.sec, margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
            本说明由{LEGAL_ENTITY.name}制定，用于说明我们在提供海川珠宝网站服务时收集的信息、使用方式与您的权利。
          </p>
        </div>
      </section>

      {/* ═══ 正文 ═══ */}
      <section style={{ paddingBlock: "clamp(28px,4vh,48px)" }}>
        <div style={{ maxWidth: 760, marginInline: "auto", paddingInline: PX }}>
          {SECTIONS.map((section, i) => (
            <div
              key={section.title}
              style={{
                paddingBottom: "clamp(24px,3vh,36px)",
                marginBottom: "clamp(24px,3vh,36px)",
                borderBottom:
                  i < SECTIONS.length - 1 ? `1px solid ${T.line}` : "none",
              }}
            >
              <h2
                style={{
                  fontSize: 17,
                  fontWeight: 400,
                  color: T.txt,
                  margin: "0 0 14px",
                  letterSpacing: "0.03em",
                }}
              >
                <span style={{ color: T.gold, marginRight: 10, fontWeight: 300 }}>
                  0{i + 1}
                </span>
                {section.title}
              </h2>
              {section.body && (
                <p
                  style={{
                    fontSize: 14,
                    color: T.sec,
                    lineHeight: 1.8,
                    margin: "0 0 12px",
                  }}
                >
                  {section.body}
                </p>
              )}
              {section.items && (
                <ul
                  style={{
                    margin: 0,
                    paddingInlineStart: 18,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  {section.items.map((item, j) => (
                    <li
                      key={j}
                      style={{ fontSize: 14, color: T.sec, lineHeight: 1.8 }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* 联系方式区块：来自 SiteSettings，空值引导至咨询表单 */}
          <div
            style={{
              background: T.warmBg,
              border: `1px solid ${T.line}`,
              padding: "clamp(20px,3vw,32px)",
            }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                color: T.light,
                margin: "0 0 10px",
              }}
            >
              联系我们
            </p>
            <p style={{ fontSize: 13, color: T.sec, lineHeight: 1.7, margin: "0 0 12px" }}>
              信息处理者：{LEGAL_ENTITY.name}
              <Link
                to="/business-info"
                style={{ color: T.gold, textDecoration: "underline", marginLeft: 8 }}
              >
                查看经营主体信息
              </Link>
            </p>
            {hasContact ? (
              <div style={{ display: "grid", gap: 6, fontSize: 14, color: T.txt }}>
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    style={{ color: T.txt, textDecoration: "none" }}
                  >
                    电话：{contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    style={{ color: T.txt, textDecoration: "none" }}
                  >
                    邮箱：{contact.email}
                  </a>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: T.sec, lineHeight: 1.7, margin: 0 }}>
                公开联系方式正在完善。
              </p>
            )}
            <p style={{ fontSize: 13, color: T.sec, lineHeight: 1.7, margin: "12px 0 0" }}>
              如需行使查询、更正、删除或撤回同意等权利，可
              <Link
                to="/contact?type=privacy"
                style={{ color: T.gold, textDecoration: "underline", marginInline: 2 }}
              >
                提交隐私与个人信息请求
              </Link>
              ，系统会生成服务记录，由专人跟进处理。
            </p>
          </div>

          <p
            style={{
              fontSize: 12,
              color: T.light,
              marginTop: 24,
              lineHeight: 1.7,
            }}
          >
            隐私说明版本：privacy-v2；最后更新于 2026-08-27。
          </p>
        </div>
      </section>
    </div>
  );
}
