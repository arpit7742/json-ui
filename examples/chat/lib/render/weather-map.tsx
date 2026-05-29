"use client";

import { useEffect, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";

// =============================================================================
// Animated WeatherMap
// =============================================================================
//
// A real, interactive Leaflet map (pan / zoom / double-click-zoom / scroll-zoom)
// using the same free CartoCDN Voyager tiles as before, with an HTML canvas
// overlay sitting ON TOP that draws the live particle / radar / lightning
// animations. The animation is driven by the data props you pass in
// (wind speed/direction, precipitation, temperature, lightning flag).
//
// NO iframes. The animation lives in screen-space (it doesn't move with the
// map pan) — this is the same visual model ventusky uses when you pan around.
// =============================================================================

export type WeatherLayer =
  | "wind"
  | "rain"
  | "snow"
  | "thunder"
  | "temperature"
  | "clouds"
  | "pressure"
  | null;

export interface WeatherMapProps {
  latitude: number;
  longitude: number;
  zoom?: number | null;
  height?: string | null;
  label?: string | null;
  layer?: WeatherLayer;

  // Animation data — comes from your weather tools.
  windSpeedKmh?: number | null;
  windDirectionDeg?: number | null; // 0=N, 90=E, 180=S, 270=W (direction wind comes FROM)
  precipitationMm?: number | null;
  temperatureC?: number | null;
  lightningActive?: boolean | null;
  intensity?: number | null;
}

// =============================================================================
// Canvas animation state
// =============================================================================

interface AnimationState {
  particles: Particle[];
  clouds: Cloud[];
  lightning: { phase: number; bolt: Array<{ x: number; y: number }> } | null;
  lastFlash: number;
}

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  life: number;
  size: number;
  opacity: number;
  angle: number;
  length: number;
}

interface Cloud {
  x: number;
  y: number;
  r: number;
  vx: number;
  opacity: number;
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(n: number, min: number, max: number) {
  return n < min ? min : n > max ? max : n;
}

function initParticles(layer: WeatherLayer, w: number, h: number): Particle[] {
  if (!layer) return [];
  const counts: Record<NonNullable<WeatherLayer>, number> = {
    wind: 700,
    rain: 350,
    snow: 180,
    thunder: 220,
    temperature: 0,
    clouds: 0,
    pressure: 0,
  };
  const count = counts[layer];
  const list: Particle[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: Math.random() * w,
      y: Math.random() * h,
      prevX: 0,
      prevY: 0,
      life: 40 + Math.random() * 120,
      size: randRange(0.6, 2.2),
      opacity: randRange(0.4, 1),
      angle: Math.random() * Math.PI * 2,
      length: layer === "rain" ? randRange(8, 16) : 0,
    });
  }
  return list;
}

function initClouds(layer: WeatherLayer, w: number, h: number): Cloud[] {
  if (layer !== "clouds" && layer !== "thunder") return [];
  const count = layer === "thunder" ? 5 : 7;
  const list: Cloud[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: Math.random() * w,
      y: randRange(h * 0.1, h * 0.9),
      r: randRange(40, 90),
      vx: randRange(0.05, 0.2),
      opacity: randRange(0.2, 0.45),
    });
  }
  return list;
}

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  time: number;
  /** User-controlled speed multiplier (0.5×, 1×, 2×, 4×). */
  speed: number;
}

/**
 * Fade old pixels to TRANSPARENT (not dark) so the map stays visible.
 */
function fadeTrail(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Clip the canvas to a soft circle around (cx, cy) with the given pixel
 * radius. Anything outside the circle becomes transparent — that's how
 * we make rain only appear over Hyderabad, not the whole map. The
 * mask uses a radial gradient so the edge fades smoothly instead of
 * showing a hard ring.
 *
 * Uses destination-in compositing: existing canvas pixels are kept
 * only where the mask is opaque.
 */
function applyLocationMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, "rgba(0, 0, 0, 1)");
  grad.addColorStop(0.7, "rgba(0, 0, 0, 1)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawWind(
  d: DrawCtx,
  state: AnimationState,
  windSpeedKmh: number,
  windDirDeg: number,
) {
  const { ctx, w, h, time, speed } = d;
  // Slightly slower fade → trails persist longer so streamlines are clearly
  // visible even at low wind speeds.
  fadeTrail(ctx, w, h, 0.04);

  const dirRad = (((windDirDeg + 180) % 360) * Math.PI) / 180;
  // Minimum scale of 0.6 so wind is always visibly moving, even in dead calm.
  const speedScale = clamp(windSpeedKmh / 40, 0.6, 4) * speed;
  const vx = Math.sin(dirRad) * speedScale * 1.6;
  const vy = -Math.cos(dirRad) * speedScale * 1.6;
  const alpha = 0.7 + clamp(speedScale * 0.08, 0, 0.3);

  ctx.lineCap = "round";
  for (const p of state.particles) {
    p.prevX = p.x;
    p.prevY = p.y;
    const curl = Math.sin(p.x * 0.012 + p.y * 0.008 + time * 0.0006) * 0.6;
    p.x += vx + curl;
    p.y += vy + curl * 0.5;
    p.life -= 1;

    if (p.x < -5 || p.x > w + 5 || p.y < -5 || p.y > h + 5 || p.life <= 0) {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.prevX = p.x;
      p.prevY = p.y;
      p.life = 60 + Math.random() * 120;
    }

    // Bright cyan with thicker stroke + white inner highlight — clearly
    // visible against dark satellite imagery.
    ctx.strokeStyle = `rgba(120, 220, 255, ${alpha * p.opacity})`;
    ctx.lineWidth = p.size * 1.4;
    ctx.beginPath();
    ctx.moveTo(p.prevX, p.prevY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * p.opacity})`;
    ctx.lineWidth = p.size * 0.5;
    ctx.stroke();
  }
}

function drawRain(
  d: DrawCtx,
  state: AnimationState,
  precipMm: number,
  windDirDeg: number,
) {
  const { ctx, w, h, speed: spd } = d;
  ctx.clearRect(0, 0, w, h);

  const intensity = clamp(precipMm / 15, 0.3, 1.5);
  const dirRad = (((windDirDeg + 180) % 360) * Math.PI) / 180;
  const tilt = Math.sin(dirRad) * 3 * intensity * spd;
  const speed = (10 + intensity * 8) * spd;

  ctx.strokeStyle = `rgba(140, 200, 255, 0.85)`;
  ctx.lineCap = "round";
  for (const p of state.particles) {
    p.x += tilt;
    p.y += speed;
    if (p.y > h + 10) {
      p.x = Math.random() * w;
      p.y = -randRange(10, 80);
    }
    if (p.x > w + 10) p.x = -5;
    if (p.x < -10) p.x = w + 5;

    ctx.lineWidth = p.size * 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - tilt * 0.6, p.y - p.length);
    ctx.stroke();
  }
}

function drawSnow(
  d: DrawCtx,
  state: AnimationState,
  precipMm: number,
  windDirDeg: number,
) {
  const { ctx, w, h, time, speed: spd } = d;
  ctx.clearRect(0, 0, w, h);

  const intensity = clamp(precipMm / 8, 0.3, 1.6);
  const dirRad = (((windDirDeg + 180) % 360) * Math.PI) / 180;
  const drift = Math.sin(dirRad) * 0.8 * intensity * spd;

  for (const p of state.particles) {
    const wobble = Math.sin(time * 0.001 + p.angle) * 0.6 * spd;
    p.x += drift + wobble;
    p.y += (0.6 + p.size * 0.4 * intensity) * spd;
    p.angle += 0.01 * spd;
    if (p.y > h + 5) {
      p.x = Math.random() * w;
      p.y = -randRange(5, 40);
    }
    if (p.x > w + 5) p.x = -5;
    if (p.x < -5) p.x = w + 5;

    // Pure white flake — bright against the dark satellite imagery.
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 + p.opacity * 0.1})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateBolt(
  startX: number,
  h: number,
  cellCy: number,
  cellR: number,
): Array<{ x: number; y: number }> {
  const segs: Array<{ x: number; y: number }> = [];
  let x = startX;
  // Start slightly above the storm cell top edge so the bolt visibly
  // emerges from a cloud rather than from off-screen.
  const top = Math.max(0, cellCy - cellR * 0.9);
  const bottom = Math.min(h, cellCy + cellR * 0.9);
  let y = top + randRange(0, cellR * 0.1);
  segs.push({ x, y });
  while (y < bottom) {
    x += (Math.random() - 0.5) * 40;
    y += 12 + Math.random() * 18;
    segs.push({ x, y });
  }
  return segs;
}

function drawThunder(
  d: DrawCtx,
  state: AnimationState,
  lightningActive: boolean,
  windDirDeg: number,
  cellCx: number,
  cellCy: number,
  cellR: number,
) {
  const { ctx, w, h, time, speed: spd } = d;
  ctx.clearRect(0, 0, w, h);

  // Storm cells: soft white/grey clouds with a brighter rim, like
  // cumulonimbus tops seen from above on satellite imagery.
  for (const c of state.clouds) {
    c.x += c.vx * spd;
    if (c.x - c.r > w) c.x = -c.r;
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${c.opacity * 0.55})`);
    grad.addColorStop(0.7, `rgba(180, 190, 210, ${c.opacity * 0.25})`);
    grad.addColorStop(1, "rgba(80, 90, 110, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const dirRad = (((windDirDeg + 180) % 360) * Math.PI) / 180;
  const tilt = Math.sin(dirRad) * 3 * spd;
  const speed = 12 * spd;
  ctx.strokeStyle = `rgba(150, 200, 255, 0.6)`;
  for (const p of state.particles) {
    p.x += tilt;
    p.y += speed;
    if (p.y > h + 5) {
      p.x = Math.random() * w;
      p.y = -randRange(5, 60);
    }
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - tilt * 0.6, p.y - 8);
    ctx.stroke();
  }

  if (!state.lightning) {
    const spawnChance = (lightningActive ? 0.025 : 0.006) * spd;
    if (
      time - state.lastFlash > 400 / Math.max(0.1, spd) &&
      Math.random() < spawnChance
    ) {
      const startX = cellCx + randRange(-cellR * 0.7, cellR * 0.7);
      state.lightning = {
        phase: 1,
        bolt: generateBolt(startX, h, cellCy, cellR),
      };
      state.lastFlash = time;
    }
  } else {
    const L = state.lightning;
    if (L.phase > 0.7) {
      ctx.fillStyle = `rgba(220, 230, 255, ${(L.phase - 0.7) * 1.4})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = `rgba(255, 255, 255, ${L.phase})`;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = "rgba(180, 200, 255, 0.9)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    L.bolt.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    L.phase -= 0.06 * spd;
    if (L.phase <= 0) state.lightning = null;
  }
}

function drawTemperature(
  d: DrawCtx,
  temperatureC: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const { ctx, w, h, time } = d;
  ctx.clearRect(0, 0, w, h);

  let inner: string;
  let outer: string;
  if (temperatureC < 0) {
    inner = "rgba(120, 170, 255, 0.55)";
    outer = "rgba(50, 80, 200, 0)";
  } else if (temperatureC < 12) {
    inner = "rgba(150, 220, 255, 0.45)";
    outer = "rgba(80, 140, 220, 0)";
  } else if (temperatureC < 22) {
    inner = "rgba(180, 240, 180, 0.45)";
    outer = "rgba(120, 200, 100, 0)";
  } else if (temperatureC < 30) {
    inner = "rgba(255, 220, 120, 0.55)";
    outer = "rgba(230, 160, 60, 0)";
  } else if (temperatureC < 38) {
    inner = "rgba(255, 150, 80, 0.6)";
    outer = "rgba(220, 90, 40, 0)";
  } else {
    inner = "rgba(255, 80, 60, 0.7)";
    outer = "rgba(160, 20, 20, 0)";
  }

  const pulse = (Math.sin(time * 0.0011) + 1) * 0.5;
  const r = radius * (0.95 + pulse * 0.08);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawClouds(d: DrawCtx, state: AnimationState) {
  const { ctx, w, h, speed: spd } = d;
  ctx.clearRect(0, 0, w, h);
  for (const c of state.clouds) {
    c.x += c.vx * spd;
    if (c.x - c.r > w) c.x = -c.r;
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    grad.addColorStop(0, `rgba(245, 250, 255, ${c.opacity})`);
    grad.addColorStop(1, "rgba(245, 250, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPressure(d: DrawCtx, cx: number, cy: number, maxRadius: number) {
  const { ctx, w, h, time, speed: spd } = d;
  ctx.clearRect(0, 0, w, h);
  const ringCount = 6;
  for (let i = 0; i < ringCount; i++) {
    const phase = (time * 0.0006 * spd + i / ringCount) % 1;
    const r = phase * maxRadius;
    const a = (1 - phase) * 0.7;
    ctx.strokeStyle = `rgba(140, 200, 255, ${a})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// =============================================================================
// UI bits
// =============================================================================

const LAYER_LABEL: Record<NonNullable<WeatherLayer>, string> = {
  wind: "Wind streamlines",
  rain: "Precipitation",
  snow: "Snowfall",
  thunder: "Lightning activity",
  temperature: "Temperature",
  clouds: "Cloud cover",
  pressure: "Pressure",
};

const LAYER_ICON: Record<NonNullable<WeatherLayer>, string> = {
  wind: "🌬️",
  rain: "🌧️",
  snow: "❄️",
  thunder: "⚡",
  temperature: "🌡️",
  clouds: "☁️",
  pressure: "📊",
};

const CARDINAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function degToCardinal(deg: number) {
  return CARDINAL[Math.round((deg % 360) / 45) % 8];
}

// =============================================================================
// Component
// =============================================================================

export function WeatherMap(props: WeatherMapProps) {
  const layer = props.layer ?? null;
  const zoom = clamp(props.zoom ?? 6, 1, 18);
  const height = props.height ?? "440px";
  const lat = props.latitude;
  const lon = props.longitude;

  const mapDivRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);

  // Animation speed controls. Stored in refs so changing the speed
  // doesn't tear down the animation loop — the tick reads .current
  // each frame.
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // -- Mount Leaflet map -------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let map: LeafletNS.Map | undefined;
    let marker: LeafletNS.Marker | undefined;
    let ro: ResizeObserver | undefined;
    let rafHandle = 0;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed) return;

      const container = mapDivRef.current;
      if (!container) return;

      // CRITICAL: the chat UI streams in, so the map container is often
      // 0×0 at the moment this effect runs. If we hand a 0×0 element to
      // Leaflet, it only loads one center tile and stays broken even
      // after the layout settles. Wait for real pixels first.
      let waitFrames = 0;
      while (!disposed && waitFrames < 120) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) break;
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        waitFrames++;
      }
      if (disposed) return;

      // Fix Leaflet's default marker icon URLs (they get broken by bundlers).
      const proto = L.Icon.Default.prototype as unknown as {
        _getIconUrl?: () => string;
      };
      delete proto._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      map = L.map(container, {
        center: [lat, lon],
        zoom,
        // Disable the default top-left zoom — we add our own at bottom-right
        // so the top of the map is reserved for the layer badge and speed
        // controls.
        zoomControl: false,
        scrollWheelZoom: true,
        worldCopyJump: true,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      // Move the attribution to bottom-left so it doesn't stack with the
      // zoom buttons.
      map.attributionControl.setPosition("bottomleft");

      // ESRI World Imagery — free satellite basemap, no API key.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution:
            "Tiles &copy; Esri — Source: Esri, Maxar, GeoEye, Earthstar Geographics",
        },
      ).addTo(map);

      // Transparent labels overlay so city/place names are visible on top
      // of the satellite imagery (matches the Windy look).
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          opacity: 0.9,
          attribution: "",
        },
      ).addTo(map);

      marker = L.marker([lat, lon]).addTo(map);
      if (props.label) marker.bindPopup(props.label);

      mapRef.current = map;

      // Belt-and-braces: call invalidateSize every animation frame for the
      // first 30 frames (~500ms). The first call after mount is essential;
      // the rest catch any late layout shifts from the streaming chat.
      let frame = 0;
      const tick = () => {
        if (disposed || !map) return;
        map.invalidateSize();
        if (frame++ < 30) {
          rafHandle = requestAnimationFrame(tick);
        }
      };
      rafHandle = requestAnimationFrame(tick);

      // ResizeObserver to catch any later size changes (window resize, chat
      // scroll, more streaming content above).
      ro = new ResizeObserver(() => {
        map?.invalidateSize();
      });
      ro.observe(container);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafHandle);
      if (ro) ro.disconnect();
      if (marker) marker.remove();
      if (map) map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, zoom]);

  // -- Canvas animation loop ---------------------------------------------
  useEffect(() => {
    if (!layer) return;
    const canvas = canvasRef.current;
    const mapDiv = mapDivRef.current;
    if (!canvas || !mapDiv) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let state: AnimationState = {
      particles: [],
      clouds: [],
      lightning: null,
      lastFlash: 0,
    };

    const resize = () => {
      const rect = mapDiv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = {
        particles: initParticles(layer, rect.width, rect.height),
        clouds: initClouds(layer, rect.width, rect.height),
        lightning: null,
        lastFlash: 0,
      };
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(mapDiv);

    // When the user pans/zooms the Leaflet map, clear the canvas so trails
    // don't get smeared at the wrong location.
    const clearOnMapMove = () => {
      const rect = mapDiv.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    };
    const map = mapRef.current;
    if (map) {
      map.on("movestart", clearOnMapMove);
      map.on("zoomstart", clearOnMapMove);
    }

    const windSpeed = props.windSpeedKmh ?? 18;
    const windDir = props.windDirectionDeg ?? 270;
    const precip = props.precipitationMm ?? (layer === "rain" ? 5 : 2);
    const tempC = props.temperatureC ?? 22;
    const lightningActive = props.lightningActive ?? false;

    // Approximate radius of the "weather cell" in km. Real precipitation
    // cells are ~30-80 km; thunderstorm complexes can be much larger.
    const cellRadiusKm =
      layer === "thunder"
        ? 140
        : layer === "temperature"
          ? 90
          : layer === "pressure"
            ? 110
            : 60; // rain, snow

    /**
     * Compute the pin's screen position and the cell radius in pixels
     * by asking Leaflet to project lat/lon. Updates every frame so the
     * effect stays pinned to the geographic location as the user pans
     * or zooms.
     */
    const computeCell = (rectW: number, rectH: number) => {
      const m = mapRef.current;
      if (!m) {
        return {
          cx: rectW / 2,
          cy: rectH / 2,
          r: Math.min(rectW, rectH) * 0.35,
        };
      }
      try {
        const pt = m.latLngToContainerPoint([lat, lon]);
        // Walk ~1 degree north to find the pixel distance for cellRadiusKm.
        // 1° latitude ≈ 111 km regardless of longitude.
        const offset = m.latLngToContainerPoint([lat + 1, lon]);
        const pxPerKm = Math.abs(pt.y - offset.y) / 111;
        const r = Math.max(35, cellRadiusKm * pxPerKm);
        return { cx: pt.x, cy: pt.y, r };
      } catch {
        return {
          cx: rectW / 2,
          cy: rectH / 2,
          r: Math.min(rectW, rectH) * 0.35,
        };
      }
    };

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // When paused, keep the RAF loop alive (so we resume instantly) but
      // skip drawing entirely — that freezes the last painted frame on
      // the canvas instead of fading it out.
      if (pausedRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const rect = mapDiv.getBoundingClientRect();
      const d: DrawCtx = {
        ctx,
        w: rect.width,
        h: rect.height,
        time: now - start,
        speed: speedRef.current,
      };
      const cell = computeCell(rect.width, rect.height);

      switch (layer) {
        case "wind":
          // Wind is a large-scale field — Windy shows it across the whole
          // visible map too. Stays unmasked.
          drawWind(d, state, windSpeed, windDir);
          break;
        case "rain":
          drawRain(d, state, precip, windDir);
          applyLocationMask(
            ctx,
            rect.width,
            rect.height,
            cell.cx,
            cell.cy,
            cell.r,
          );
          break;
        case "snow":
          drawSnow(d, state, precip, windDir);
          applyLocationMask(
            ctx,
            rect.width,
            rect.height,
            cell.cx,
            cell.cy,
            cell.r,
          );
          break;
        case "thunder":
          drawThunder(
            d,
            state,
            lightningActive,
            windDir,
            cell.cx,
            cell.cy,
            cell.r,
          );
          applyLocationMask(
            ctx,
            rect.width,
            rect.height,
            cell.cx,
            cell.cy,
            cell.r,
          );
          break;
        case "temperature":
          drawTemperature(d, tempC, cell.cx, cell.cy, cell.r);
          break;
        case "clouds":
          drawClouds(d, state);
          applyLocationMask(
            ctx,
            rect.width,
            rect.height,
            cell.cx,
            cell.cy,
            cell.r,
          );
          break;
        case "pressure":
          drawPressure(d, cell.cx, cell.cy, cell.r);
          break;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (map) {
        map.off("movestart", clearOnMapMove);
        map.off("zoomstart", clearOnMapMove);
      }
    };
  }, [
    layer,
    lat,
    lon,
    props.windSpeedKmh,
    props.windDirectionDeg,
    props.precipitationMm,
    props.temperatureC,
    props.lightningActive,
    props.intensity,
  ]);

  // -- Render ------------------------------------------------------------
  return (
    <div
      className="relative w-full rounded-lg overflow-hidden border border-border bg-[#0b1220]"
      style={{ height }}
    >
      {/* Subtle loading shimmer that shows until Leaflet's tile pane paints
          on top of it. No z-index so Leaflet's own panes interleave correctly
          with the animation canvas (tiles=200 < canvas=500 < markers=600 <
          controls=800 < chips=1000). */}
      <div
        className="absolute inset-0 flex items-center justify-center text-white/40 text-xs font-mono"
        style={{ zIndex: 1 }}
        aria-hidden
      >
        Loading satellite imagery…
      </div>

      {/* Real interactive Leaflet map — pan, zoom, scroll, double-click.
          No z-index here on purpose so Leaflet's internal panes
          (tilePane=200, markerPane=600, controlPane=800) participate in
          the parent stacking context. */}
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* Animation canvas — sits ON TOP of the map. pointer-events:none lets
          you still drag / scroll the map underneath. */}
      {layer && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-500 pointer-events-none"
        />
      )}

      {/* Layer badge */}
      {layer && (
        <div className="absolute top-2 left-2 z-1000 bg-black/65 backdrop-blur-sm px-2.5 py-1 rounded text-xs font-semibold border border-white/15 flex items-center gap-1.5 text-white shadow-sm">
          <span>{LAYER_ICON[layer]}</span>
          <span>{LAYER_LABEL[layer]}</span>
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-white/70 font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        </div>
      )}

      {/* Speed controls — pause + speed presets. Sits at top center so it
          stays clear of the badges, data chip, and the new bottom-right
          zoom controls. */}
      {layer && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-1000 bg-black/65 backdrop-blur-sm rounded border border-white/15 shadow-sm flex items-center text-white overflow-hidden">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="px-2.5 py-1 text-xs font-semibold hover:bg-white/15 transition-colors flex items-center gap-1"
            title={paused ? "Resume animation" : "Pause animation"}
          >
            <span aria-hidden>{paused ? "▶" : "⏸"}</span>
            <span className="text-[10px] tracking-wider">
              {paused ? "PLAY" : "PAUSE"}
            </span>
          </button>
          <span className="w-px h-4 bg-white/20" />
          {[0.5, 1, 2, 4].map((s) => {
            const active = !paused && Math.abs(speed - s) < 0.01;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setPaused(false);
                  setSpeed(s);
                }}
                className={
                  "px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors " +
                  (active
                    ? "bg-white/25 text-white"
                    : "text-white/70 hover:bg-white/15 hover:text-white")
                }
                title={`Set speed to ${s}×`}
              >
                {s}×
              </button>
            );
          })}
        </div>
      )}

      {/* Data summary chip (top right) */}
      {layer && (
        <div className="absolute top-2 right-2 z-1000 bg-black/65 backdrop-blur-sm px-2.5 py-1 rounded text-[11px] border border-white/15 text-white shadow-sm flex flex-col gap-0.5 font-mono">
          {layer === "wind" && (
            <span>
              {Math.round(props.windSpeedKmh ?? 0)} km/h{" "}
              <span className="text-white/70">
                {degToCardinal(props.windDirectionDeg ?? 0)}
              </span>
            </span>
          )}
          {(layer === "rain" || layer === "snow") && (
            <span>{(props.precipitationMm ?? 0).toFixed(1)} mm</span>
          )}
          {layer === "thunder" && (
            <span>
              {props.lightningActive ? "Active strikes" : "Monitoring"}
            </span>
          )}
          {layer === "temperature" && (
            <span>{Math.round(props.temperatureC ?? 0)}°C</span>
          )}
        </div>
      )}

      {/* Label — lifted off the bottom edge so it sits above Leaflet's
          attribution bar (now at bottom-left). */}
      {props.label && (
        <div className="absolute bottom-8 left-2 z-1000 bg-black/65 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium border border-white/15 text-white shadow-sm">
          📍 {props.label}
        </div>
      )}
    </div>
  );
}
