import { useEffect, useRef } from "react";
export default function Orb({ active = false }: { active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0,
      id = 0;
    let width = 500,
      height = 400;
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      canvas.width = width * Math.min(devicePixelRatio, 2);
      canvas.height = height * Math.min(devicePixelRatio, 2);
      ctx.setTransform(
        Math.min(devicePixelRatio, 2),
        0,
        0,
        Math.min(devicePixelRatio, 2),
        0,
        0,
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points = Array.from({ length: 1400 }, (_, i) => {
      const y = 1 - (i / 1399) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
    });
    const draw = () => {
      frame += reduced ? 0 : 0.003 * (active ? 1.8 : 1);
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2,
        cy = height / 2,
        r = Math.min(width * 0.28, height * 0.345);
      const haze = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.7);
      haze.addColorStop(0, "rgba(60,205,202,0.07)");
      haze.addColorStop(0.6, "rgba(15,153,157,0.04)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);
      // Astronomical reference rings.
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.23 + k * 0.15);
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          r * (1.37 + k * 0.1),
          r * (0.39 + k * 0.07),
          0,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = `rgba(95,196,197,${0.15 - k * 0.025})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.restore();
      }
      const rendered = points
        .map((p) => {
          const x = p.x * Math.cos(frame) + p.z * Math.sin(frame),
            z = -p.x * Math.sin(frame) + p.z * Math.cos(frame);
          const tiltedY = p.y * Math.cos(0.19) - z * Math.sin(0.19),
            tiltedZ = p.y * Math.sin(0.19) + z * Math.cos(0.19);
          return { x: cx + x * r, y: cy + tiltedY * r, z: tiltedZ };
        })
        .sort((a, b) => a.z - b.z);
      for (const p of rendered) {
        const opacity = 0.12 + ((p.z + 1) / 2) * 0.75;
        ctx.fillStyle = `rgba(${p.z > 0.7 ? "170,255,244" : "64,191,187"},${opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.z > 0.7 ? 1.05 : 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let j = 0; j < 7; j++) {
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const a = (i / 160) * Math.PI * 2;
          const y = Math.cos(a) * r;
          const x = Math.sin(a) * r * Math.cos((j * Math.PI) / 7 + frame);
          if (i === 0) ctx.moveTo(cx + x, cy + y);
          else ctx.lineTo(cx + x, cy + y);
        }
        ctx.strokeStyle = "rgba(77,185,181,0.12)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      for (let j = 1; j < 8; j++) {
        const y = -r + (j * r) / 4;
        const rr = Math.sqrt(r * r - y * y);
        ctx.beginPath();
        ctx.ellipse(cx, cy + y, rr, rr * 0.12, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(82,209,198,0.17)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(123,237,226,0.24)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = frame * 0.5 + i * 1.256;
        const x = cx + Math.cos(a) * r * 1.6,
          y = cy + Math.sin(a) * r * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, i === 1 ? 2 : 1.4, 0, Math.PI * 2);
        ctx.fillStyle = i === 1 ? "#d3b681" : "#71dfcf";
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#58e2d0";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
    };
  }, [active]);
  return (
    <canvas
      className="orb-canvas"
      ref={ref}
      aria-label={active ? "Aegis Sprachverbindung aktiv" : "Aegis Kern bereit"}
    />
  );
}
