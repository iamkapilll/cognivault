export default function AuthVisual() {
  return (
    <div
      className="relative mt-6 hidden h-[172px] w-full max-w-[460px] xl:block"
      aria-hidden="true"
    >
      <svg viewBox="0 0 460 220" className="h-full w-full" fill="none">
        <defs>
          <linearGradient id="auth-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#818cf8" stopOpacity="0.6" />
            <stop offset="0.5" stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="auth-core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#a5b4fc" stopOpacity="0.55" />
            <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="230" cy="110" r="120" fill="url(#auth-core)" opacity="0.5" />

        <g stroke="url(#auth-edge)" strokeWidth="1">
          <circle cx="230" cy="110" r="66" strokeOpacity="0.55" />
          <circle cx="230" cy="110" r="104" strokeOpacity="0.3" strokeDasharray="2 7" />
          <ellipse
            cx="230"
            cy="110"
            rx="152"
            ry="54"
            strokeOpacity="0.22"
            transform="rotate(-14 230 110)"
          />
          <ellipse
            cx="230"
            cy="110"
            rx="152"
            ry="54"
            strokeOpacity="0.16"
            transform="rotate(38 230 110)"
          />
        </g>

        <g className="auth-orbit">
          <path
            d="M230 44 296 74M296 74 312 128M312 128 246 168M246 168 168 150M168 150 150 92M150 92 230 44"
            stroke="url(#auth-edge)"
            strokeWidth="1"
            strokeOpacity="0.5"
          />
          <path
            d="M230 44 150 92M296 74 230 44M312 128 296 74M246 168 312 128M168 150 246 168M150 92 168 150"
            stroke="url(#auth-edge)"
            strokeWidth="0.8"
            strokeOpacity="0.28"
          />
        </g>

        <g fill="#0b0e17" stroke="#818cf8" strokeOpacity="0.75">
          <circle cx="230" cy="44" r="4.5" />
          <circle cx="296" cy="74" r="3.5" />
          <circle cx="312" cy="128" r="4" />
          <circle cx="246" cy="168" r="3.5" />
          <circle cx="168" cy="150" r="3.5" />
          <circle cx="150" cy="92" r="4" />
        </g>

        <circle
          cx="230"
          cy="110"
          r="9"
          fill="#111528"
          stroke="#a5b4fc"
          strokeOpacity="0.9"
        />
        <circle cx="230" cy="110" r="3.5" fill="#c7d2fe" className="auth-pulse" />
        <circle cx="230" cy="110" r="18" stroke="#818cf8" strokeOpacity="0.25" />
      </svg>

      <div className="auth-float absolute bottom-1 right-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0b0e17]/80 px-3 py-2 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.9)] backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
        <span className="text-[11px] font-medium tracking-wide text-[#9aa3b8]">
          Context linked
        </span>
      </div>
    </div>
  );
}
