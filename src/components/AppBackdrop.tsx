export function AppBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#1a0008_0%,#0a0004_45%,#050000_100%)]" />

      <div
        className="absolute inset-0 opacity-[0.6]"
        style={{
          background:
            'radial-gradient(60%_50% at 30% 0%, rgba(255,43,79,0.18), transparent 60%), radial-gradient(50%_60% at 90% 30%, rgba(255,0,55,0.12), transparent 60%)',
        }}
      />

      <div className="absolute inset-0 grid-bg opacity-[0.18]" />

      <svg className="absolute inset-x-0 bottom-0 h-[58%] w-full" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="ridge1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0005" />
            <stop offset="100%" stopColor="#050000" />
          </linearGradient>
          <linearGradient id="ridge2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e0003" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <radialGradient id="moon" cx="80%" cy="20%" r="20%">
            <stop offset="0%" stopColor="rgba(255,90,120,0.55)" />
            <stop offset="60%" stopColor="rgba(122,0,32,0.35)" />
            <stop offset="100%" stopColor="rgba(26,0,6,0)" />
          </radialGradient>
        </defs>
        <rect width="1600" height="600" fill="url(#moon)" />
        <path
          d="M0 420 L120 360 L220 400 L340 320 L460 380 L580 310 L720 370 L860 290 L1000 360 L1140 300 L1280 380 L1420 320 L1600 380 L1600 600 L0 600 Z"
          fill="url(#ridge1)"
          opacity="0.9"
        />
        <path
          d="M0 480 L80 460 L200 500 L320 450 L460 510 L600 470 L740 520 L880 480 L1040 530 L1180 490 L1340 540 L1480 500 L1600 540 L1600 600 L0 600 Z"
          fill="url(#ridge2)"
        />
      </svg>

      <Embers />

      <div className="noise" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/40" />
    </div>
  );
}

// Pure CSS keyframes instead of framer-motion: 22 JS-driven infinite animations kept the
// main thread busy every frame for the app's whole lifetime. CSS transform/opacity
// animations run on the compositor and cost ~nothing.
function Embers() {
  const dots = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div className="absolute inset-0">
      {dots.map((i) => (
        <span
          key={i}
          className="ember absolute h-[3px] w-[3px] rounded-full bg-primary/60 shadow-[0_0_8px_rgba(255,0,55,0.9)]"
          style={{
            left: `${(i * 47) % 100}%`,
            top: `${60 + ((i * 31) % 35)}%`,
            animationDuration: `${8 + (i % 5)}s`,
            animationDelay: `${(i % 6) * 0.6}s`,
          }}
        />
      ))}
    </div>
  );
}
