export default function AuthVisual() {
  return (
    <div
      className="relative mt-7 hidden h-[205px] w-full max-w-[540px] xl:block"
      aria-hidden="true"
    >
      <svg viewBox="0 0 540 240" className="h-full w-full" fill="none">
        <defs>
          <linearGradient id="auth-card-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b7aaff" stopOpacity="0.62" />
            <stop offset="0.52" stopColor="#8879f2" stopOpacity="0.2" />
            <stop offset="1" stopColor="#7fc2ed" stopOpacity="0.42" />
          </linearGradient>
          <linearGradient id="auth-card-fill" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#24233a" stopOpacity="0.96" />
            <stop offset="1" stopColor="#10121c" stopOpacity="0.96" />
          </linearGradient>
          <radialGradient id="auth-card-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#9688ff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#7569ee" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="292" cy="130" rx="218" ry="104" fill="url(#auth-card-glow)" />

        <g stroke="url(#auth-card-edge)" strokeWidth="1">
          <path d="M62 170c56-63 93-67 151-10s97 57 157 0 91-61 131-30" strokeOpacity="0.2" />
          <path d="M57 117c53 46 98 52 153 8s103-56 162-11 96 52 137 20" strokeOpacity="0.17" />
          <ellipse cx="292" cy="128" rx="204" ry="76" strokeOpacity="0.16" strokeDasharray="2 8" />
        </g>

        <g fill="#b5aaff" fillOpacity="0.78">
          <circle cx="98" cy="151" r="2.5" />
          <circle cx="210" cy="160" r="2" />
          <circle cx="375" cy="154" r="2.5" />
          <circle cx="462" cy="126" r="2" />
        </g>

        <g className="auth-orbit">
          <rect
            x="188"
            y="43"
            width="190"
            height="142"
            rx="17"
            transform="rotate(-7 188 43)"
            fill="#11131d"
            stroke="url(#auth-card-edge)"
            strokeOpacity="0.42"
          />
          <rect
            x="205"
            y="36"
            width="190"
            height="142"
            rx="17"
            transform="rotate(3 205 36)"
            fill="url(#auth-card-fill)"
            stroke="url(#auth-card-edge)"
            strokeOpacity="0.7"
          />
          <path d="M233 77h71M233 91h132M233 105h112" stroke="#bcb6db" strokeOpacity="0.68" strokeWidth="4" strokeLinecap="round" />
          <path d="M233 126h93M233 139h119" stroke="#77758d" strokeOpacity="0.48" strokeWidth="3" strokeLinecap="round" />
          <rect x="234" y="53" width="23" height="15" rx="5" fill="#8c7bef" fillOpacity="0.35" />
          <circle cx="360" cy="151" r="18" fill="#171729" stroke="#afa2ff" strokeOpacity="0.48" />
          <path d="m352 151 5 5 10-11" stroke="#c3baff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <circle cx="292" cy="128" r="4" fill="#d5ccff" className="auth-pulse" />
      </svg>

      <div className="auth-float absolute bottom-2 left-5 h-2 w-2 rounded-full bg-[#b3a5ff] shadow-[0_0_18px_rgba(179,165,255,0.75)]" />
    </div>
  );
}
