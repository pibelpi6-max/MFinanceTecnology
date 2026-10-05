import { BRAND } from "@/config/brand";

export default function AdminLoading() {
  const letters = BRAND.name.split("");
  const waveDuration = 2.0;
  const letterDelay = 0.15;

  return (
    <>
      <div
        className="admin-loading-bg"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 0, height: "100%" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 1 }}>
            {letters.map((char, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  color: "#999",
                  animation: `letterWave ${waveDuration}s ease-in-out infinite`,
                  animationDelay: `${i * letterDelay}s`,
                }}
              >
                {char === " " ? " " : char}
              </span>
            ))}
          </div>
          <div
            style={{
              height: 2,
              width: `${letters.length * 14}px`,
              borderRadius: 2,
              background: `linear-gradient(90deg, transparent 0%, ${BRAND.primary} 50%, transparent 100%)`,
              backgroundSize: "300% 100%",
              animation: "barShimmer 1.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes letterWave {
          0%   { color: #999; text-shadow: none; }
          15%  { color: ${BRAND.primary};
                 text-shadow: 0 0 12px rgba(${BRAND.primaryRgb}, 0.55); }
          40%  { color: #ccc; text-shadow: none; }
          100% { color: #999; text-shadow: none; }
        }
        @keyframes barShimmer {
          0%   { background-position: 150% center; }
          100% { background-position: -150% center; }
        }
      `}</style>
    </>
  );
}
