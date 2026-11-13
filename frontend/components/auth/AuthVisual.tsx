export default function AuthVisual() {
  return (
    <div
      className="relative mt-7 hidden h-[205px] w-full max-w-[540px] xl:block"
      aria-hidden="true"
    >
      <svg viewBox="0 0 540 240" className="h-full w-full" fill="none">
        <g stroke="var(--border)" strokeWidth="1">
          <path d="M62 170c56-63 93-67 151-10s97 57 157 0 91-61 131-30" strokeOpacity="0.45" />
          <path d="M57 117c53 46 98 52 153 8s103-56 162-11 96 52 137 20" strokeOpacity="0.35" />
          <ellipse cx="292" cy="128" rx="204" ry="76" strokeOpacity="0.5" strokeDasharray="2 8" />
        </g>

        <g fill="var(--muted)" fillOpacity="0.62">
          <circle cx="98" cy="151" r="2.5" />
          <circle cx="210" cy="160" r="2" />
          <circle cx="375" cy="154" r="2.5" />
          <circle cx="462" cy="126" r="2" />
        </g>

        <g>
          <rect
            x="188"
            y="43"
            width="190"
            height="142"
            rx="17"
            transform="rotate(-7 188 43)"
            fill="var(--sidebar)"
            stroke="var(--border)"
            strokeOpacity="0.8"
          />
          <rect
            x="205"
            y="36"
            width="190"
            height="142"
            rx="17"
            transform="rotate(3 205 36)"
            fill="var(--surface)"
            stroke="var(--border-strong)"
            strokeOpacity="0.9"
          />
          <path d="M233 77h71M233 91h132M233 105h112" stroke="var(--foreground)" strokeOpacity="0.68" strokeWidth="4" strokeLinecap="round" />
          <path d="M233 126h93M233 139h119" stroke="var(--muted-strong)" strokeOpacity="0.48" strokeWidth="3" strokeLinecap="round" />
          <rect x="234" y="53" width="23" height="15" rx="5" fill="var(--border-strong)" fillOpacity="0.7" />
          <circle cx="360" cy="151" r="18" fill="var(--surface)" stroke="var(--border-strong)" strokeOpacity="0.8" />
          <path d="m352 151 5 5 10-11" stroke="var(--foreground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>

      </svg>
    </div>
  );
}
