import { Link } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { productPlaceholder } from '@/utils/placeholder';

/* ═══════ 设计常量 ═══════ */
const DARK = '#1a1a1a';
const GOLD = '#B8944E';
const GOLD_LIGHT = 'rgba(184,148,78,0.15)';
const BODY = '#2C2C2C';
const MUTED = '#8A7F72';
const BG = '#FAF9F6';
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
      <path d="M24 4L44 24L24 44L4 24Z" stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.7" />
      <path d="M24 12L32 24L24 36L16 24Z" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.4" />
      <circle cx="24" cy="24" r="2" fill={GOLD} fillOpacity="0.5" />
    </svg>
  );
}

/** 珠宝改款 — 环形重构 */
function IconRemodel() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="18" stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.7" />
      <circle cx="24" cy="24" r="12" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.4" />
      <path d="M24 6C28 10 32 16 32 24C32 32 28 38 24 42" stroke={GOLD} strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="2" fill={GOLD} fillOpacity="0.5" />
    </svg>
  );
}

/** 尺寸定制 — 精准环圈 */
function IconSizing() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="16" stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.7" />
      <line x1="24" y1="6" x2="24" y2="14" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="24" y1="34" x2="24" y2="42" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="6" y1="24" x2="14" y2="24" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="34" y1="24" x2="42" y2="24" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="3" fill={GOLD} fillOpacity="0.4" />
    </svg>
  );
}

/* ═══════ FAQ 数据 ═══════ */
const faqItems = [
  { q: '可以自带黄金或宝石进行定制吗？', a: '当然。我们支持您提供自有贵金属或宝石进行定制，我们的鉴定师会先对您的材料进行专业检测，确认品质后进入设计流程。材料检测费用为 ¥200/次。' },
  { q: '旧款珠宝可以翻新改造吗？', a: '可以。我们提供旧款翻新、改款、改圈口等服务。工艺师会对旧件进行评估，根据材质状况、结构复杂度给出改造方案和报价。改制过程中会尽量保留原有材质的价值。' },
  { q: '定制周期需要多长时间？', a: '常规定制周期为 15-30 个工作日，具体视设计复杂度与工艺难度而定。加急服务可在 7-10 个工作日内完成，需额外收取加急费（总价的 20%）。' },
  { q: '定制预算有最低门槛吗？', a: '我们专注高端定制，建议预算起点为 ¥5,000。最终费用由设计费、材料费、工费三部分组成，设计费 ¥500-2,000/件，工费根据工艺复杂度核算。我们会在设计提案阶段提供清晰报价。' },
  { q: '设计方案不满意可以修改吗？', a: '设计提案阶段我们提供 3 次免费修改。超出部分按 ¥300/次收取设计调整费。我们鼓励在设计初期充分沟通，确保方向一致。' },
  { q: '定制完成后尺寸不合适怎么处理？', a: '交付后 30 天内提供一次免费尺寸调整。超出期限或需要大幅结构调整的，按实际工费收取。我们建议在定制过程中提供精准尺寸数据，减少后期调整。' },
  { q: '不在深圳，如何完成定制？', a: '我们支持全国顺丰保价邮寄。设计沟通通过视频会议进行，实物样品可邮寄确认。整个流程均可远程完成，无需到店。到店体验更佳。' },
  { q: '定制珠宝的售后保养如何？', a: '所有定制作品享受终身免费清洗保养服务（每年一次），非人为损坏提供 2 年免费维修。邮寄保养来回运费由我们承担。' },
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

/* ═══════ 案例数据（数据接口预留） ═══════ */
/*
 * TODO: 接入后端 API — GET /api/custom-cases
 * 返回结构: { id, title, description, inspiration, story, images: string[] }[]
 * 当前使用静态占位数据。
 */
const caseItems = [
  {
    id: 9915,
    title: '海洋系列·珍珠项链',
    desc: '客户希望在婚礼上佩戴一件能够承载家族记忆的珍珠饰品。',
    inspiration: '灵感源自南海珍珠的天然光泽与流动的水纹形态，将不规则的巴洛克珍珠以海浪曲线串联。',
    story: '这件作品历时 45 天完成，客户母亲婚礼上的珍珠项链被拆解融入设计，成为跨越两代人的信物。',
  },
  {
    id: 9916,
    title: '东方雅韵·翡翠戒指',
    desc: '客户收藏了一枚祖传翡翠蛋面多年，希望将其设计成一枚日常可佩戴的戒指。',
    inspiration: '以中国传统窗棂纹样为骨架，用 18K 金勾勒简洁的几何轮廓，让翡翠成为视觉重心。',
    story: '戒指内侧镌刻了客户祖母的名字缩写，将家族记忆以最私密的方式融入作品。',
  },
  {
    id: 9917,
    title: '星辰·钻石耳钉',
    desc: '一对年轻的建筑师夫妇希望定制一对属于彼此的建筑感耳钉。',
    inspiration: '以包豪斯建筑的几何构成和光影关系为蓝本，用铂金线条构建空间层次，钻石点缀其间。',
    story: '耳钉的不对称设计刻意呼应了两人不同的性格——她理性精准的直线，他感性流动的弧线。',
  },
];

/* ═══════ 流程步骤数据 ═══════ */
const processSteps = [
  {
    num: '01',
    title: '灵感沟通',
    desc: '与您的专属顾问进行一对一深度交流。我们倾听您的故事、喜好、佩戴场景与预算范围，共同梳理创作方向。您可携带参考图、旧物或任何灵感碎片前来。',
    imgId: 9905,
    imgAlt: '灵感沟通 — 一对一顾问咨询场景',
  },
  {
    num: '02',
    title: '设计提案',
    desc: '设计师在 5-7 个工作日内为您呈现手绘草图与 3D 效果图。包含材质搭配建议、工艺可实现性分析及初步报价。此阶段支持 3 次免费修改，直至方案完善。',
    imgId: 9906,
    imgAlt: '设计提案 — 手绘草图与效果图',
  },
  {
    num: '03',
    title: '工艺制作',
    desc: '方案确认后进入工坊制作。从蜡模雕刻、贵金属铸造到宝石镶嵌、表面打磨抛光，每一步均由拥有 15 年以上经验的工匠手工完成。您可预约到工坊实地探访。',
    imgId: 9907,
    imgAlt: '工艺制作 — 工匠手工打造',
  },
  {
    num: '04',
    title: '作品交付',
    desc: '完成后进行 16 道质检工序，以专属珠宝盒精心包装。我们为您准备作品档案（含设计手稿、材质证书、保养指南），可选择到店取件或顺丰保价配送。',
    imgId: 9908,
    imgAlt: '作品交付 — 精致珠宝盒包装',
  },
];

/* ═══════ 组件 ═══════ */

export default function Custom() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (i: number) => setOpenFaq(openFaq === i ? null : i);

  return (
    <main style={{ background: BG, fontFamily: FONT_SANS }}>

      {/* ═══════════════════════════════════════════
          1. 定制服务价值（三列）
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
        >
          <p style={{
            fontSize: 11,
            letterSpacing: '0.22em',
            color: GOLD,
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
            { icon: <IconDesign />, title: '专属设计', desc: '从零到一，为您量身打造独一无二的珠宝作品。无论是婚嫁套装、纪念礼物还是个人收藏，设计师将您的故事转化为可佩戴的艺术。' },
            { icon: <IconRemodel />, title: '珠宝改款', desc: '让旧款珠宝焕发新生。我们提供款式翻新、结构改造、材质升级服务。保留经典元素的同时，融入当代审美与您的个人风格。' },
            { icon: <IconSizing />, title: '尺寸定制', desc: '精准测量，完美贴合。提供圈口调整、链长定制、佩戴舒适度优化。每一毫米都经过反复确认，确保作品与您的身体和谐共生。' },
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
                alignItems: 'center',
                textAlign: 'center',
                padding: '40px 24px',
                border: '1px solid rgba(138,127,114,0.12)',
                background: 'rgba(255,255,255,0.3)',
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
        background: '#F3F0EA',
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
            <p style={{ fontSize: 11, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 12 }}>
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
                    color: GOLD,
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
          <p style={{ fontSize: 11, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 12 }}>
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
                background: '#E8E3D9',
              }}
            >
              {/* TODO: 替换为真实材质与工艺摄影，建议 4:5 竖版 */}
              <img
                src={productPlaceholder(item.id, '工艺')}
                alt={`海川珠宝工艺 — ${item.title}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {/* 底部渐变遮罩 + 标题 */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '32px 20px 20px',
                background: 'linear-gradient(to top, rgba(26,26,26,0.7) 0%, transparent 100%)',
              }}>
                <h4 style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 18,
                  fontWeight: 400,
                  color: '#F3F0EA',
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
          5. 定制案例（数据接口预留）
          ═══════════════════════════════════════════ */}
      <section style={{
        background: '#F3F0EA',
        padding: 'clamp(60px, 8vw, 100px) 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeIn}
            style={{ textAlign: 'center', marginBottom: 56 }}
          >
            <p style={{ fontSize: 11, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 12 }}>
              CASE STUDIES
            </p>
            <h2 style={{
              fontFamily: FONT_SERIF,
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              fontWeight: 400,
              color: BODY,
              margin: 0,
            }}>
              定制案例
            </h2>
          </motion.div>

          {caseItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={fadeIn}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                gap: 'clamp(24px, 5vw, 64px)',
                marginBottom: i < caseItems.length - 1 ? 'clamp(48px, 6vw, 80px)' : 0,
                paddingBottom: i < caseItems.length - 1 ? 'clamp(48px, 6vw, 80px)' : 0,
                borderBottom: i < caseItems.length - 1 ? '1px solid rgba(138,127,114,0.12)' : 'none',
              }}
            >
              {/* 图片 */}
              <div style={{
                flex: '0 0 clamp(220px, 32%, 340px)',
                aspectRatio: '3 / 4',
                background: '#E8E3D9',
              }}>
                {/* TODO: 替换为真实案例摄影作品，建议 3:4 竖版 */}
                <img
                  src={productPlaceholder(item.id, '案例')}
                  alt={`定制案例 — ${item.title}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>

              {/* 文字 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 'clamp(20px, 2vw, 26px)',
                  fontWeight: 400,
                  color: BODY,
                  margin: '0 0 16px',
                }}>
                  {item.title}
                </h3>
                <p style={{
                  fontSize: 'clamp(12px, 0.95vw, 14px)',
                  lineHeight: 1.8,
                  color: MUTED,
                  margin: '0 0 12px',
                  fontStyle: 'italic',
                }}>
                  「{item.desc}」
                </p>
                <p style={{
                  fontSize: 'clamp(12px, 0.95vw, 14px)',
                  lineHeight: 1.8,
                  color: '#555',
                  margin: '0 0 12px',
                }}>
                  <span style={{ color: GOLD, fontWeight: 500 }}>设计灵感</span>&emsp;{item.inspiration}
                </p>
                <p style={{
                  fontSize: 'clamp(12px, 0.95vw, 14px)',
                  lineHeight: 1.8,
                  color: '#555',
                  margin: 0,
                }}>
                  <span style={{ color: GOLD, fontWeight: 500 }}>定制故事</span>&emsp;{item.story}
                </p>
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
          <p style={{ fontSize: 11, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 12 }}>
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
                borderBottom: '1px solid rgba(138,127,114,0.15)',
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
                  color: openFaq === i ? GOLD : BODY,
                  transition: 'color 0.3s',
                  paddingRight: 24,
                }}>
                  {item.q}
                </span>
                <span style={{
                  flexShrink: 0,
                  fontSize: 20,
                  color: openFaq === i ? GOLD : 'rgba(138,127,114,0.5)',
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
            color: '#F3F0EA',
            lineHeight: 1.3,
            margin: '0 0 16px',
          }}>
            开始您的专属珠宝创作
          </h2>
          <p style={{
            fontSize: 'clamp(13px, 1vw, 15px)',
            color: 'rgba(243,240,234,0.55)',
            lineHeight: 1.8,
            margin: '0 0 40px',
          }}>
            预约私人顾问，开启一对一定制之旅。<br />我们将在 24 小时内与您联系。
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
              background: GOLD,
              color: '#fff',
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              fontFamily: FONT_SANS,
              fontWeight: 500,
              transition: 'background 0.4s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#A07D3A')}
              onMouseLeave={e => (e.currentTarget.style.background = GOLD)}
            >
              预约私人顾问
            </Link>
            <Link to="/contact" style={{
              display: 'inline-block',
              padding: '14px 40px',
              background: 'transparent',
              color: 'rgba(243,240,234,0.7)',
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              fontFamily: FONT_SANS,
              fontWeight: 400,
              border: '1px solid rgba(243,240,234,0.2)',
              transition: 'border-color 0.4s, color 0.4s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(243,240,234,0.2)'; e.currentTarget.style.color = 'rgba(243,240,234,0.7)'; }}
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
