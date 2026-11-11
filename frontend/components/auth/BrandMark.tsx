type BrandMarkProps = {
  size?: number;
  className?: string;
};

export default function BrandMark({ size = 38, className = "" }: BrandMarkProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-white/10 bg-[linear-gradient(150deg,#232840,#0b0e17)] shadow-[0_10px_30px_-14px_rgba(99,102,241,0.8)] ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        viewBox="0 0 24 24"
        fill="none"
        className="text-indigo-300"
      >
        <path
          d="M12 2.6 20 7v10l-8 4.4L4 17V7Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
          opacity="0.9"
        />
        <path
          d="M12 7.1 16.7 9.6v4.9L12 17l-4.7-2.5V9.6Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M12 10.2v3.6"
          stroke="#e0e7ff"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </span>
  );
}
