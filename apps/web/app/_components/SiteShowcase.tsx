"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const examples = [
  { name: "Exit liquidity", image: "exit-liquidity.jpg", width: 1280, height: 720, alt: "Tripwire’s I AM EXIT LIQUIDITY warning for GIZA on Uniswap. Recorded screenshot." },
  { name: "Hyperliquid", image: "hyperliquid.jpg", width: 1280, height: 720, alt: "Tripwire’s perp positioning card on Hyperliquid. Recorded screenshot." },
  { name: "X", image: "x-profile.jpg", width: 1265, height: 712, alt: "Tripwire’s Nansen profile card beside a name on X. Recorded screenshot." },
  { name: "Jumper", image: "jumper.jpg", width: 1265, height: 712, alt: "Tripwire’s token card alongside Jumper’s swap form. Recorded screenshot." },
  { name: "Polymarket", image: "polymarket.jpg", width: 1265, height: 712, alt: "Tripwire’s wallet insights on Polymarket’s leaderboard. Recorded screenshot." },
  { name: "DEX Screener", image: "dexscreener.jpg", width: 1280, height: 720, alt: "Tripwire’s token flow card on DEX Screener. Recorded screenshot." },
] as const;
const slides = [examples.length - 1, ...examples.map((_, i) => i), 0];

export function SiteShowcase() {
  const root = useRef<HTMLElement>(null);
  // End clones let the last slide travel one screen forward, not sweep back across the entire strip.
  const [slot, setSlot] = useState(1);
  const index = (slot - 1 + examples.length) % examples.length;
  const [paused, setPaused] = useState(true);
  const [focusHold, setFocusHold] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const [instant, setInstant] = useState(false);
  const [loaded, setLoaded] = useState<boolean[]>(examples.map(() => false));

  useEffect(() => {
    // Server-rendered images can finish before React attaches onLoad during hydration.
    const images = root.current?.querySelectorAll<HTMLImageElement>("img[data-original=true]");
    if (images) setLoaded(Array.from(images, image => image.complete && image.naturalWidth > 0));
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPaused(media.matches);
    const motionChanged = () => { if (media.matches) setPaused(true); };
    const visibilityChanged = () => setVisible(!document.hidden);
    visibilityChanged();
    media.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: .2 });
    if (root.current) observer.observe(root.current);
    return () => { media.removeEventListener("change", motionChanged); document.removeEventListener("visibilitychange", visibilityChanged); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const next = (index + 1) % examples.length;
    if (paused || focusHold || !visible || !inView || !loaded[next]) return;
    const timer = window.setTimeout(() => { setInstant(false); setSlot(index + 2); }, 3000);
    return () => window.clearTimeout(timer);
  }, [index, paused, focusHold, visible, inView, loaded]);

  const settleLoop = () => {
    if (slot === 0 || slot === examples.length + 1) {
      setInstant(true);
      setSlot(index + 1);
    }
  };
  useEffect(() => {
    if (slot !== 0 && slot !== examples.length + 1) return;
    // transitionend can be absent in reduced motion or interrupted tabs.
    const timer = window.setTimeout(() => { setInstant(true); setSlot(index + 1); }, instant ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [slot, index, instant]);

  const move = (direction: number, keyboard: boolean) => {
    setInstant(keyboard);
    setSlot(index + 1 + direction);
  };

  return <section ref={root} id="in-action" className="site-showcase" data-rotating={!paused && !focusHold && visible && inView && loaded[(index + 1) % examples.length]} aria-label="Tripwire on supported sites" aria-roledescription="carousel"
    onFocusCapture={event => { if (event.target.matches(":focus-visible")) setFocusHold(true); }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusHold(false); }}>
    <div className="showcase-stage" data-instant={instant}>
      <div className="showcase-track" style={{ transform: `translateX(-${slot * 100}%)` }} onTransitionEnd={event => { if (event.propertyName === "transform") settleLoop(); }}>
        {slides.map((i, position) => { const example = examples[i]!; return <img key={position} src={`/showcase/${example.image}`} width={example.width} height={example.height}
          alt={example.alt} aria-hidden={slot !== position} data-active={slot === position} data-original={position > 0 && position <= examples.length} loading="eager" fetchPriority={i === 0 ? "high" : "low"} decoding="async"
          onLoad={() => setLoaded(current => current[i] ? current : current.map((ready, j) => ready || i === j))} />; })}
      </div>
      <button className="showcase-edge showcase-previous" type="button" aria-label="Previous screenshot" aria-disabled={slot === 0 || slot === examples.length + 1} onClick={event => { if (slot > 0 && slot <= examples.length) move(-1, event.detail === 0); }}><ChevronLeft size={22} aria-hidden="true" /></button>
      <button className="showcase-edge showcase-next" type="button" aria-label="Next screenshot" aria-disabled={slot === 0 || slot === examples.length + 1} onClick={event => { if (slot > 0 && slot <= examples.length) move(1, event.detail === 0); }}><ChevronRight size={22} aria-hidden="true" /></button>
    </div>
    <div className="showcase-controls">
      <div className="showcase-dots" role="group" aria-label="Choose screenshot">
        {examples.map((example, i) => <button key={example.name} type="button" aria-label={`Show ${example.name}`} aria-pressed={index === i}
          onClick={() => { setInstant(true); setPaused(true); setSlot(i + 1); }}><span aria-hidden="true" /></button>)}
      </div>
      <button className="showcase-play" type="button" aria-label={paused ? "Play slideshow" : "Pause slideshow"}
        onClick={() => { setPaused(current => !current); setFocusHold(false); }}>
        {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
      </button>
    </div>
  </section>;
}
