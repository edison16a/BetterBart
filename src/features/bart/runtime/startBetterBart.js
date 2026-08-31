import {
  AT,
  H,
  P,
  P0,
  PXKM,
  W,
  X,
  Y,
  hopMin,
  kmBetween,
  tname,
} from "@/features/bart/core/geometry";
import { centeredMapView, pointMapView } from "@/features/bart/core/camera";
import { IDX, route } from "@/features/bart/core/routing";
import { LINES, LN, ST } from "@/features/bart/data/network";
import { createMapScene } from "./createMapScene.js";
import { createTrainSimulator, TRAIN_SPEED } from "./createTrainSimulator.js";

/**
 * Starts the BetterBART interaction model against the React-owned DOM.
 *
 * This initializer coordinates the mutable SVG scene, animation, pointer
 * capture, geolocation, and live timing. Pure data, geometry, and route finding
 * remain in separate modules so they can evolve independently.
 *
 * @returns {void}
 */
export function startBetterBart() {
  const mapElement = document.getElementById("map");
  if (!(mapElement instanceof SVGSVGElement) || mapElement.dataset.bartReady === "true") return;
  mapElement.dataset.bartReady = "true";

  const svg = mapElement;
  const { el, world, gRoute, gSt, gLbl, gDrag, stEls } = createMapScene(svg);

  /* ---------- your location (blue dot) ---------- */
  const gLoc = el("g", { opacity: 0, "pointer-events": "none" }, world);
  const locAcc = el(
    "circle",
    { fill: "#0079C1", opacity: 0.12, stroke: "#0079C1", "stroke-opacity": 0.3, "stroke-width": 1 },
    gLoc,
  );
  const locPulse = el(
    "circle",
    { class: "pulse", r: 9, fill: "none", stroke: "#0079C1", "stroke-width": 2 },
    gLoc,
  );
  const locDot = el(
    "circle",
    {
      r: 5,
      fill: "#0079C1",
      stroke: "#fff",
      "stroke-width": 2.5,
      "pointer-events": "auto",
      style: "cursor:pointer",
    },
    gLoc,
  );
  let myPos = null;
  function nearestStation() {
    let best = null,
      bd = 1e18;
    for (const id in P0) {
      const d = Math.hypot(P0[id].x - myPos.x, P0[id].y - myPos.y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }
  function showLoc(lat, lon, acc) {
    const x = X(lon),
      y = Y(lat);
    myPos = { x, y };
    const inMap = x >= 0 && x <= W && y >= 0 && y <= H;
    gLoc.setAttribute("opacity", inMap ? 1 : 0);
    const r = Math.max(9, Math.min(90, ((acc || 100) * PXKM) / 1000)); /* metres -> map px */
    [locAcc, locPulse, locDot].forEach((c) => {
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
    });
    locAcc.setAttribute("r", r);
    return inMap;
  }
  locDot.addEventListener("click", (e) => {
    e.stopPropagation();
    if (myPos) tapStation(nearestStation());
  });
  locDot.addEventListener("pointerdown", (e) => e.stopPropagation());
  function startLocate() {
    if (!("geolocation" in navigator)) return;
    let first = true;
    navigator.geolocation.watchPosition(
      (p) => {
        const inMap = showLoc(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
        if (first) {
          first = false;
          if (inMap) {
            flyToPoint(myPos, 280, 0.5);
            if (!document.body.classList.contains("m")) {
              toast(`You're near ${ST[nearestStation()].n} — tap the blue dot to start there`);
            }
          } else {
            focusMapCenter();
          }
        }
        if (inMap) autoAdvance(); /* your position drives the trip forward */
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    );
  }
  startLocate(); /* automatic — the dot appears as soon as the browser grants location */

  /* ================= VIEWBOX PAN / ZOOM ================= */
  let vb = { x: 0, y: 0, w: W, h: H };
  function applyVB() {
    vb.x = Math.min(Math.max(vb.x, -vb.w * 0.55), W - vb.w * 0.45);
    vb.y = Math.min(Math.max(vb.y, -vb.h * 0.55), H - vb.h * 0.45);
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }
  function focusMapCenter() {
    const viewport = svg.getBoundingClientRect();
    flyVB(
      centeredMapView({
        mapWidth: W,
        mapHeight: H,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      }),
    );
  }
  function clientToWorld(cx, cy) {
    const r = svg.getBoundingClientRect();
    const sc = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = (r.width - vb.w / sc) / 2,
      oy = (r.height - vb.h / sc) / 2;
    return { x: vb.x + (cx - r.left - ox) * sc, y: vb.y + (cy - r.top - oy) * sc, sc };
  }
  function zoomAt(cx, cy, f) {
    const w0 = clientToWorld(cx, cy);
    const nw = Math.min(Math.max(vb.w / f, 100), W * 1.7),
      k = nw / vb.w;
    vb = { x: w0.x - (w0.x - vb.x) * k, y: w0.y - (w0.y - vb.y) * k, w: nw, h: vb.h * k };
    applyVB();
  }
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    },
    { passive: false },
  );
  let flyRAF = null;
  function flyVB(t, ms = 650) {
    cancelAnimationFrame(flyRAF);
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      vb = t;
      applyVB();
      return;
    }
    const f = { ...vb },
      t0 = performance.now();
    const tick = (now) => {
      let u = Math.min(1, (now - t0) / ms);
      u = 1 - Math.pow(1 - u, 3);
      vb = {
        x: f.x + (t.x - f.x) * u,
        y: f.y + (t.y - f.y) * u,
        w: f.w + (t.w - f.w) * u,
        h: f.h + (t.h - f.h) * u,
      };
      applyVB();
      if (u < 1) flyRAF = requestAnimationFrame(tick);
    };
    flyRAF = requestAnimationFrame(tick);
  }
  function flyToPoint(point, width = 280, verticalAnchor = 0.45) {
    const viewport = svg.getBoundingClientRect();
    flyVB(
      pointMapView({
        mapWidth: W,
        mapHeight: H,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        point,
        width,
        verticalAnchor,
      }),
    );
  }
  function flyToStation(id, width = 280) {
    flyToPoint(P[id], width);
  }

  /* ================= POINTER: pan / tap / drag-to-plan ================= */
  let ptr = null,
    pinch = null;
  const touches = new Map();
  gDrag.setAttribute("pointer-events", "none");
  const dragLine = el(
    "line",
    {
      stroke: "#E9EFF8",
      "stroke-width": 2,
      "stroke-dasharray": "3 6",
      opacity: 0,
      "stroke-linecap": "round",
    },
    gDrag,
  );
  const dragTip = el(
    "circle",
    { r: 5, fill: "none", stroke: "#E9EFF8", "stroke-width": 2, opacity: 0 },
    gDrag,
  );
  /* target-based lookup only works on pointerdown; after setPointerCapture all events
   retarget to the svg, so move/up must hit-test with elementFromPoint instead. */
  const stationFromTarget = (e) => {
    const g = e.target.closest ? e.target.closest(".station") : null;
    return g ? g.getAttribute("data-id") : null;
  };
  const stationAt = (e) => {
    const n = document.elementFromPoint(e.clientX, e.clientY);
    const g = n && n.closest ? n.closest(".station") : null;
    return g ? g.getAttribute("data-id") : null;
  };
  function cancelGesture() {
    svg.classList.remove("panning", "linking");
    dragLine.setAttribute("opacity", 0);
    dragTip.setAttribute("opacity", 0);
    ptr = null;
  }
  svg.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      cancelGesture();
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (touches.size > 2) return;
    const sid = stationFromTarget(e);
    ptr = {
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      startVB: { ...vb },
      fromId: sid,
      mode: sid ? "link" : "pan",
    };
    if (!sid) svg.classList.add("panning");
  });
  svg.addEventListener("pointermove", (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      if (d > 1 && pinch.d > 1) zoomAt(mx, my, d / pinch.d);
      const r = svg.getBoundingClientRect(),
        sc = Math.max(vb.w / r.width, vb.h / r.height);
      vb = { ...vb, x: vb.x - (mx - pinch.mx) * sc, y: vb.y - (my - pinch.my) * sc };
      applyVB();
      pinch = { d, mx, my };
      return;
    }
    if (!ptr) {
      hoverStation(stationFromTarget(e), e);
      return;
    }
    const dx = e.clientX - ptr.sx,
      dy = e.clientY - ptr.sy;
    if (Math.hypot(dx, dy) > 6) ptr.moved = true;
    if (ptr.mode === "pan") {
      const r = svg.getBoundingClientRect(),
        sc = Math.max(vb.w / r.width, vb.h / r.height);
      vb = { ...vb, x: ptr.startVB.x - dx * sc, y: ptr.startVB.y - dy * sc };
      applyVB();
    } else {
      svg.classList.add("linking");
      const a = P[ptr.fromId],
        w = clientToWorld(e.clientX, e.clientY),
        over = stationAt(e);
      const end = over && over !== ptr.fromId ? P[over] : w;
      dragLine.setAttribute("x1", a.x);
      dragLine.setAttribute("y1", a.y);
      dragLine.setAttribute("x2", end.x);
      dragLine.setAttribute("y2", end.y);
      dragLine.setAttribute("opacity", ptr.moved ? 0.8 : 0);
      dragTip.setAttribute("cx", end.x);
      dragTip.setAttribute("cy", end.y);
      dragTip.setAttribute("opacity", ptr.moved && over && over !== ptr.fromId ? 1 : 0);
      if (ptr.moved) hoverStation(over, e);
    }
  });
  function endPtr(e) {
    touches.delete(e.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      cancelGesture();
      return;
    }
    if (!ptr) return;
    const wasDrag = ptr.moved,
      from = ptr.fromId;
    cancelGesture();
    const over = stationAt(e) || stationFromTarget(e);
    if (from) {
      if (wasDrag && over && over !== from) {
        setTrip(from, over);
        return;
      }
      if (!wasDrag) {
        tapStation(from);
        return;
      }
    }
  }
  svg.addEventListener("pointerup", endPtr);
  svg.addEventListener("pointercancel", (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    cancelGesture();
  });
  svg.addEventListener("pointerleave", () => hoverStation(null));
  svg.addEventListener("dblclick", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, 1.7);
  });

  const tip = document.getElementById("tip");
  function hoverStation(id, e) {
    if (!id || document.body.classList.contains("m")) {
      tip.style.display = "none";
      return;
    }
    tip.innerHTML = `<div class="t">${ST[id].n}</div><div class="s">${AT[id].length} line${AT[id].length > 1 ? "s" : ""}</div>
    <div class="pips" style="margin-top:3px">${AT[id].map((l) => `<span class="pip" style="background:${LN[l].color}"></span>`).join("")}</div>`;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
    tip.style.display = "block";
  }
  let toastT = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ================= ROUTING ================= */
  /* ================= TRAINS (simulated · 1 real second ≈ 1 transit minute) ================= */
  const { GEOM, trains, advance, nextETA } = createTrainSimulator();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    advance(dt);
    if (trip && trip.chev && trip.chev.length) {
      if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches))
        trip.phase += dt * 26;
      for (const c of trip.chev) {
        const s2 = (c.off + trip.phase) % c.g.len;
        const p = legAt(c.g, s2);
        c.el.setAttribute(
          "transform",
          `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${p.ang.toFixed(1)})`,
        );
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ================= SELECTION & TRIP ================= */
  let sel = { a: null, b: null },
    trip = null,
    panelClosed = false,
    stepIdx = 0,
    departureStation = null,
    departuresExpanded = false;

  const ina = document.getElementById("ina"),
    inb = document.getElementById("inb");
  function tapStation(id) {
    if (!sel.a || (sel.a && sel.b)) {
      clearTrip();
      sel = { a: id, b: null };
      panelClosed = false;
      syncSel();
    } else if (id === sel.a) {
      panelClosed = false;
      refreshPanel();
    } /* same station: just show its arrivals */
    else {
      sel.b = id;
      syncSel();
      plan();
    }
  }
  function setTrip(a, b) {
    clearTrip();
    sel = { a, b };
    syncSel();
    plan();
  }
  function syncSel() {
    ina.value = sel.a ? ST[sel.a].n : "";
    inb.value = sel.b ? ST[sel.b].n : "";
    document.getElementById("flda").classList.toggle("filled", !!sel.a);
    document.getElementById("fldb").classList.toggle("filled", !!sel.b);
    refreshPanel();
  }

  /* ================= SEARCH ================= */
  function wireSearch(input, ddId, slot) {
    const dd = document.getElementById(ddId);
    const list = (q) => {
      q = q.trim().toLowerCase();
      const ids = Object.keys(ST).filter((id) => ST[id].n.toLowerCase().includes(q));
      dd.innerHTML =
        ids
          .slice(0, 12)
          .map(
            (id) =>
              `<button data-id="${id}"><span>${ST[id].n}</span><span class="pips">${AT[id].map((l) => `<span class="pip" style="background:${LN[l].color}"></span>`).join("")}</span></button>`,
          )
          .join("") ||
        `<button disabled style="color:var(--faint)">No station matches “${q}”</button>`;
      dd.classList.add("open");
    };
    input.addEventListener("input", () => list(input.value));
    input.addEventListener("focus", () => list(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const b = dd.querySelector("button[data-id]");
        if (b) pick(b.getAttribute("data-id"));
      }
      if (e.key === "Escape") dd.classList.remove("open");
    });
    dd.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("button[data-id]");
      if (b) {
        e.preventDefault();
        pick(b.getAttribute("data-id"));
      }
    });
    input.addEventListener("blur", () => setTimeout(() => dd.classList.remove("open"), 120));
    function pick(id) {
      dd.classList.remove("open");
      input.blur();
      clearRouteOnly();
      sel[slot] = id;
      if (sel.a === sel.b) sel[slot === "a" ? "b" : "a"] = null;
      syncSel();
      if (sel.a && sel.b) plan();
      else if (slot === "a") flyToStation(id, 420);
    }
  }
  wireSearch(ina, "dda", "a");
  wireSearch(inb, "ddb", "b");
  document.querySelectorAll(".clr").forEach((b) =>
    b.addEventListener("click", () => {
      clearRouteOnly();
      sel[b.dataset.clr] = null;
      syncSel();
    }),
  );
  document.getElementById("swap").addEventListener("click", () => {
    if (!sel.a && !sel.b) return;
    clearRouteOnly();
    sel = { a: sel.b, b: sel.a };
    syncSel();
    if (sel.a && sel.b) plan();
  });
  document.getElementById("reset").addEventListener("click", () => clearTrip());
  /* draggable bottom sheet: pull down to dismiss */
  {
    const grab = document.getElementById("grab");
    let drag = null;
    const start = (e) => {
      drag = { y: e.clientY, ty: 0 };
      panel.style.transition = "none";
      grab.setPointerCapture && grab.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!drag) return;
      drag.ty = Math.max(0, e.clientY - drag.y);
      panel.style.transform = `translateY(${drag.ty}px)`;
    };
    const end = () => {
      if (!drag) return;
      panel.style.transition = "transform .22s ease";
      if (drag.ty > 90) {
        panel.style.transform = `translateY(110%)`;
        setTimeout(() => {
          panel.style.transform = "";
          panel.style.transition = "";
          panelClosed = true;
          refreshPanel();
        }, 200);
      } else {
        panel.style.transform = "";
        setTimeout(() => (panel.style.transition = ""), 240);
      }
      drag = null;
    };
    grab.addEventListener("pointerdown", start);
    grab.addEventListener("pointermove", move);
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  }

  /* ================= PLAN + PANEL ================= */
  const fmtMin = (m) => Math.max(1, Math.round(m));
  const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  function fare(a, b) {
    let f = 2.45 + 0.216 * kmBetween(a, b);
    if (a === "SFIA" || b === "SFIA") f += 4.95;
    if (a === "OAKL" || b === "OAKL") f += 6.7;
    return "$" + (Math.round(f * 20) / 20).toFixed(2);
  }
  function clearRouteOnly() {
    trip = null;
    panelClosed = false;
    stepIdx = 0;
    gRoute.innerHTML = "";
    svg.classList.remove("routing");
    gSt.querySelectorAll(".on-route").forEach((e) => e.classList.remove("on-route"));
    gLbl.querySelectorAll(".on-route").forEach((e) => e.classList.remove("on-route"));
    refreshPanel();
  }
  function clearTrip() {
    clearRouteOnly();
    departureStation = null;
    departuresExpanded = false;
    sel = { a: null, b: null };
    syncSel();
  }

  function plan() {
    const legs = route(sel.a, sel.b);
    if (!legs) {
      toast("No route found between those stations");
      return;
    }
    trip = { legs, a: sel.a, b: sel.b };
    trip.ride = legs.reduce((s, l) => s + l.mins, 0);
    trip.xfers = legs.length - 1;
    trip.total = trip.ride + trip.xfers * 5;
    trip.steps = [];
    legs.forEach((l, i) => {
      trip.steps.push({ t: "board", leg: i });
      trip.steps.push({ t: "ride", leg: i });
    });
    trip.steps.push({ t: "arrive" });
    stepIdx = 0;
    drawRoute(legs);
    panelClosed = false;
    refreshPanel();
    const xs = [],
      ys = [];
    legs.forEach((l) =>
      l.sts.forEach((s) => {
        xs.push(P[s].x);
        ys.push(P[s].y);
      }),
    );
    const pad = 64,
      x0 = Math.min(...xs) - pad,
      y0 = Math.min(...ys) - pad,
      x1 = Math.max(...xs) + pad,
      y1 = Math.max(...ys) + pad;
    flyVB({ x: x0, y: y0, w: Math.max(220, x1 - x0), h: Math.max(220, y1 - y0) });
  }
  function legAt(g, s2) {
    s2 = Math.max(0, Math.min(g.len, s2));
    let i = 1;
    while (i < g.cum.length - 1 && g.cum[i] < s2) i++;
    const t = (s2 - g.cum[i - 1]) / (g.cum[i] - g.cum[i - 1] || 1),
      a = g.pts[i - 1],
      b = g.pts[i];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }
  function drawRoute(legs) {
    gRoute.innerHTML = "";
    svg.classList.add("routing");
    trip.geo = [];
    trip.chev = [];
    trip.phase = 0;
    legs.forEach((l) => {
      const pts = l.sts.map((s) => P[s]),
        cum = [0];
      for (let i = 1; i < pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      trip.geo.push({ pts, cum, len: cum[cum.length - 1], color: LN[l.line].color });
      const d = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
      el(
        "path",
        {
          d,
          fill: "none",
          stroke: "#fff",
          "stroke-width": 12,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        gRoute,
      );
      el(
        "path",
        {
          d,
          fill: "none",
          stroke: LN[l.line].color,
          "stroke-width": 7,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        gRoute,
      );
      l.sts.forEach((s2) => {
        stEls[s2].classList.add("on-route");
        const lb = gLbl.querySelector(`[data-id="${CSS.escape(s2)}"]`);
        if (lb) lb.classList.add("on-route");
      });
    });
    /* gradient blend where the trip changes lines */
    for (let i = 0; i < trip.geo.length - 1; i++) {
      const gA = trip.geo[i],
        gB = trip.geo[i + 1];
      const la = Math.min(20, gA.len * 0.45),
        lb = Math.min(20, gB.len * 0.45);
      const p1 = legAt(gA, gA.len - la),
        pm = gA.pts[gA.pts.length - 1],
        p2 = legAt(gB, lb);
      const gid = "lg" + i;
      const lg = el(
        "linearGradient",
        { id: gid, gradientUnits: "userSpaceOnUse", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
        gRoute,
      );
      el("stop", { offset: "0%", "stop-color": gA.color }, lg);
      el("stop", { offset: "100%", "stop-color": gB.color }, lg);
      el(
        "path",
        {
          d: `M${p1.x} ${p1.y}L${pm.x} ${pm.y}L${p2.x} ${p2.y}`,
          fill: "none",
          stroke: `url(#${gid})`,
          "stroke-width": 7,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        gRoute,
      );
    }
    /* flowing direction arrows, origin -> destination */
    trip.geo.forEach((g) => {
      const n = Math.max(1, Math.floor(g.len / 30));
      for (let i = 0; i < n; i++) {
        const c = el(
          "path",
          {
            d: "M0 -3.5 A3.5 3.5 0 0 1 0 3.5",
            fill: "none",
            stroke: "#fff",
            "stroke-width": 2.4,
            "stroke-linecap": "round",
          },
          gRoute,
        );
        trip.chev.push({ g, el: c, off: i * (g.len / n) });
      }
    });
  }

  /* ---------- panel content: departures OR trip steps ---------- */
  const panel = document.getElementById("panel"),
    pbody = document.getElementById("pbody"),
    ptitle = document.getElementById("ptitle"),
    resume = document.getElementById("resume");
  document.getElementById("pclose").addEventListener("click", () => {
    panelClosed = true;
    refreshPanel();
  });
  resume.addEventListener("click", () => {
    panelClosed = false;
    refreshPanel();
  });
  function refreshPanel() {
    const has = trip || sel.a;
    if (!has) {
      panel.classList.remove("show");
      resume.classList.remove("show");
      return;
    }
    if (panelClosed) {
      panel.classList.remove("show");
      document.getElementById("resumelbl").textContent = trip ? "Trip" : "Departures";
      resume.classList.add("show");
      return;
    }
    resume.classList.remove("show");
    panel.classList.add("show");
    if (trip) renderTripPanel();
    else renderDepsPanel();
  }
  function computeDeps() {
    const rows = [];
    for (const lid of AT[sel.a]) {
      const L = LN[lid],
        g = GEOM[lid],
        s0 = g.cum[IDX[lid][sel.a]];
      for (const t of trains) {
        if (t.line !== lid) continue;
        let d = null,
          toward = null;
        if (t.dir > 0 && t.s <= s0 - 0.5) {
          d = s0 - t.s;
          toward = tname(L.sts[L.sts.length - 1]);
        }
        if (t.dir < 0 && t.s >= s0 + 0.5) {
          d = t.s - s0;
          toward = tname(L.sts[0]);
        }
        if (d !== null) {
          const m = d / TRAIN_SPEED;
          if (m < 75) rows.push({ m, lid, toward, t, dep: new Date(Date.now() + m * 60000) });
        }
      }
    }
    rows.sort((a, b) => a.m - b.m);
    return rows;
  }
  /* the hero segment: from the station the train last passed to the selected one */
  function heroInfo(r) {
    const g = GEOM[r.t.line],
      i = IDX[r.t.line][sel.a],
      s0 = g.cum[i];
    const iPrev = r.t.dir > 0 ? i - 1 : i + 1;
    const S = LN[r.t.line].sts;
    const prevId = S[iPrev] !== undefined ? S[iPrev] : S[i];
    const segLen =
      Math.abs(s0 - g.cum[iPrev !== undefined && S[iPrev] !== undefined ? iPrev : i]) || 1;
    const remain = Math.abs(s0 - r.t.s);
    const frac =
      1 - Math.min(remain, segLen) / segLen; /* 0 = at previous station, 1 = arriving here */
    return { prevId, frac };
  }
  const heroX = (f) => 52 + f * 408; /* keep the train clear of both station dots */
  const depSig = (rows) =>
    rows.map((r) => r.lid + r.toward + Math.round(r.m)).join("|") +
    (rows[0] ? ":" + heroInfo(rows[0]).prevId : "");
  let curSig = "";
  function capsules(r) {
    return `<span class="caps"><span class="cap" style="background:${LN[r.lid].color}">${r.m < 1 ? "Now" : Math.round(r.m) + " min"}</span><span class="cap t">${clock(r.dep)}</span></span>`;
  }
  function renderDepsPanel() {
    if (departureStation !== sel.a) {
      departureStation = sel.a;
      departuresExpanded = false;
    }

    ptitle.textContent = ST[sel.a].n;
    const rows = computeDeps();
    curSig = depSig(rows);
    if (!rows.length) {
      pbody.innerHTML = `<div class="ghost">No upcoming trains.</div>`;
      return;
    }
    const h = rows[0],
      hc = LN[h.lid].color,
      hi = heroInfo(h);
    const visibleRows = departuresExpanded ? rows : rows.slice(0, 3);
    pbody.innerHTML =
      `
    <div class="hero">
      <div class="herotop">
        <span class="linepill" style="background:${hc}">${h.toward} train</span>
        <span class="caps"><span class="cap" id="capmin" style="background:${hc}">${h.m < 1 ? "Now" : Math.round(h.m) + " min"}</span><span class="cap t" id="captime">${clock(h.dep)}</span></span>
      </div>
      <svg class="herosvg" viewBox="0 0 520 104" preserveAspectRatio="xMidYMid meet">
        <line x1="24" y1="52" x2="496" y2="52" stroke="#3A4557" stroke-width="6" stroke-linecap="round"/>
        <circle cx="24" cy="52" r="9" fill="var(--card)" stroke="#66788D" stroke-width="3.4"/>
        <circle cx="496" cy="52" r="10" fill="#fff" stroke="#10151E" stroke-width="4.4"/>
        <text x="24" y="86" text-anchor="start" font-size="15" font-weight="600" fill="#9FB0C3">${ST[hi.prevId].n}</text>
        <text x="496" y="86" text-anchor="end" font-size="15" font-weight="700" fill="#E9EFF8">${ST[sel.a].n}</text>
        <g id="herotrain" style="transition:transform 1s linear" transform="translate(${heroX(hi.frac).toFixed(1)},52)">
          <rect x="-26" y="-12" width="52" height="24" rx="8" fill="${hc}" stroke="#fff" stroke-width="3"/>
          <rect x="-17" y="-5.5" width="9" height="11" rx="2.6" fill="#10151E" opacity=".55"/>
          <rect x="-3" y="-5.5" width="9" height="11" rx="2.6" fill="#10151E" opacity=".55"/>
          <circle cx="20.5" cy="0" r="3" fill="#fff"/>
        </g>
      </svg>
    </div>` +
      visibleRows
        .slice(1)
        .map(
          (r) => `
    <div class="dep">
      <span class="swatch" style="background:${LN[r.lid].color}"></span>
      <span class="to">${r.toward} train</span>
      ${capsules(r)}
    </div>`,
        )
        .join("") +
      (!departuresExpanded && rows.length > 3
        ? `<button class="showmore" id="showmoredeps" aria-expanded="false">Show more</button>`
        : "");

    document.getElementById("showmoredeps")?.addEventListener("click", () => {
      departuresExpanded = true;
      renderDepsPanel();
    });
  }
  function tickDeps() {
    const rows = computeDeps();
    if (depSig(rows) !== curSig) {
      renderDepsPanel();
      return;
    }
    if (!rows.length) return;
    const hi = heroInfo(rows[0]);
    const tr = document.getElementById("herotrain");
    if (tr) tr.setAttribute("transform", `translate(${heroX(hi.frac).toFixed(1)},52)`);
    const cm = document.getElementById("capmin"),
      ct = document.getElementById("captime");
    if (cm) cm.textContent = rows[0].m < 1 ? "Now" : Math.round(rows[0].m) + " min";
    if (ct) ct.textContent = clock(rows[0].dep);
  }

  /* ---------- trip: whole plan at a glance, minimal words ---------- */
  function legMinFrom(leg, fromIdx) {
    let m = 0;
    for (let i = fromIdx; i < leg.sts.length - 1; i++) m += hopMin(leg.sts[i], leg.sts[i + 1]);
    return m;
  }
  function nearestWithin(px) {
    if (!myPos) return null;
    let best = null,
      bd = 1e18;
    for (const id in P0) {
      const d = Math.hypot(P0[id].x - myPos.x, P0[id].y - myPos.y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return bd <= px ? best : null;
  }
  function renderStepLine() {
    const box = document.getElementById("stepline"),
      btn = document.getElementById("stepnext");
    if (!box || !trip) return;
    const st = trip.steps[stepIdx];
    const cap = (txt, bg) =>
      `<span class="cap"${bg ? ` style="background:${bg}"` : ` `} ${bg ? "" : 'class="cap t"'}>${txt}</span>`;
    if (st.t === "arrive") {
      box.innerHTML = `You've arrived at <b>${ST[trip.b].n}</b> — nice ride.`;
      btn.textContent = "Done";
      return;
    }
    const leg = trip.legs[st.leg],
      hc = LN[leg.line].color;
    if (st.t === "board") {
      const eta = nextETA(leg.sts[0], leg.line, leg.dir);
      const dep = new Date(Date.now() + (eta || 3) * 60000);
      box.innerHTML = `Get on the <span class="linepill" style="background:${hc}">${leg.toward} train</span>
      in <span class="cap" style="background:${hc}">${eta !== null && eta < 1 ? "Now" : Math.round(eta || 3) + " min"}</span>
      or at <span class="cap t">${clock(dep)}</span>`;
    } else {
      let fromIdx = 0;
      const nid = nearestWithin(34);
      if (nid) {
        const k = leg.sts.indexOf(nid);
        if (k > 0) fromIdx = k;
      }
      const stops = leg.sts.length - 1 - fromIdx;
      const mins = legMinFrom(leg, fromIdx);
      const at = new Date(Date.now() + mins * 60000);
      const endN = ST[leg.sts[leg.sts.length - 1]].n;
      box.innerHTML = `Get off in <span class="cap" style="background:${hc}">${stops} stop${stops > 1 ? "s" : ""}</span>
      at <b>${endN}</b>
      in <span class="cap" style="background:${hc}">${fmtMin(mins)} min</span>
      or at <span class="cap t">${clock(at)}</span>`;
    }
    btn.textContent = "Next";
  }
  function derivedStep(nid) {
    if (!trip) return 0;
    let idx = 0;
    trip.legs.forEach((l, i) => {
      const k = l.sts.indexOf(nid);
      if (k > 0) {
        idx = Math.max(idx, i * 2 + 1);
        if (k === l.sts.length - 1) idx = Math.max(idx, i * 2 + 2);
      }
    });
    if (nid === trip.b) idx = trip.steps.length - 1;
    return Math.min(idx, trip.steps.length - 1);
  }
  function autoAdvance() {
    if (!trip) return;
    const nid = nearestWithin(34);
    if (!nid) return;
    const d2 = derivedStep(nid);
    if (d2 > stepIdx) {
      stepIdx = d2;
      renderTripPanel();
    }
  }
  function renderTripPanel() {
    ptitle.textContent = "Trip";
    const l0 = trip.legs[0];
    const eta = nextETA(trip.a, l0.line, l0.dir);
    const arr = new Date(Date.now() + ((eta || 3) + trip.total) * 60000);
    let rows = "";
    rows += `<div class="trow" data-st="${trip.a}"><span class="tlabel">${ST[trip.a].n}</span><span class="tmeta"><span class="chip g">now</span></span></div>`;
    trip.legs.forEach((l, i) => {
      const stops = l.sts.length - 1;
      rows += `<div class="trow" data-st="${l.sts[0]}">
      <span class="tlabel"><span class="linepill" style="background:${LN[l.line].color}">${l.toward} train</span></span>
      <span class="tmeta"><span class="chip">${stops} stop${stops > 1 ? "s" : ""}</span><span class="chip">${fmtMin(l.mins)} min</span></span></div>`;
      const end = l.sts[l.sts.length - 1];
      if (i < trip.legs.length - 1)
        rows += `<div class="trow" data-st="${end}"><span class="tlabel">${ST[end].n}</span><span class="tmeta"><span class="chip a">transfer</span></span></div>`;
    });
    rows += `<div class="trow" data-st="${trip.b}"><span class="tlabel">${ST[trip.b].n}</span><span class="tmeta"><span class="chip r">${clock(arr)}</span></span></div>`;
    pbody.innerHTML = `
    <div class="steprow"><div class="dirline" id="stepline"></div><button id="stepnext">Next</button></div>
    <div class="bigstats">
      <div><small>TOTAL TRIP</small><b>${fmtMin(trip.total)}<i>min</i></b></div>
      <div><small>ARRIVAL</small><b id="arrbig">${clock(arr)}</b></div>
    </div>
    <div class="tl">${rows}</div>`;
    document.getElementById("stepnext").addEventListener("click", () => {
      if (stepIdx >= trip.steps.length - 1) {
        clearTrip();
        focusMapCenter();
        return;
      }
      stepIdx++;
      renderTripPanel();
      const st = trip.steps[stepIdx];
      if (st.leg !== undefined) {
        const l = trip.legs[st.leg];
        flyToStation(st.t === "board" ? l.sts[0] : l.sts[l.sts.length - 1], 320);
      }
    });
    renderStepLine();
    updateLive();
  }
  pbody.addEventListener("click", (e) => {
    const r = e.target.closest(".trow");
    if (r && P[r.dataset.st]) flyToStation(r.dataset.st, 300);
  });
  function updateLive() {
    if (!trip) return;
    renderStepLine();
    const eta = nextETA(trip.legs[0].sts[0], trip.legs[0].line, trip.legs[0].dir);
    const a = document.getElementById("arrbig");
    if (a && eta !== null) a.textContent = clock(new Date(Date.now() + (eta + trip.total) * 60000));
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "Escape") clearTrip();
  });
  setInterval(() => {
    if (!panel.classList.contains("show")) return;
    if (trip) updateLive();
    else if (sel.a) tickDeps();
  }, 1000);

  /* ---------- legend ---------- */
  const legend = document.getElementById("legend");
  legend.innerHTML = LINES.map(
    (l) =>
      `<div class="leg" data-l="${l.id}"><span class="swatch" style="background:${l.color}"></span>${l.name}</div>`,
  ).join("");
  const hidden = new Set();
  legend.addEventListener("click", (e) => {
    const row = e.target.closest(".leg");
    if (!row) return;
    const lid = row.dataset.l;
    row.classList.toggle("off");
    if (hidden.has(lid)) hidden.delete(lid);
    else hidden.add(lid);
    svg.classList.toggle("hideline", hidden.size > 0);
    svg.querySelectorAll(".edge,.train").forEach((n) => {
      n.classList.toggle(
        "hidden-l",
        [...hidden].some((h) => n.classList.contains("e-" + h)),
      );
    });
  });

  /* ================= VIEW MODE: /mobile · /web (also #mobile · ?view=mobile) ================= */
  function detectForced() {
    const s = (location.pathname + " " + location.search + " " + location.hash).toLowerCase();
    if (/(^|[\/#=\s?])mobile\b/.test(s)) return "mobile";
    if (/(^|[\/#=\s?])(web|desktop)\b/.test(s)) return "web";
    return null;
  }
  let forced = detectForced();
  function isMobile() {
    return forced ? forced === "mobile" : window.matchMedia("(max-width: 720px)").matches;
  } /* responsive by default; explicit view routes override the breakpoint */
  function applyMode() {
    document.body.classList.toggle("m", isMobile());
  }
  window.addEventListener("resize", () => {
    if (!forced) applyMode();
  });
  window.addEventListener("hashchange", () => {
    forced = detectForced();
    applyMode();
  });
  applyMode();

  /* ---------- boot ---------- */
  focusMapCenter();
}
