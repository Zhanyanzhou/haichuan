import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePageMetaStore } from '@/store/pageMetaStore';
import { normalizePublicProductReference } from '@/utils/publicProductPath';

/* ═══════ 设计常量 ═══════ */
const DARK = '#181A1B';
const ACCENT = '#6E7477';
const BODY = '#181A1B';
const MUTED = '#6E7477';
const BG = '#F4F5F5';
const FONT_SERIF = '"Cormorant Garamond","Noto Serif SC",serif';
const FONT_SANS = 'Inter, system-ui, -apple-system, sans-serif';

/* ═══════ 淡入动效 ═══════ */
const fadeIn = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } },
};

function supportsScrollReveal() {
  if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
    return false;
  }
  try {
    const observer = new window.IntersectionObserver(() => undefined);
    observer.disconnect();
    return true;
  } catch {
    return false;
  }
}

/* ═══════ 极简线性 SVG 图标 ═══════ */

/** 专属设计 — 菱形宝石 + 笔尖 */
function IconDesign() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 4L44 24L24 44L4 24Z" stroke={ACCENT} strokeWidth="1.2" strokeOpacity="0.7" />
      <path d="M24 12L32 24L24 36L16 24Z" stroke={ACCENT} strokeWidth="0.8" strokeOpacity="0.4" />
      <circle cx="24" cy="24" r="2" fill={ACCENT} fillOpacity="0.5" />
    </svg>
  );
}

/** 珠宝改款 — 环形重构 */
function IconRemodel() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="18" stroke={ACCENT} strokeWidth="1.2" strokeOpacity="0.7" />
      <circle cx="24" cy="24" r="12" stroke={ACCENT} strokeWidth="0.8" strokeOpacity="0.4" />
      <path d="M24 6C28 10 32 16 32 24C32 32 28 38 24 42" stroke={ACCENT} strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="2" fill={ACCENT} fillOpacity="0.5" />
    </svg>
  );
}

/** 尺寸定制 — 精准环圈 */
function IconSizing() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="16" stroke={ACCENT} strokeWidth="1.2" strokeOpacity="0.7" />
      <line x1="24" y1="6" x2="24" y2="14" stroke={ACCENT} strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="24" y1="34" x2="24" y2="42" stroke={ACCENT} strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="6" y1="24" x2="14" y2="24" stroke={ACCENT} strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="34" y1="24" x2="42" y2="24" stroke={ACCENT} strokeWidth="0.8" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="3" fill={ACCENT} fillOpacity="0.4" />
    </svg>
  );
}

/* ═══════ FAQ 数据（中性说明，不含未经确认的价格、工期、物流、地域与售后承诺） ═══════ */
const faqItems = [
  {
    q: '可以自带材料进行定制吗？',
    a: '请在咨询中说明材料类型与现状，是否适合使用需在评估后确认。',
  },
  {
    q: '旧款珠宝可以改造吗？',
    a: '请提供作品现状与改造方向，是否适合翻新、调整或重新设计需在评估后确认。',
  },
  {
    q: '周期与费用如何确认？',
    a: '周期与费用受设计、材料与制作范围影响，均以沟通确认的方案为准。',
  },
  {
    q: '设计与交付后的调整如何确认？',
    a: '可在方案确认前提出调整需求；交付后的尺寸、保养或其他需求，以作品结构与实际评估为准。',
  },
];

/* ═══════ 工艺数据 ═══════ */
const craftItems = [
  '材质需求',
  '宝石需求',
  '雕刻需求',
  '镶嵌需求',
  '表面效果',
  '交付确认',
];

/* ═══════ 定制案例 ═══════ */
/*
 * 真实客户案例与图片需取得书面授权后方可展示。
 * 在运营提供获授权的真实案例前，本页不展示任何案例与客户故事，
 * 也不以虚构内容占位；访客可经底部咨询入口提交需求。
 */

/* ═══════ 流程步骤数据 ═══════ */
const processSteps = [
  {
    num: '01',
    title: '灵感沟通',
    desc: '说明佩戴场景、偏好与已有材料，顾问将与您共同梳理需求和可继续确认的方向。',
  },
  {
    num: '02',
    title: '设计提案',
    desc: '根据沟通结果形成方案与材质建议；具体设计范围、调整方式和费用在推进前确认。',
  },
  {
    num: '03',
    title: '工艺制作',
    desc: '方案确认后进入制作与质量检查；实际采用的工艺、进度和变更方式以确认内容为准。',
  },
  {
    num: '04',
    title: '作品交付',
    desc: '完成后确认作品、相关资料、交付方式与后续可提供的服务说明。',
  },
];

/* ═══════ 组件 ═══════ */

export default function Custom() {
  const [searchParams] = useSearchParams();
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  const reduceMotion = useReducedMotion();
  const [observerAvailable] = useState(supportsScrollReveal);
  const scrollRevealEnabled = !reduceMotion && observerAvailable;
  const revealInitial = scrollRevealEnabled ? 'hidden' : 'visible';
  const revealWhileInView = scrollRevealEnabled ? 'visible' : undefined;
  const revealAnimate = scrollRevealEnabled ? undefined : 'visible';
  useEffect(() => {
    setPageMeta({
      title: '珠宝定制 | 海川珠宝',
      description: '珠宝定制需求说明与咨询入口，具体可提供内容与安排以实际沟通为准。',
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const productRef = normalizePublicProductReference(searchParams.get('productRef'));
  const contactParams = new URLSearchParams({ type: 'custom' });
  if (productRef) contactParams.set('productRef', productRef);
  const contactPath = `/contact?${contactParams.toString()}`;

  const toggleFaq = (i: number) => setOpenFaq(openFaq === i ? null : i);

  return (
    <div style={{ background: BG, fontFamily: FONT_SANS }}>

      <section style={{
        position: 'relative',
        minHeight: 'clamp(640px, 88svh, 900px)',
        overflow: 'hidden',
        background: DARK,
        display: 'flex',
        alignItems: 'flex-end',
      }}>
        <img
          src="/images/錾刻.png"
          alt="珠宝制作细节"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 58%' }}
        />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(17,19,21,.38)' }} />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 1280, margin: '0 auto', padding: 'clamp(120px,18vh,190px) clamp(24px,6vw,80px) clamp(72px,10vh,112px)' }}>
          <p style={{ margin: '0 0 20px', color: 'rgba(247,248,248,.66)', fontSize: 11, letterSpacing: '.22em' }}>BESPOKE SERVICE</p>
          <h1 style={{ margin: '0 0 22px', maxWidth: 620, color: '#F7F8F8', fontFamily: FONT_SERIF, fontWeight: 400, fontSize: 'clamp(44px,6vw,78px)', lineHeight: 1.14 }}>珠宝定制</h1>
          <p style={{ margin: '0 0 34px', maxWidth: 520, color: 'rgba(247,248,248,.76)', fontSize: 'clamp(14px,1.2vw,17px)', lineHeight: 1.9 }}>从一次沟通开始，逐步确认设计、材质、制作与交付安排。</p>
          <a href="#custom-services" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: '#F7F8F8', textDecoration: 'none', borderBottom: '1px solid rgba(247,248,248,.52)', fontSize: 13, letterSpacing: '.08em' }}>了解定制服务</a>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          1. 定制服务价值（三列）
          ═══════════════════════════════════════════ */}
      <section id="custom-services" style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <motion.div
          className="custom-scroll-reveal"
          initial={revealInitial}
          whileInView={revealWhileInView}
          animate={revealAnimate}
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeIn}
        >
          <p style={{
            fontSize: 11,
            letterSpacing: '0.22em',
            color: ACCENT,
            textTransform: 'uppercase',
            textAlign: 'center',
            marginBottom: 12,
          }}>
            SERVICES
          </p>
          <h2 style={{
            fontFamily: FONT_SERIF,
            fontSize: 'clamp(28px, 3.2vw, 40px)',
            fontWeight: 400,
            color: BODY,
            textAlign: 'center',
            margin: '0 0 56px',
          }}>
            专属您的定制服务
          </h2>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'clamp(32px, 4vw, 56px)',
        }}>
          {[
            { icon: <IconDesign />, title: '专属设计', desc: '说明佩戴场景、审美偏好与重要信息，在沟通后确认可以继续推进的设计范围。' },
            { icon: <IconRemodel />, title: '珠宝改款', desc: '针对已有珠宝的状态、结构与材料进行评估，再确认是否适合翻新、改造或重新设计。' },
            { icon: <IconSizing />, title: '尺寸调整', desc: '围绕圈口、链长与佩戴舒适度提出需求，具体可调整范围以作品结构评估为准。' },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              className="custom-scroll-reveal"
              initial={revealInitial}
              whileInView={revealWhileInView}
              animate={revealAnimate}
              viewport={{ once: true, margin: '-60px' }}
              variants={{ hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.15 } } }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: '28px 0 0',
                borderTop: '1px solid rgba(24,26,27,0.18)',
                background: 'transparent',
              }}
            >
              <div style={{ marginBottom: 24 }}>{item.icon}</div>
              <h3 style={{
                fontFamily: FONT_SERIF,
                fontSize: 22,
                fontWeight: 400,
                color: BODY,
                margin: '0 0 12px',
              }}>
                {item.title}
              </h3>
              <p style={{
                fontSize: 14,
                lineHeight: 1.85,
                color: MUTED,
                maxWidth: 280,
                margin: 0,
              }}>
                {item.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>


      {/* ═══════════════════════════════════════════
          3. 四步定制流程
          ═══════════════════════════════════════════ */}
      <section id="process" style={{
        background: '#DDE1E2',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <motion.div
            className="custom-scroll-reveal"
            initial={revealInitial}
            whileInView={revealWhileInView}
            animate={revealAnimate}
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeIn}
            style={{ textAlign: 'center', marginBottom: 64 }}
          >
            <p style={{ fontSize: 11, letterSpacing: '0.22em', color: ACCENT, textTransform: 'uppercase', marginBottom: 12 }}>
              OUR PROCESS
            </p>
            <h2 style={{
              fontFamily: FONT_SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              fontWeight: 400,
              color: BODY,
              margin: 0,
            }}>
              从灵感到交付
            </h2>
          </motion.div>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {processSteps.map((step, i) => (
              <motion.li
                key={step.num}
                initial={revealInitial}
                whileInView={revealWhileInView}
                animate={revealAnimate}
                viewport={{ once: true, margin: '-80px' }}
                variants={fadeIn}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'clamp(80px, 8vw, 96px) minmax(0, 1fr)',
                  gap: 'clamp(24px, 4vw, 48px)',
                  padding: 'clamp(28px, 4vw, 44px) 0',
                  borderTop: '1px solid rgba(24,26,27,0.18)',
                }}
                className="custom-process-row custom-scroll-reveal"
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 'clamp(36px, 5vw, 56px)',
                    fontWeight: 300,
                    color: ACCENT,
                    lineHeight: 1,
                    opacity: 0.45,
                    display: 'block',
                  }}
                >
                  {step.num}
                </span>
                <div>
                  <h3 style={{
                    fontFamily: FONT_SERIF,
                    fontSize: 'clamp(22px, 2.4vw, 30px)',
                    fontWeight: 400,
                    color: BODY,
                    margin: '0 0 16px',
                  }}>
                    {step.title}
                  </h3>
                  <p style={{
                    fontSize: 'clamp(13px, 1vw, 15px)',
                    lineHeight: 1.9,
                    color: MUTED,
                    maxWidth: 420,
                    margin: 0,
                  }}>
                    {step.desc}
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>


      {/* ═══════════════════════════════════════════
          4. 材质与制作细节
          ═══════════════════════════════════════════ */}
      <section style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <motion.div
          className="custom-scroll-reveal"
          initial={revealInitial}
          whileInView={revealWhileInView}
          animate={revealAnimate}
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeIn}
          style={{ textAlign: 'center', marginBottom: 56 }}
        >
          <p style={{ fontSize: 11, letterSpacing: '0.22em', color: ACCENT, textTransform: 'uppercase', marginBottom: 12 }}>
            MATERIALS & CRAFT
          </p>
          <h2 style={{
            fontFamily: FONT_SERIF,
            fontSize: 'clamp(28px, 3.2vw, 40px)',
            fontWeight: 400,
            color: BODY,
            margin: 0,
          }}>
            材质与制作细节
          </h2>
        </motion.div>

        <ul
          className="custom-craft-grid"
          style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          columnGap: 'clamp(24px, 4vw, 48px)',
          rowGap: 'clamp(24px, 4vw, 40px)',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}>
          {craftItems.map((title, i) => (
            <motion.li
              key={title}
              className="custom-scroll-reveal"
              initial={revealInitial}
              whileInView={revealWhileInView}
              animate={revealAnimate}
              viewport={{ once: true, margin: '-40px' }}
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } } }}
              style={{
                borderTop: '1px solid rgba(24,26,27,0.18)',
                paddingTop: 20,
              }}
            >
                <h3 style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 20,
                  fontWeight: 400,
                  color: BODY,
                  margin: 0,
                }}>
                  {title}
                </h3>
            </motion.li>
          ))}
        </ul>
      </section>


      {/* ═══════════════════════════════════════════
          6. 常见问题（折叠面板）
          ═══════════════════════════════════════════ */}
      <section style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <motion.div
          className="custom-scroll-reveal"
          initial={revealInitial}
          whileInView={revealWhileInView}
          animate={revealAnimate}
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeIn}
          style={{ textAlign: 'center', marginBottom: 48 }}
        >
          <p style={{ fontSize: 11, letterSpacing: '0.22em', color: ACCENT, textTransform: 'uppercase', marginBottom: 12 }}>
            FAQ
          </p>
          <h2 style={{
            fontFamily: FONT_SERIF,
            fontSize: 'clamp(28px, 3.2vw, 40px)',
            fontWeight: 400,
            color: BODY,
            margin: 0,
          }}>
            常见问题
          </h2>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {faqItems.map((item, i) => (
            <div
              key={i}
              style={{
                borderBottom: '1px solid rgba(24,26,27,0.12)',
              }}
            >
              <button
                onClick={() => toggleFaq(i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '20px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: FONT_SANS,
                  textAlign: 'left',
                }}
              >
                <span style={{
                  fontSize: 'clamp(13px, 1vw, 15px)',
                  fontWeight: 400,
                  color: openFaq === i ? ACCENT : BODY,
                  transition: 'color 0.3s',
                  paddingRight: 24,
                }}>
                  {item.q}
                </span>
                <span style={{
                  flexShrink: 0,
                  fontSize: 20,
                  color: openFaq === i ? ACCENT : 'rgba(24,26,27,0.45)',
                  transition: 'transform 0.35s, color 0.3s',
                  transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)',
                  lineHeight: 1,
                }}>
                  +
                </span>
              </button>
              <div style={{
                maxHeight: openFaq === i ? 300 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.45s ease, padding 0.45s ease',
                paddingBottom: openFaq === i ? 20 : 0,
              }}>
                <p style={{
                  fontSize: 'clamp(12px, 0.9vw, 14px)',
                  lineHeight: 1.85,
                  color: MUTED,
                  margin: 0,
                  paddingRight: 40,
                }}>
                  {item.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* ═══════════════════════════════════════════
          7. 咨询区域（底部CTA）
          ═══════════════════════════════════════════ */}
      <section style={{
        background: DARK,
        padding: 'clamp(64px, 10vw, 100px) 24px',
        textAlign: 'center',
      }}>
        <motion.div
          className="custom-scroll-reveal"
          initial={revealInitial}
          whileInView={revealWhileInView}
          animate={revealAnimate}
          viewport={{ once: true, margin: '-60px' }}
          variants={fadeIn}
          style={{ maxWidth: 600, margin: '0 auto' }}
        >
          <h2 style={{
            fontFamily: FONT_SERIF,
            fontSize: 'clamp(28px, 3.6vw, 42px)',
            fontWeight: 400,
            color: '#F4F5F5',
            lineHeight: 1.3,
            margin: '0 0 16px',
          }}>
            提交定制需求
          </h2>
          <p style={{
            fontSize: 'clamp(13px, 1vw, 15px)',
            color: 'rgba(247,248,248,0.62)',
            lineHeight: 1.8,
            margin: '0 0 40px',
          }}>
            说明您的设计、改款或尺寸需求；具体可提供内容与安排以实际沟通为准。
          </p>

          <Link
            to={contactPath}
            className="custom-final-cta"
            style={{
              display: 'inline-flex',
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 40px',
              background: '#F4F5F5',
              color: DARK,
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              fontFamily: FONT_SANS,
              fontWeight: 500,
              transition: 'background 0.4s',
              boxSizing: 'border-box',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FFFFFF')}
              onMouseLeave={e => (e.currentTarget.style.background = '#F4F5F5')}
          >
            前往咨询
          </Link>
        </motion.div>
      </section>

      {/* ═══════ 响应式：流程与工艺手机端单列 ═══════ */}
      <style>{`
        @media (max-width: 767px) {
          .custom-process-row {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .custom-craft-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 390px) {
          .custom-final-cta {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
