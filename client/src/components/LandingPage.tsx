import React, { useEffect, useRef } from 'react';
import { Sprout, ChevronDown } from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const windOffsetRef = useRef<any>(null);

  // SVG filter animation for swaying leaves
  useEffect(() => {
    let animationFrameId: number;
    let offset = 0;

    const animateWind = () => {
      offset += 0.018; // Softer, calmer swaying speed
      if (windOffsetRef.current) {
        // Multi-frequency wind simulation:
        // 1. Macro-sway (subtle, slow oscillation representing branch movement)
        const macroX = Math.sin(offset) * 9;
        const macroY = Math.cos(offset * 0.75) * 5;
        
        // 2. Micro-flutter (small, gentle oscillation representing leaf fluttering)
        const flutterX = Math.sin(offset * 3.5) * 1.5;
        const flutterY = Math.cos(offset * 2.8) * 0.9;
        
        const dx = macroX + flutterX;
        const dy = macroY + flutterY;
        
        windOffsetRef.current.setAttribute('dx', String(dx));
        windOffsetRef.current.setAttribute('dy', String(dy));
      }
      animationFrameId = requestAnimationFrame(animateWind);
    };

    animateWind();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle class for floating light/spores
    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      alpha: number;
      decay: number;
      color: string;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height + height * 0.2; // Start from middle/bottom mostly
        this.size = Math.random() * 2 + 0.8;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.speedY = -(Math.random() * 0.5 + 0.2); // Slow float upwards
        this.alpha = Math.random() * 0.5 + 0.1;
        this.decay = Math.random() * 0.002 + 0.0005;
        this.color = `rgba(${120 + Math.random() * 50}, ${200 + Math.random() * 55}, ${120 + Math.random() * 50}, `;
      }

      update() {
        this.x += this.speedX + Math.sin(this.y / 30) * 0.1; // Gentle horizontal drift
        this.y += this.speedY;
        this.alpha -= this.decay;

        // Reset if fade out or goes off screen
        if (this.alpha <= 0 || this.y < 0) {
          this.x = Math.random() * width;
          this.y = height + Math.random() * 100;
          this.size = Math.random() * 2 + 0.8;
          this.speedX = Math.random() * 0.4 - 0.2;
          this.speedY = -(Math.random() * 0.5 + 0.2);
          this.alpha = Math.random() * 0.5 + 0.2;
        }
      }

      draw(context: CanvasRenderingContext2D) {
        context.save();
        context.globalAlpha = this.alpha;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fillStyle = this.color + `${this.alpha})`;
        // Glow effect
        context.shadowBlur = this.size * 4;
        context.shadowColor = 'rgba(144, 238, 144, 0.6)';
        context.fill();
        context.restore();
      }
    }

    const particles: Particle[] = Array.from({ length: 60 }, () => new Particle());

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw particle layer
      particles.forEach((particle) => {
        particle.update();
        particle.draw(ctx);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-white flex flex-col justify-between select-none">
      {/* Import elegant serif font for the hydrocrops logo */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');
        .font-serif-elegant {
          font-family: 'Cormorant Garamond', serif;
        }
        @keyframes kenburns {
          0% {
            transform: scale(1.15) translate(-1%, -1%);
          }
          50% {
            transform: scale(1.04) translate(0.5%, 0.2%);
          }
          100% {
            transform: scale(1.15) translate(-1%, -1%);
          }
        }
        .animate-kenburns {
          animation: kenburns 45s ease-in-out infinite;
        }
        @keyframes sunbeams {
          0% {
            transform: rotate(-12deg) scale(1) translate(-2%, -2%);
            opacity: 0.12;
          }
          50% {
            transform: rotate(-5deg) scale(1.08) translate(1%, 1%);
            opacity: 0.28;
          }
          100% {
            transform: rotate(-12deg) scale(1) translate(-2%, -2%);
            opacity: 0.12;
          }
        }
        .animate-sunbeams {
          animation: sunbeams 25s ease-in-out infinite;
        }
        @keyframes mist-drift-1 {
          0% { transform: translateX(-4%) translateY(0) scaleY(1); opacity: 0.18; }
          50% { transform: translateX(4%) translateY(-1%) scaleY(1.08); opacity: 0.26; }
          100% { transform: translateX(-4%) translateY(0) scaleY(1); opacity: 0.18; }
        }
        .animate-mist-1 {
          animation: mist-drift-1 50s ease-in-out infinite;
        }
        @keyframes mist-drift-2 {
          0% { transform: translateX(3%) translateY(1%) scaleY(1.05); opacity: 0.12; }
          50% { transform: translateX(-3%) translateY(0) scaleY(0.95); opacity: 0.22; }
          100% { transform: translateX(3%) translateY(1%) scaleY(1.05); opacity: 0.12; }
        }
        .animate-mist-2 {
          animation: mist-drift-2 70s ease-in-out infinite;
        }
      `}</style>

      {/* SVG Displacement Wind Filter Definition - High-Fidelity Forest Sway */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="wind-sway" x="-10%" y="-10%" width="120%" height="120%">
            {/* 1. Extract the green channel to isolate foliage */}
            <feColorMatrix
              type="matrix"
              values="0 1 0 0 0
                      0 1 0 0 0
                      0 1 0 0 0
                      0 0 0 1 0"
              in="SourceGraphic"
              result="greenChannel"
            />
            
            {/* 2. Boost the contrast of the green mask so that trunks/rocks are clean 0.0 (static) */}
            <feComponentTransfer in="greenChannel" result="foliageMask">
              <feFuncR type="linear" slope="2.5" intercept="-0.2"/>
              <feFuncG type="linear" slope="2.5" intercept="-0.2"/>
              <feFuncB type="linear" slope="2.5" intercept="-0.2"/>
            </feComponentTransfer>

            {/* 3. Generate animated turbulence noise */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="3"
              result="noise"
              seed="3"
            />
            <feOffset ref={windOffsetRef} dx="0" dy="0" in="noise" result="offsetNoise" />

            {/* 4. Multiply displacement noise by the foliage mask */}
            <feComposite
              operator="arithmetic"
              k1="1" k2="0" k3="0" k4="0"
              in="offsetNoise"
              in2="foliageMask"
              result="maskedNoise"
            />

            {/* 5. Displace only the green foliage */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="maskedNoise"
              scale="14"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Background image container with static framing and SVG Sway Filter */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <img
          src="/landing_bg.png"
          alt="Rainforest Moss Background"
          className="w-full h-full object-cover opacity-65 select-none"
          style={{ filter: 'url(#wind-sway)' }}
        />

        {/* Cinematic God Rays / Sunbeams Overlay */}
        <div 
          className="absolute inset-0 z-1 pointer-events-none opacity-40 mix-blend-screen animate-sunbeams"
          style={{
            background: 'repeating-linear-gradient(115deg, rgba(210, 255, 210, 0.08) 0px, rgba(210, 255, 210, 0.08) 60px, transparent 120px, transparent 240px)',
            filter: 'blur(25px)',
            transformOrigin: 'top left',
          }}
        />

        {/* Rolling Forest Mist Layer 1 */}
        <div 
          className="absolute inset-x-0 bottom-0 h-1/2 z-1 pointer-events-none opacity-20 mix-blend-screen animate-mist-1"
          style={{
            background: 'radial-gradient(ellipse at bottom, rgba(235, 255, 235, 0.16) 0%, rgba(235, 255, 235, 0.04) 50%, transparent 80%)',
            filter: 'blur(35px)',
          }}
        />

        {/* Rolling Forest Mist Layer 2 */}
        <div 
          className="absolute inset-x-0 top-1/4 bottom-0 z-1 pointer-events-none opacity-15 mix-blend-screen animate-mist-2"
          style={{
            background: 'radial-gradient(ellipse at 75% 65%, rgba(220, 255, 220, 0.12) 0%, rgba(220, 255, 220, 0.02) 60%, transparent 90%)',
            filter: 'blur(45px)',
          }}
        />

        {/* Subtle radial dark vignette to focus the center */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-slate-950/40 to-slate-950/90 z-2" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/20 z-2" />
      </div>

      {/* Floating Canvas Particles */}
      <canvas ref={canvasRef} className="absolute inset-0 z-1 pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 flex justify-between items-center px-12 py-8">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/10 p-2 ring-1 ring-emerald-500/20">
            <Sprout className="h-5 w-5 text-emerald-400" />
          </div>
          <span className="text-sm font-semibold tracking-widest text-emerald-400/90 uppercase">Hydrocrops</span>
        </div>
        <button
          onClick={onEnter}
          className="text-xs tracking-widest uppercase text-slate-300 hover:text-emerald-400 transition-colors border border-slate-700/50 hover:border-emerald-500/30 rounded-full px-5 py-2 bg-slate-900/40 backdrop-blur-md cursor-pointer"
        >
          Access Platform
        </button>
      </header>

      {/* Center Hero Section */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="space-y-4 max-w-3xl animate-fade-in">
          <h1 className="text-7xl md:text-9xl font-serif-elegant font-light tracking-wide text-white drop-shadow-2xl">
            hydrocrops
          </h1>
          <p className="text-sm md:text-md tracking-[0.4em] uppercase text-emerald-300/80 font-medium">
            IOT home gardening service
          </p>
        </div>
      </div>

      {/* Bottom copy columns & scroll button */}
      <footer className="relative z-10 px-12 py-10 w-full flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent">
        {/* Left copy column */}
        <div className="max-w-md text-left space-y-2 hidden md:block">
          <h3 className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">Automated Phytodiagnostics</h3>
          <p className="text-xs text-slate-400 leading-relaxed font-light">
            Real-time IoT classification monitoring plant wellness indicators directly from leaf imaging. 
            Identify mineral deficiencies (Nitrogen, Potassium, Phosphorus) and fungal pathogens instantly.
          </p>
        </div>

        {/* Center Scroll Indicator */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onEnter}
            className="flex flex-col items-center gap-1 group text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            <span className="text-[10px] tracking-[0.3em] uppercase">Scan Your Plant</span>
            <ChevronDown className="h-4 w-4 animate-bounce text-emerald-500 group-hover:text-emerald-400" />
          </button>
        </div>

        {/* Right copy column */}
        <div className="max-w-md text-right space-y-2 hidden md:block">
          <h3 className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">Sovereign Model Intelligence</h3>
          <p className="text-xs text-slate-400 leading-relaxed font-light">
            Engineered with deep color channel analytics and Edge Density texture profiles. 
            Local datasets ensure continuous optimization for home hydroponics set-ups.
          </p>
        </div>
      </footer>
    </div>
  );
}
