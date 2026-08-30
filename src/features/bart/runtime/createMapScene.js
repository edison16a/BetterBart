import { H, P, W, X, Y, computeChains } from "../core/geometry.js";
import { LINES, LN, ST } from "../data/network.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Builds the static SVG map scene and returns the mutable layers used by the
 * interaction runtime.
 *
 * @param {SVGSVGElement} svg
 */
export function createMapScene(svg) {
  /* ================= SVG SCAFFOLD ================= */

  const NS = SVG_NAMESPACE;
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const world = el("g", {}, svg);
  const defs = el("defs", {}, svg);
  const clip = el("clipPath", { id: "mclip" }, defs);
  el("rect", { x: 0, y: 0, width: W, height: H, rx: 12 }, clip);
  const hp = el(
    "pattern",
    {
      id: "hatch",
      width: 34,
      height: 34,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)",
    },
    defs,
  );
  el("line", { x1: 0, y1: 0, x2: 0, y2: 34, stroke: "#151B25", "stroke-width": 13 }, hp);
  const gGeo = el("g", { "clip-path": "url(#mclip)" }, world),
    gRoads = el("g", { "clip-path": "url(#mclip)" }, world),
    gCity = el("g", { "clip-path": "url(#mclip)" }, world),
    gEdges = el("g", {}, world),
    gRoute = el("g", {}, world),
    gTrains = el("g", {}, world),
    gSel = el("g", {}, world),
    gSt = el("g", {}, world),
    gLbl = el("g", {}, world),
    gDrag = el("g", {}, world);
  const rr = (x, y, w2, h2, r) =>
    `M${x + r} ${y}H${x + w2 - r}A${r} ${r} 0 0 1 ${x + w2} ${y + r}V${y + h2 - r}A${r} ${r} 0 0 1 ${x + w2 - r} ${y + h2}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h2 - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  el(
    "path",
    {
      d: `M-2400 -2400H${W + 2400}V${H + 2400}H-2400Z ` + rr(0, 0, W, H, 12),
      "fill-rule": "evenodd",
      fill: "url(#hatch)",
      "pointer-events": "none",
    },
    world,
  );
  el(
    "rect",
    {
      x: 0.5,
      y: 0.5,
      width: W - 1,
      height: H - 1,
      rx: 12,
      fill: "none",
      stroke: "#333E4F",
      "stroke-width": 1.5,
    },
    world,
  );

  /* ---------- basemap: real-geography coastline, parks, bridges, freeways, city labels ---------- */
  const path = (pts, close) =>
    pts.map((p, i) => (i ? "L" : "M") + X(p[1]).toFixed(1) + " " + Y(p[0]).toFixed(1)).join(" ") +
    (close ? " Z" : "");
  /* Catmull-Rom -> cubic bezier for organic coastlines */
  function smooth(pts, close) {
    const n = pts.length,
      Q = pts.map((p) => [X(p[1]), Y(p[0])]);
    const at = (i) => Q[((i % n) + n) % n];
    const cl = (i) => Q[Math.max(0, Math.min(n - 1, i))];
    let d = "M" + at(0)[0].toFixed(1) + " " + at(0)[1].toFixed(1);
    const end = close ? n : n - 1;
    for (let i = 0; i < end; i++) {
      const p0 = close ? at(i - 1) : cl(i - 1),
        p1 = at(i),
        p2 = at(i + 1),
        p3 = close ? at(i + 2) : cl(i + 2);
      d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return close ? d + "Z" : d;
  }
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--land)" }, gGeo);
  /* pure gray field — water removed for maximum simplicity */
  /* Marin blob + islands (land over water) */

  /* ---------- BART track edges (parallel strands, transbay tube dashed) ---------- */
  const EDGE = {};
  LINES.forEach((l) => {
    for (let i = 0; i < l.sts.length - 1; i++) {
      const u = l.sts[i],
        v = l.sts[i + 1],
        k = [u, v].sort().join("|");
      if (!EDGE[k])
        EDGE[k] = { a: u, b: v, lines: [] }; /* keep the FIRST line's travel direction */
      EDGE[k].lines.push(l.id);
    }
  });
  /* per-corridor lane order: brute-force every permutation and keep the one
   with the fewest real geometric crossings where branches join the corridor */
  const EDGELANES = {};
  {
    const inter = (p1, p2, p3, p4) => {
      const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
      if (Math.abs(d) < 1e-9) return false;
      const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
      const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
      return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
    };
    const perms = (arr) =>
      arr.length <= 1
        ? [arr]
        : arr.flatMap((x, i) =>
            perms(arr.slice(0, i).concat(arr.slice(i + 1))).map((r) => [x, ...r]),
          );
    computeChains().forEach((c) => {
      const lset = EDGE[[c[0], c[1]].sort().join("|")].lines;
      const n = lset.length;
      const cont = {};
      lset.forEach((lid) => {
        const Lst = LN[lid].sts;
        const ia = Lst.indexOf(c[0]),
          ib = Lst.indexOf(c[c.length - 1]);
        const step = ib > ia ? 1 : -1;
        cont[lid] = { p: Lst[ia - step], q: Lst[ib + step] };
      });
      const lanePt = (u, v, i, sFromU) => {
        const dx = P[v].x - P[u].x,
          dy = P[v].y - P[u].y,
          len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len,
          ny = dx / len,
          off = (i - (n - 1) / 2) * 4.4;
        return {
          x: P[u].x + (dx * sFromU) / len + nx * off,
          y: P[u].y + (dy * sFromU) / len + ny * off,
        };
      };
      const lenLast = Math.hypot(
        P[c[c.length - 1]].x - P[c[c.length - 2]].x,
        P[c[c.length - 1]].y - P[c[c.length - 2]].y,
      );
      const cost = (order) => {
        let cnt = 0;
        const segsA = [],
          segsB = [];
        order.forEach((lid, i) => {
          if (cont[lid].p) segsA.push([lanePt(c[0], c[1], i, 14), P[cont[lid].p]]);
          if (cont[lid].q)
            segsB.push([
              lanePt(c[c.length - 2], c[c.length - 1], i, Math.max(1, lenLast - 14)),
              P[cont[lid].q],
            ]);
        });
        for (const S of [segsA, segsB])
          for (let i = 0; i < S.length; i++)
            for (let j = i + 1; j < S.length; j++)
              if (inter(S[i][0], S[i][1], S[j][0], S[j][1])) cnt++;
        return cnt;
      };
      /* NON-NEGOTIABLE: on the shared SF trunk, yellow/red ride NORTH of green/blue */
      const g1 = (() => {
        const dx = P[c[1]].x - P[c[0]].x,
          dy = P[c[1]].y - P[c[0]].y,
          l2 = Math.hypot(dx, dy) || 1;
        return { ny: dx / l2 };
      })();
      const northHigh = g1.ny < 0 ? 1 : -1; /* which end of the lane index axis points north */
      const trunk = lset.length === 4;
      const avg = (cand, ids2) => ids2.reduce((a, x) => a + cand.indexOf(x), 0) / ids2.length;
      const allowed = (cand) =>
        !trunk || (avg(cand, ["yellow", "red"]) - avg(cand, ["green", "blue"])) * northHigh > 0;
      let best = null,
        bestCost = 1e9,
        bestDev = 1e9;
      for (const cand of perms(lset)) {
        if (!allowed(cand)) continue;
        const cs = cost(cand);
        const dev = cand.reduce((a, lid, i) => a + Math.abs(i - lset.indexOf(lid)), 0);
        if (cs < bestCost || (cs === bestCost && dev < bestDev)) {
          best = cand;
          bestCost = cs;
          bestDev = dev;
        }
      }
      if (!best) best = lset;
      for (let i = 0; i < c.length - 1; i++)
        EDGELANES[[c[i], c[i + 1]].sort().join("|")] = { order: best, fa: c[i] };
    });
  }
  /* each line = ONE continuous offset path with mitered corners — no gaps,
   no misaligned segments at bends like Bay Fair */
  LINES.forEach((l) => {
    const S = l.sts;
    const offAt = (u, v) => {
      const k = [u, v].sort().join("|");
      const lane = EDGELANES[k];
      const order = lane ? lane.order : EDGE[k].lines;
      let off = (order.indexOf(l.id) - (order.length - 1) / 2) * 4.4;
      if (lane && lane.fa !== u) off = -off; /* travelling the edge against corridor-forward */
      return off;
    };
    const G = (u, v) => {
      const dx = P[v].x - P[u].x,
        dy = P[v].y - P[u].y,
        len = Math.hypot(dx, dy) || 1;
      return { nx: -dy / len, ny: dx / len, dx: dx / len, dy: dy / len };
    };
    const pts = [];
    for (let i = 0; i < S.length; i++) {
      const p = P[S[i]];
      if (i === 0) {
        const g = G(S[0], S[1]),
          o = offAt(S[0], S[1]);
        pts.push({ x: p.x + g.nx * o, y: p.y + g.ny * o });
        continue;
      }
      if (i === S.length - 1) {
        const g = G(S[i - 1], S[i]),
          o = offAt(S[i - 1], S[i]);
        pts.push({ x: p.x + g.nx * o, y: p.y + g.ny * o });
        continue;
      }
      const ga = G(S[i - 1], S[i]),
        oa = offAt(S[i - 1], S[i]);
      const gb = G(S[i], S[i + 1]),
        ob = offAt(S[i], S[i + 1]);
      const a1 = { x: P[S[i - 1]].x + ga.nx * oa, y: P[S[i - 1]].y + ga.ny * oa };
      const a2 = { x: p.x + gb.nx * ob, y: p.y + gb.ny * ob };
      const den = ga.dx * gb.dy - ga.dy * gb.dx;
      let q;
      if (Math.abs(den) < 1e-6) q = { x: p.x + ga.nx * oa, y: p.y + ga.ny * oa };
      else {
        const t = ((a2.x - a1.x) * gb.dy - (a2.y - a1.y) * gb.dx) / den;
        q = { x: a1.x + ga.dx * t, y: a1.y + ga.dy * t };
        if (Math.hypot(q.x - p.x, q.y - p.y) > Math.max(Math.abs(oa), Math.abs(ob)) * 3 + 10)
          q = { x: p.x + (ga.nx * oa + gb.nx * ob) / 2, y: p.y + (ga.ny * oa + gb.ny * ob) / 2 };
      }
      pts.push(q);
    }
    const d = pts.map((q, i) => (i ? "L" : "M") + q.x.toFixed(1) + " " + q.y.toFixed(1)).join(" ");
    el(
      "path",
      {
        class: `edge e-${l.id}`,
        d,
        fill: "none",
        stroke: l.color,
        "stroke-width": 3.6,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      },
      gEdges,
    );
  });

  /* ---------- automatic label placement: right / left / above / below, no overlaps ---------- */
  const LBL = {};
  (function placeLabels() {
    const placed = [];
    const wOf = (n) => n.length * 4.35 + 6,
      h = 9.5;
    const cands = [
      [9, 3, "start"],
      [-9, 3, "end"],
      [0, -10, "middle"],
      [0, 14, "middle"],
    ];
    const order = Object.keys(ST).sort((a, b) => P[a].y - P[b].y || P[a].x - P[b].x);
    for (const id of order) {
      const wd = wOf(ST[id].n);
      let best = null;
      for (const [dx, dy, anc] of cands) {
        const x0 =
          anc === "start" ? P[id].x + dx : anc === "end" ? P[id].x + dx - wd : P[id].x - wd / 2;
        const box = { x: x0, y: P[id].y + dy - h + 2, w: wd, h };
        let ok = true;
        for (const b of placed)
          if (!(
            box.x + box.w < b.x ||
            b.x + b.w < box.x ||
            box.y + box.h < b.y ||
            b.y + b.h < box.y
          )) {
            ok = false;
            break;
          }
        if (ok)
          for (const oid in P) {
            if (oid === id) continue;
            const q = P[oid];
            if (
              q.x > box.x - 6 &&
              q.x < box.x + box.w + 6 &&
              q.y > box.y - 6 &&
              q.y < box.y + box.h + 6
            ) {
              ok = false;
              break;
            }
          }
        if (ok) {
          best = { dx, dy, anc, box };
          break;
        }
      }
      if (!best) {
        const [dx, dy, anc] = cands[0];
        best = { dx, dy, anc, box: { x: P[id].x + dx, y: P[id].y + dy - h + 2, w: wd, h } };
      }
      placed.push(best.box);
      LBL[id] = best;
    }
  })();

  /* ---------- stations ---------- */
  const stEls = {};
  for (const id in ST) {
    const s = ST[id],
      p = P[id],
      r = 4.4; /* every station the same size */
    const g = el(
      "g",
      { class: "station", transform: `translate(${p.x},${p.y})`, "data-id": id },
      gSt,
    );
    el("circle", { r: r + 1, fill: "#000", opacity: 0.35, cy: 0.8 }, g);
    const ring = "#10151E"; /* white center, black outline — simple */
    el("circle", { class: "core", r, fill: "#fff", stroke: ring, "stroke-width": 2.2 }, g);
    el("circle", { r: r + 8, fill: "transparent" }, g);
    stEls[id] = g;
    const lb = LBL[id];
    const t = el(
      "text",
      {
        class: "lbl",
        transform: `translate(${p.x},${p.y})`,
        x: lb.dx,
        y: lb.dy,
        "text-anchor": lb.anc,
        "data-id": id,
      },
      gLbl,
    );
    t.textContent = s.n;
  }
  return { el, world, gRoute, gTrains, gSt, gLbl, gDrag, stEls };
}
