import { useEffect, useRef } from "react";
import land from "../lib/earth-land.json";

export default function Globe({
  location,
}: {
  location?: { latitude: number; longitude: number; name: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    target = useRef(location);
  target.current = location;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0,
      width = 400,
      height = 370,
      yaw = 0,
      pitch = 0,
      clock = 0,
      previous = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      if (time - previous < 32) return;
      previous = time;
      clock += reduced ? 0 : 0.022;
      const desiredYaw = target.current
        ? (target.current.longitude * Math.PI) / 180
        : clock * 0.06;
      const desiredPitch = target.current
        ? (target.current.latitude * Math.PI) / 180
        : 0.3;
      yaw += (desiredYaw - yaw) * (reduced ? 1 : 0.045);
      pitch += (desiredPitch - pitch) * (reduced ? 1 : 0.045);
      const r = Math.min(width * 0.38, height * 0.39),
        cx = width / 2,
        cy = height / 2;
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.35);
      glow.addColorStop(0, "#092429");
      glow.addColorStop(0.72, "#12393688");
      glow.addColorStop(1, "#12393600");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      const project = (lon: number, lat: number) => {
        const a = (lon * Math.PI) / 180 - yaw,
          b = (lat * Math.PI) / 180;
        return {
          x: cx + r * Math.cos(b) * Math.sin(a),
          y:
            cy -
            r *
              (Math.cos(pitch) * Math.sin(b) -
                Math.sin(pitch) * Math.cos(b) * Math.cos(a)),
          z:
            Math.sin(pitch) * Math.sin(b) +
            Math.cos(pitch) * Math.cos(b) * Math.cos(a),
        };
      };
      const path = (points: number[][]) => {
        ctx.beginPath();
        let pen = false;
        for (const [lon, lat] of points) {
          const p = project(lon, lat);
          if (p.z < 0) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
          pen = true;
        }
        ctx.stroke();
      };
      ctx.strokeStyle = "#5dafa51e";
      ctx.lineWidth = 0.6;
      for (let lat = -75; lat <= 75; lat += 15)
        path(Array.from({ length: 121 }, (_, i) => [i * 3 - 180, lat]));
      for (let lon = -180; lon < 180; lon += 15)
        path(Array.from({ length: 61 }, (_, i) => [lon, i * 3 - 90]));
      ctx.strokeStyle = "#78ddc793";
      ctx.lineWidth = 0.8;
      for (const ring of land) path(ring);
      ctx.strokeStyle = "#87e8d88a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#91ffe329";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.2, r * 0.28, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      if (target.current) {
        const p = project(target.current.longitude, target.current.latitude);
        if (p.z > 0) {
          ctx.fillStyle = "#ccfff0";
          ctx.shadowColor = "#87ffdc";
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          for (let i = 0; i < 3; i++) {
            const phase = reduced ? i / 3 : (clock * 0.35 + i / 3) % 1;
            ctx.strokeStyle = `rgba(130,255,218,${(1 - phase) * 0.7})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 + phase * 28, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  return (
    <div className="earth-stage">
      <canvas
        ref={canvasRef}
        aria-label={
          location
            ? `Globus mit Markierung von ${location.name}`
            : "Animierter Erdglobus"
        }
      />
      <span className="earth-label">
        {location
          ? `${location.latitude.toFixed(3)}° N/S · ${location.longitude.toFixed(3)}° E/W`
          : "EARTH / WORLD CONTEXT"}
      </span>
      <small>Konturen: Natural Earth · Ortsmarkierung, kein Radar</small>
    </div>
  );
}
