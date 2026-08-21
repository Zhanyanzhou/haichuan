import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { productPlaceholder } from '@/utils/placeholder';
import { usePageMetaStore } from '@/store/pageMetaStore';

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
  { q: '可以自带黄金或宝石进行定制吗？', a: '欢迎就自有材料定制与我们沟通。顾问会结合您的材料情况与定制需求给出建议，具体可行性与流程在咨询阶段确认。' },
  { q: '旧款珠宝可以翻新改造吗？', a: '我们提供旧款改造类咨询。是否适合改造、可采用的方案，需在了解旧件实际状况后由顾问与您共同确认。' },
  { q: '定制周期一般需要多长时间？', a: '定制周期视设计复杂度、材料与工艺而定。具体时间安排会在方案沟通阶段明确告知。' },
  { q: '定制费用如何计算？', a: '费用与设计、材料、工艺相关。我们会在充分了解需求后提供清晰的方案说明，由您确认后再推进。' },
  { q: '设计方案可以调整吗？', a: '在设计沟通阶段，我们与您反复对齐方向。具体调整安排以沟通确认的方案为准。' },
  { q: '交付后尺寸不合适怎么办？', a: '交付相关事宜会在方案阶段与您明确约定。如有调整需求，可通过咨询联系顾问协助处理。' },
  { q: '异地客户如何沟通定制？', a: '我们支持线上沟通，也可到店进一步交流；具体方式可在咨询阶段选择最适合您的安排。' },
  { q: '定制作品的保养与售后如何安排？', a: '售后与保养安排会在交付时与您说明。如需了解详情，欢迎通过咨询与顾问沟通。' },
];

/* ═══════ 工艺数据 ═══════ */
const craftItems = [
  { id: 9909, title: '贵金属' },
  { id: 9910, title: '天然宝石' },
  { id: 9911, title: '手工雕刻' },
  { id: 9912, title: '精密镶嵌' },
  { id: 9913, title: '表面处理' },
  { id: 9914, title: '质检品控' },
];

/* ═══════ 定制案例 ═══════ */
/*
 * 真实客户案例与图片需取得书面授权后方可展示。
 * 在运营提供获授权的真实案例前，本页不展示任何案例与客户故事，
 * 也不以虚构内容占位；访客可经底部"预约私人顾问"入口发起咨询。
 */

/* ═══════ 流程步骤数据 ═══════ */
  const processSteps = [
  {
    num: '01',
    title: '灵感沟通',
    desc: '说明佩戴场景、偏好与已有材料，顾问将与您共同梳理需求和可继续确认的方向。',
    imgId: 9905,
    imgAlt: '灵感沟通 — 一对一顾问咨询场景',
  },
  {
    num: '02',
    title: '设计提案',
    desc: '根据沟通结果形成方案与材质建议；具体设计范围、调整方式和费用在推进前确认。',
    imgId: 9906,
    imgAlt: '设计提案 — 设计方向与材质建议',
  },
  {
    num: '03',
    title: '工艺制作',
    desc: '方案确认后进入制作与质量检查；实际采用的工艺、进度和变更方式以确认内容为准。',
    imgId: 9907,
    imgAlt: '工艺制作 — 工坊制作过程',
  },
  {
    num: '04',
    title: '作品交付',
    desc: '完成后确认作品、相关资料、交付方式与后续可提供的服务说明。',
    imgId: 9908,
    imgAlt: '作品交付 — 作品资料与交付确认',
  },
];

/* ═══════ 组件 ═══════ */

export default function Custom() {
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  useEffect(() => {
    setPageMeta({
      title: '珠宝定制 | 海川珠宝',
      description: '海川珠宝高级定制服务：设计灵感、材质、宝石与工艺的一对一沟通。',
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (i: number) => setOpenFaq(openFaq === i ? null : i);

  return (
    <main style={{ background: BG, fontFamily: FONT_SANS }}>

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
          initial="hidden"
          whileInView="visible"
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
              initial="hidden"
              whileInView="visible"
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
          3. 四步定制流程（交错图文）
          ═══════════════════════════════════════════ */}
      <section id="process" style={{
        background: '#DDE1E2',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <motion.div
            initial="hidden"
            whileInView="visible"
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

          {processSteps.map((step, i) => {
            const isEven = i % 2 === 0;
            return (
              <motion.div
                key={step.num}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-80px' }}
                variants={fadeIn}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'clamp(32px, 6vw, 80px)',
                  marginBottom: i < processSteps.length - 1 ? 'clamp(48px, 6vw, 80px)' : 0,
                  /* 桌面端文字在左、图片在右；偶数步图片在左、文字在右 */
                  flexDirection: 'row',
                }}
                className="custom-process-row"
              >
                {/* 图片区 */}
                <div style={{
                  flex: '0 0 clamp(280px, 42%, 440px)',
                  order: isEven ? 1 : 0,
                }}>
                  {/* TODO: 替换为真实流程摄影作品，建议 4:3 比例 */}
                  <img
                    src={productPlaceholder(step.imgId, '流程')}
                    alt={step.imgAlt}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>

                {/* 文字区 */}
                <div style={{
                  flex: 1,
                  order: isEven ? 0 : 1,
                }}>
                  <span style={{
                    fontFamily: FONT_SANS,
                    fontSize: 'clamp(48px, 6vw, 72px)',
                    fontWeight: 300,
                    color: ACCENT,
                    lineHeight: 1,
                    opacity: 0.3,
                    display: 'block',
                    marginBottom: 8,
                  }}>
                    {step.num}
                  </span>
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
              </motion.div>
            );
          })}
        </div>
      </section>


      {/* ═══════════════════════════════════════════
          4. 材质与工艺
          ═══════════════════════════════════════════ */}
      <section style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <motion.div
          initial="hidden"
          whileInView="visible"
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
            材质甄选，工艺传承
          </h2>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'clamp(12px, 2vw, 24px)',
        }}>
          {craftItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } } }}
              style={{
                position: 'relative',
                aspectRatio: '4 / 5',
                overflow: 'hidden',
                background: '#DDE1E2',
              }}
            >
              {/* TODO: 替换为真实材质与工艺摄影，建议 4:5 竖版 */}
              <img
                src={productPlaceholder(item.id, '工艺')}
                alt={`海川珠宝工艺 — ${item.title}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {/* 实色标题带，避免图片亮部影响可读性。 */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '14px 20px',
                background: 'rgba(24,26,27,0.78)',
              }}>
                <h4 style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 18,
                  fontWeight: 400,
                  color: '#F4F5F5',
                  margin: 0,
                }}>
                  {item.title}
                </h4>
              </div>
            </motion.div>
          ))}
        </div>
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
          initial="hidden"
          whileInView="visible"
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
          7. 预约区域（底部CTA）
          ═══════════════════════════════════════════ */}
      <section style={{
        background: DARK,
        padding: 'clamp(64px, 10vw, 100px) 24px',
        textAlign: 'center',
      }}>
        <motion.div
          initial="hidden"
          whileInView="visible"
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
            开始您的专属珠宝创作
          </h2>
          <p style={{
            fontSize: 'clamp(13px, 1vw, 15px)',
            color: 'rgba(247,248,248,0.62)',
            lineHeight: 1.8,
            margin: '0 0 40px',
          }}>
            预约私人顾问，开启一对一定制之旅。<br />提交后由顾问与您联系，具体响应方式在沟通中确认。
          </p>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'center',
          }}>
            <Link to="/contact" style={{
              display: 'inline-block',
              padding: '14px 40px',
              background: '#F4F5F5',
              color: DARK,
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              fontFamily: FONT_SANS,
              fontWeight: 500,
              transition: 'background 0.4s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FFFFFF')}
              onMouseLeave={e => (e.currentTarget.style.background = '#F4F5F5')}
            >
              预约私人顾问
            </Link>
            <Link to="/contact" style={{
              display: 'inline-block',
              padding: '14px 40px',
              background: 'transparent',
              color: 'rgba(247,248,248,0.78)',
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              fontFamily: FONT_SANS,
              fontWeight: 400,
              border: '1px solid rgba(247,248,248,0.32)',
              transition: 'border-color 0.4s, color 0.4s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(247,248,248,0.32)'; e.currentTarget.style.color = 'rgba(247,248,248,0.78)'; }}
            >
              联系客服
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ═══════ 响应式：流程模块手机端单列 ═══════ */}
      <style>{`
        @media (max-width: 767px) {
          .custom-process-row {
            flex-direction: column !important;
          }
          .custom-process-row > div:first-child {
            order: -1 !important;
          }
        }
      `}</style>
    </main>
  );
}
