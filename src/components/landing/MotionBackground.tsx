import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MotionBackgroundProps {
  className?: string;
  intensity?: 'subtle' | 'medium' | 'intense';
}

export function MotionBackground({ className, intensity = 'medium' }: MotionBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();

  const y1 = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const y2 = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const y3 = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0.3]);

  const springY1 = useSpring(y1, { stiffness: 100, damping: 30 });
  const springY2 = useSpring(y2, { stiffness: 80, damping: 25 });

  const particles = useMemo(() => {
    const count = intensity === 'intense' ? 50 : intensity === 'medium' ? 30 : 15;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1,
      duration: Math.random() * 20 + 10,
      delay: Math.random() * 5,
    }));
  }, [intensity]);

  return (
    <div ref={containerRef} className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}>
      <div className="absolute inset-0 bg-[hsl(228,12%,5%)]" />

      <motion.div
        className="absolute -top-[40%] left-1/2 -translate-x-1/2 w-[150%] aspect-square"
        style={{ y: springY1, opacity }}
      >
        <div className="w-full h-full rounded-full bg-[radial-gradient(circle,hsl(14,100%,64%,0.15),hsl(262,83%,58%,0.08),transparent)] blur-3xl" />
      </motion.div>

      <motion.div
        className="absolute top-1/4 -left-[20%] w-[60%] aspect-square"
        style={{ y: springY2 }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="w-full h-full rounded-full bg-[radial-gradient(circle,hsl(262,83%,58%,0.12),hsl(262,60%,40%,0.05),transparent)] blur-3xl" />
      </motion.div>

      <motion.div
        className="absolute top-1/3 -right-[20%] w-[50%] aspect-square"
        style={{ y: y3 }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      >
        <div className="w-full h-full rounded-full bg-[radial-gradient(circle,hsl(14,100%,64%,0.1),hsl(262,50%,40%,0.05),transparent)] blur-3xl" />
      </motion.div>

      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-[hsl(262,83%,68%,0.4)]"
          style={{ left: `${particle.x}%`, top: `${particle.y}%`, width: particle.size, height: particle.size }}
          animate={{ y: [0, -100, 0], opacity: [0, 0.8, 0], scale: [0.5, 1, 0.5] }}
          transition={{ duration: particle.duration, repeat: Infinity, ease: 'easeInOut', delay: particle.delay }}
        />
      ))}

      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(262,83%,58%,0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(262,83%,58%,0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[hsl(228,12%,5%)] via-[hsl(228,12%,5%,0.5)] to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[hsl(228,12%,5%)] via-[hsl(228,12%,5%,0.8)] to-transparent" />
    </div>
  );
}

export default MotionBackground;
