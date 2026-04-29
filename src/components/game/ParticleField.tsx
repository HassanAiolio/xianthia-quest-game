import { motion } from "framer-motion";

/** Floating ambient particles for the landing screen. */
export function ParticleField({ count = 30 }: { count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {particles.map((i) => {
        const size = 2 + Math.random() * 4;
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const duration = 8 + Math.random() * 12;
        const delay = Math.random() * 8;
        const isGold = i % 3 === 0;
        return (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background: isGold ? "var(--gold)" : "var(--cyan)",
              boxShadow: `0 0 ${size * 3}px ${isGold ? "var(--gold)" : "var(--cyan)"}`,
              opacity: 0.6,
            }}
            animate={{
              y: [0, -40, 0],
              x: [0, 20, 0],
              opacity: [0.2, 0.9, 0.2],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}
