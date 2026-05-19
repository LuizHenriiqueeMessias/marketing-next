import { motion } from "framer-motion";

export default function ShimmerWordmark() {
  return (
    <div className="relative flex flex-col items-center select-none">
      {/* Shared SVG gradient definition */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="metallic-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#6d5cdb" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Text container with metallic fill + shimmer overlay */}
      <div className="relative overflow-hidden">
        {/* MARKETING */}
        <div
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: "clamp(36px, 4.5vw, 58px)",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            lineHeight: 1,
            background: "linear-gradient(180deg, #8b5cf6 0%, #6d5cdb 50%, #3b82f6 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textAlign: "center",
          }}
        >
          Marketing
        </div>

        {/* N E X T */}
        <div
          style={{
            fontFamily: "var(--font-display, 'Montserrat', sans-serif)",
            fontSize: "clamp(14px, 1.5vw, 18px)",
            fontWeight: 400,
            fontStyle: "italic",
            letterSpacing: "0.55em",
            textTransform: "uppercase",
            marginTop: 14,
            textAlign: "center",
            background: "linear-gradient(180deg, #6d5cdb 0%, #3b82f6 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Next
        </div>

        {/* Shimmer glint overlay */}
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "50%",
            height: "100%",
            background:
              "linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.08) 35%, rgba(255,255,255,0.25) 48%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.25) 52%, rgba(255,255,255,0.08) 65%, transparent 80%)",
            filter: "blur(2px)",
            pointerEvents: "none",
            mixBlendMode: "screen",
          }}
        />
      </div>
    </div>
  );
}
