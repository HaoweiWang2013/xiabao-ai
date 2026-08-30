/**
 * LiquidGlassDefs · 液态玻璃折射滤镜（全局挂载一次）
 *
 * Apple Liquid Glass 的核心是折射（Lensing）：玻璃边缘动态弯折光线，
 * 而非传统 glassmorphism 的均匀散射。Web 上唯一的实现方式是把 SVG
 * 位移滤镜（feTurbulence + feDisplacementMap）嵌入 backdrop-filter:
 *
 *   backdrop-filter: blur(16px) saturate(180%) url(#lg-refract);
 *
 * feTurbulence 生成低频分形噪声 → feGaussianBlur 软化 → feDisplacementMap
 * 按噪声 R/G 通道偏移背景像素，产生「液态」有机折射。
 *
 * 兼容性：仅 Chromium 引擎（Electron/Chrome/Edge/Android WebView）真实渲染；
 * Safari / Firefox 静默忽略 url() 只剩 blur —— 由 useGlassQuality 的 auto 档
 * 提前判定降级，CSS 侧 data-glass-quality 控制是否引用本滤镜。
 *
 * 参数（对齐社区逆向 macOS 26 控制中心的实测值，见 docs/ui/liquid-glass-v2.md）：
 * - baseFrequency 0.008：低频噪声 = 大尺度柔和弯曲（高频会变成磨砂颗粒）
 * - numOctaves 2：两阶叠加，弯曲更自然
 * - displacement scale 26：像素级偏移幅度，超过 40 会出现明显撕裂
 * - x/y 外扩 20%：为位移留出采样余量，避免边缘像素被裁
 */
export function LiquidGlassDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
    >
      <defs>
        <filter
          id="lg-refract"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.008"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation={1.5} result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale={26}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
