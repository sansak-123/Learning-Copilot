// src/app/page.tsx
"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Rocket,
  Zap,
  Brain,
  Palette,
  Users,
  BookOpen,
  Target,
  Star,
  Play,
} from "lucide-react";

export default function Home() {
  const { data: session, status } = useSession();

  // --- env / device flags ---
  const [isTouch, setIsTouch] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setIsTouch(
      "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        (navigator as any).msMaxTouchPoints > 0
    );
    setReduceMotion(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    );
  }, []);

  // --- spotlight (disabled on touch) ---
  const [mouse, setMouse] = useState({ x: -9999, y: -9999 });
  useEffect(() => {
    if (isTouch) return;
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [isTouch]);

  // --- parallax icon ---
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // --- feature autorotate (paused on touch/small, respects reduced motion) ---
  const [activeFeature, setActiveFeature] = useState(0);
  useEffect(() => {
    if (reduceMotion || isTouch) return;
    const id = setInterval(() => setActiveFeature((i) => (i + 1) % 3), 4800);
    return () => clearInterval(id);
  }, [reduceMotion, isTouch]);

  // --- particle canvas (skips on touch/small or reduced motion) ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
    }>
  >([]);
  useEffect(() => {
    const small = window.innerWidth < 640;
    if (reduceMotion || isTouch || small) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    if (!particlesRef.current.length) {
      const count = 36; // slightly lighter
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          size: Math.random() * 2 + 0.8,
          opacity: Math.random() * 0.25 + 0.15,
        });
      }
    }

    const step = () => {
      const P = particlesRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -12 || p.x > window.innerWidth + 12) p.vx *= -1;
        if (p.y < -12 || p.y > window.innerHeight + 12) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,163,26,${p.opacity})`;
        ctx.fill();

        for (let j = i + 1; j < P.length; j++) {
          const q = P[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 80) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(255,163,26,${((80 - dist) / 80) * 0.07})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reduceMotion, isTouch]);

  // --- scroll reveal ---
  const revealSet = useRef<Set<Element>>(new Set());
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("reveal-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealSet.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const attachReveal = (el: HTMLElement | null) => {
    if (el) revealSet.current.add(el);
  };

  // --- content ---
  const features = useMemo(
    () => [
      {
        icon: Zap,
        title: "Interactive Learning",
        description:
          "Turn passive reading into active mastery with guided tasks and instant feedback.",
        stats: "Real-time engagement",
        gradient: "from-amber-400 to-amber-600",
      },
      {
        icon: Brain,
        title: "Curiosity Engine",
        description:
          "Adaptive content that follows your interests and challenges—never a dull turn.",
        stats: "Adaptive paths",
        gradient: "from-fuchsia-400 to-amber-400",
      },
      {
        icon: Palette,
        title: "Create & Share",
        description:
          "Transform insights into projects and prototypes you can publish and remix.",
        stats: "Unlimited creation",
        gradient: "from-cyan-300 to-amber-400",
      },
    ],
    []
  );

  const stats = useMemo(
    () => [
      { number: "50K+", label: "Active Learners", icon: Users },
      { number: "1M+", label: "Lessons Completed", icon: BookOpen },
      { number: "200+", label: "Topics Covered", icon: Target },
      { number: "95%", label: "Satisfaction Rate", icon: Star },
    ],
    []
  );

  if (status === "loading") {
    return (
      <div className="grid place-items-center h-screen bg-[#0b0b0c]">
        <div className="relative">
          <div className="w-14 h-14 border-4 border-amber-500/70 border-t-transparent rounded-full animate-spin" />
          <div
            className="absolute inset-2.5 w-9 h-9 border-2 border-white/15 border-b-transparent rounded-full animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "1.4s" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-neutral-100 relative overflow-x-hidden">
      {/* canvas only on non-touch + non-reduced motion + sm+ */}
      {!reduceMotion && !isTouch && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 pointer-events-none z-0"
        />
      )}

      {/* mouse spotlight hidden on touch */}
      {!reduceMotion && !isTouch && (
        <div
          aria-hidden
          className="fixed pointer-events-none z-10 transition-[left,top] duration-150 ease-out"
          style={{
            left: mouse.x - 110,
            top: mouse.y - 110,
            width: 220,
            height: 220,
            background:
              "radial-gradient(circle, rgba(255, 176, 46, 0.11) 0%, rgba(255, 176, 46, 0.05) 40%, transparent 70%)",
            borderRadius: "50%",
            filter: "blur(28px)",
          }}
        />
      )}

      {/* soft glows + dot grid */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <div className="absolute left-[10%] top-24 h-56 w-56 sm:h-72 sm:w-72 rounded-full blur-3xl opacity-20 bg-amber-500" />
        <div className="absolute right-[6%] bottom-16 h-48 w-48 sm:h-72 sm:w-72 rounded-full blur-3xl opacity-10 bg-fuchsia-600" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
      </div>

      {/* header */}
      <header className="fixed top-0 w-full z-50 bg-[#0b0b0c]/80 backdrop-blur border-b border-neutral-900/70">
        <div className="max-w-7xl mx-auto flex items-center justify-between py-3 sm:py-4 px-4 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2 sm:gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md"
          >
            <div className="relative">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg grid place-items-center shadow ring-1 ring-amber-400/30 group-hover:scale-105 transition">
                <Sparkles className="text-black" size={14} />
              </div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/30 blur-md opacity-30 group-hover:opacity-60 transition" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold leading-5">
                Knowledge Labs
              </h1>
              <p className="text-[9px] sm:text-[10px] text-amber-300/90 tracking-[.25em]">
                LEARN • CREATE • TRANSFORM
              </p>
            </div>
          </a>

          <div className="flex items-center gap-2 sm:gap-3">
            {session?.user ? (
              <>
                <div className="hidden sm:flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-neutral-800">
                  <Image
                    src={session.user.image ?? "/default-avatar.png"}
                    alt={session.user.name ?? "User Avatar"}
                    width={26}
                    height={26}
                    className="rounded-full ring-2 ring-amber-400/40"
                  />
                  <span className="text-sm">{session.user.name}</span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="bg-white text-black px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google", { callbackUrl: "/chat" })}
                className="relative group bg-gradient-to-r from-amber-500 to-amber-600 text-black px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_50px_-12px_rgba(255,193,7,0.45)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                  Start
                  <ArrowRight className="w-4 h-4" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-20 min-h-[88vh] sm:min-h-[92vh] flex items-center justify-center px-4 sm:px-6 pt-24 sm:pt-28">
        <div className="max-w-6xl mx-auto text-center w-full">
          <div className="mb-7 sm:mb-8 space-y-3" ref={attachReveal}>
            <h1 className="text-[40px] sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05]">
              Start learning <span className="text-amber-400">today</span>
            </h1>
            <h2
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black leading-none tracking-tight bg-clip-text text-transparent"
              style={{
                background:
                  "linear-gradient(90deg,#f59e0b,#ffffff,#f59e0b,#fbbf24)",
                backgroundSize: "220% 100%",
                animation: reduceMotion
                  ? undefined
                  : "gradient-shift 5s ease-in-out infinite",
                WebkitBackgroundClip: "text",
              }}
            >
              Knowledge, transformed.
            </h2>
          </div>

          <div
            className="relative mb-8 sm:mb-10 max-w-[36rem] sm:max-w-3xl mx-auto"
            ref={attachReveal}
          >
            <p className="text-[15px] sm:text-base md:text-lg text-neutral-300 leading-relaxed">
              Turn static content into{" "}
              <span className="inline-block px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-200">
                dynamic experiences
              </span>{" "}
              that spark curiosity, build skill, and ship projects.
            </p>
          </div>

          <div
            className="flex flex-col sm:flex-row gap-3.5 sm:gap-5 justify-center items-center mb-12 sm:mb-16"
            ref={attachReveal}
          >
            <button
              onClick={() => signIn("google", { callbackUrl: "/chat" })}
              className="group relative bg-gradient-to-r from-amber-500 to-amber-600 text-black px-6 sm:px-8 py-3 rounded-full text-sm sm:text-base md:text-lg font-bold hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_50px_-12px_rgba(255,193,7,0.45)] transition transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 w-full sm:w-auto"
            >
              <span className="relative z-10 flex items-center justify-center gap-2 sm:gap-3">
                Start Your Journey
                <ArrowRight className="w-5 h-5 group-hover:rotate-45 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button className="group text-amber-400 hover:text-white px-6 sm:px-8 py-3 rounded-full text-sm sm:text-base font-semibold border border-neutral-800 hover:border-amber-400 hover:bg-amber-500/10 transition backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 w-full sm:w-auto">
              <span className="flex items-center justify-center gap-2 sm:gap-3">
                Watch Demo
                <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </span>
            </button>
          </div>

          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-5 max-w-[40rem] sm:max-w-4xl mx-auto"
            ref={attachReveal}
          >
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="group p-4 sm:p-5 bg-white/[0.03] backdrop-blur rounded-2xl border border-neutral-800 hover:border-amber-400/40 hover:bg-amber-500/10 transition"
                  style={{
                    animation: reduceMotion
                      ? undefined
                      : `float ${3 + i * 0.25}s ease-in-out infinite`,
                    animationDelay: reduceMotion ? undefined : `${i * 0.1}s`,
                  }}
                >
                  <div className="mb-1.5 sm:mb-2 grid place-items-center">
                    <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 group-hover:text-amber-300 transition" />
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-amber-400 text-center group-hover:text-white transition">
                    {s.number}
                  </div>
                  <div className="text-neutral-400 text-xs sm:text-sm text-center">
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* features */}
      <section className="relative z-20 py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 sm:mb-16" ref={attachReveal}>
            <h3 className="text-[26px] sm:text-4xl md:text-5xl font-extrabold tracking-tight">
              Why Knowledge <span className="text-amber-400">Labs?</span>
            </h3>
            <p className="text-neutral-400 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
              Learning reimagined for minds that refuse to stay static.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-7">
            {features.map((f, i) => {
              const Icon = f.icon;
              const active = activeFeature === i;
              return (
                <article
                  key={f.title}
                  ref={attachReveal}
                  tabIndex={0}
                  onMouseEnter={() => setActiveFeature(i)}
                  onFocus={() => setActiveFeature(i)}
                  className={`relative border rounded-3xl p-6 sm:p-7 transition cursor-pointer outline-none
                    ${
                      active
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-neutral-800 hover:border-amber-400/40 hover:bg-white/[0.04]"
                    }
                    focus-visible:ring-2 focus-visible:ring-amber-400`}
                  style={{
                    transform: active ? "scale(1.015)" : "scale(1)",
                    boxShadow: active
                      ? "0 0 50px rgba(255,193,7,0.12)"
                      : "none",
                  }}
                >
                  <div className="relative z-10">
                    <div
                      className={`inline-grid place-items-center w-14 h-14 sm:w-16 sm:h-16 mb-4 sm:mb-5 rounded-2xl bg-gradient-to-br ${f.gradient} shadow`}
                      style={{
                        transform: active
                          ? "scale(1.04) rotate(4deg)"
                          : "scale(1)",
                        filter: active ? "brightness(1.1)" : "brightness(1)",
                      }}
                    >
                      <Icon className="text-black" size={26} />
                    </div>
                    <h4
                      className="text-lg sm:text-xl font-bold mb-1.5 sm:mb-2"
                      style={{ color: active ? "#f59e0b" : "white" }}
                    >
                      {f.title}
                    </h4>
                    <p className="text-neutral-300 leading-relaxed text-sm sm:text-base mb-3">
                      {f.description}
                    </p>
                    <div className="text-amber-400 font-semibold text-xs tracking-wide">
                      {f.stats}
                    </div>
                  </div>
                  <div
                    className={`pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br ${
                      f.gradient
                    } transition-opacity ${
                      active ? "opacity-[0.06]" : "opacity-0"
                    }`}
                  />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* final cta */}
      <section className="relative z-20 text-center py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto" ref={attachReveal}>
          <h3 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            Ready to transform{" "}
            <span className="text-amber-400">how you learn</span>?
          </h3>
          <p className="text-neutral-400 mt-3 mb-8 max-w-2xl mx-auto text-sm sm:text-base">
            Join thousands of curious minds already on their journey.
          </p>

          {!session?.user && (
            <button
              onClick={() => signIn("google", { callbackUrl: "/chat" })}
              className="group relative bg-gradient-to-r from-amber-500 to-amber-600 text-black px-8 sm:px-10 py-3.5 sm:py-4 rounded-full text-base sm:text-lg font-bold hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_50px_-12px_rgba(255,193,7,0.45)] transition transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              style={{ boxShadow: "0 0 80px rgba(245, 158, 11, 0.28)" }}
            >
              <span className="relative z-10 inline-flex items-center gap-2 sm:gap-3">
                Get Started Free
                <Rocket className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      </section>

      {/* footer */}
      <footer className="relative z-20 bg-[#0b0b0c]/80 backdrop-blur border-t border-neutral-900/70 py-10 sm:py-14 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto text-center" ref={attachReveal}>
          <div className="flex items-center justify-center gap-2.5 sm:gap-3 mb-5 sm:mb-6">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg grid place-items-center">
              <Sparkles className="text-black" size={14} />
            </div>
            <span className="text-lg sm:text-xl font-bold">Knowledge Labs</span>
          </div>
          <p className="text-amber-200/90 mb-5 sm:mb-6 text-sm sm:text-base">
            Transforming minds, one curious question at a time.
          </p>
          <nav className="flex flex-wrap justify-center gap-5 sm:gap-8 text-neutral-400 text-xs sm:text-sm font-medium">
            <a
              href="#"
              className="hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
            >
              Terms of Service
            </a>
            <a
              href="#"
              className="hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
            >
              Contact
            </a>
          </nav>
          <p className="text-neutral-500 text-[11px] sm:text-xs mt-6">
            © {new Date().getFullYear()} Knowledge Labs. All rights reserved.
          </p>
        </div>
      </footer>

      <style jsx>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800;900&display=swap");

        :global(html) {
          font-family: "Poppins", system-ui, -apple-system, Segoe UI, Roboto,
            Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans";
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        @keyframes gradient-shift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }

        /* reveal */
        .reveal-initial,
        .reveal-init {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        .reveal-in {
          opacity: 1 !important;
          transform: translateY(0) scale(1) !important;
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
      `}</style>
    </div>
  );
}
