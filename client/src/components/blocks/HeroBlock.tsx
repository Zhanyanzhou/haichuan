import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MutedOutlined, SoundOutlined } from '@ant-design/icons';

interface HeroBlockProps {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  linkText?: string;
  settings?: {
    brand?: string;
    mediaPosition?: string;
    contentAlign?: 'left' | 'center' | 'right';
    slideIndex?: number;
    slideTotal?: number;
  };
}

export default function HeroBlock({
  title,
  subtitle,
  imageUrl,
  videoUrl,
  linkUrl,
  linkText,
  settings,
}: HeroBlockProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  const showVideo = Boolean(videoUrl && !videoFailed);
  const position = settings?.mediaPosition || 'center center';
  const currentSlide = settings?.slideIndex ?? 8;
  const slideTotal = settings?.slideTotal ?? 8;
  const displayProgress = showVideo ? progress : 100;
  const formattedSlides = useMemo(
    () => `${String(currentSlide).padStart(2, '0')} / ${String(slideTotal).padStart(2, '0')}`,
    [currentSlide, slideTotal],
  );

  const skipHero = () => {
    const nextSection = sectionRef.current?.nextElementSibling as HTMLElement | null;
    nextSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleSound = () => {
    if (!showVideo || !videoRef.current) return;
    const nextMuted = !muted;
    videoRef.current.muted = nextMuted;
    setMuted(nextMuted);
  };

  return (
    <section
      ref={sectionRef}
      data-home-hero
      className="jewelry-hero"
      aria-label={title || '海川珠宝品牌影像'}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt="金色雕花手镯悬浮于东方山水意境之中"
          className="jewelry-hero__media"
          style={{ objectPosition: position }}
          fetchPriority="high"
        />
      )}

      {showVideo && (
        <video
          ref={videoRef}
          className={`jewelry-hero__media jewelry-hero__video ${videoReady ? 'is-ready' : ''}`}
          style={{ objectPosition: position }}
          src={videoUrl}
          poster={imageUrl}
          autoPlay
          muted={muted}
          loop
          playsInline
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
          onTimeUpdate={(event) => {
            const media = event.currentTarget;
            setProgress(media.duration ? (media.currentTime / media.duration) * 100 : 0);
          }}
        />
      )}

      <div className="jewelry-hero__veil" aria-hidden="true" />

      <div className="jewelry-hero__content">
        <h1>{title || '一器一境，自有光华'}</h1>
        <p>{subtitle || '当代珠宝与东方工艺'}</p>
        <Link className="jewelry-hero__cta" to={linkUrl || '/catalog'}>
          {linkText || '开启鉴赏'}
        </Link>
      </div>

      <div className="jewelry-hero__skip">
        <button type="button" onClick={skipHero}>
          跳过影像 <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="jewelry-hero__timeline" aria-label={showVideo ? '首屏影像播放进度' : '首屏海报'}>
        <button
          type="button"
          className="jewelry-hero__sound"
          onClick={toggleSound}
          aria-label={showVideo ? (muted ? '开启声音' : '关闭声音') : '当前为静态海报'}
          aria-disabled={!showVideo}
        >
          {muted || !showVideo ? <MutedOutlined /> : <SoundOutlined />}
        </button>
        <span className="jewelry-hero__track" aria-hidden="true">
          <span style={{ width: `${displayProgress}%` }} />
        </span>
        <span className="jewelry-hero__count">{formattedSlides}</span>
   style={{ background: showImage || showVideo ? 'rgba(255,255,255,0.5)' : '#B8944E' }} />
          </span>
        </div>
      </div>
    </section>
  );
}
