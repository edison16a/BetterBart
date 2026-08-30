import { LINES, ST } from "../data/network.js";

/** Geographic-to-schematic projection and shared network indexes. */
/* ================= PROJECTION ================= */
export const LON0 = -122.58,
  LAT1 = 38.1,
  PXKM = 13,
  KMLON = 87.8,
  KMLAT = 111.0;
export const W = Math.round((-121.7 - LON0) * KMLON * PXKM),
  H = Math.round((LAT1 - 37.3) * KMLAT * PXKM);
export const X = (lo) => (lo - LON0) * KMLON * PXKM,
  Y = (la) => (LAT1 - la) * KMLAT * PXKM;
export const P = {};
for (const id in ST) P[id] = { x: X(ST[id].lo), y: Y(ST[id].la) };
export const P0 = {};
for (const id in ST)
  P0[id] = { x: P[id].x, y: P[id].y }; /* true geography — GPS matches against this */
/* corridors: maximal runs of stations served by an identical set of lines */
export function computeChains() {
  const es = {};
  LINES.forEach((l) => {
    for (let i = 0; i < l.sts.length - 1; i++) {
      const k = [l.sts[i], l.sts[i + 1]].sort().join("|");
      (es[k] = es[k] || new Set()).add(l.id);
    }
  });
  const ekey = (u, v) => [...es[[u, v].sort().join("|")]].sort().join(",");
  const seen = new Set(),
    chains = [];
  LINES.forEach((l) => {
    let start = 0;
    for (let i = 1; i < l.sts.length; i++) {
      const kPrev = ekey(l.sts[i - 1], l.sts[i]);
      const kNext = i < l.sts.length - 1 ? ekey(l.sts[i], l.sts[i + 1]) : null;
      if (kNext !== kPrev) {
        const chain = l.sts.slice(start, i + 1);
        const cid = [chain[0], chain[chain.length - 1]].sort().join(">") + ":" + kPrev;
        if (!seen.has(cid)) {
          seen.add(cid);
          chains.push(chain);
        }
        start = i;
      }
    }
  });
  return chains;
}
/* Transit-map spacing: gently push apart stations closer than MINSEP px so dots
   and names never overlap (downtown SF & Oakland). Coast-adjacent stations are
   pinned so nothing drifts into the water. Travel times still use true lat/lon. */
(function relax() {
  const MINSEP = 30,
    PIN = new Set(["EMBR", "WOAK"]);
  const ids = Object.keys(P);
  const pairs = new Set();
  LINES.forEach((l) => {
    for (let i = 0; i < l.sts.length - 1; i++) pairs.add([l.sts[i], l.sts[i + 1]].sort().join("|"));
  });
  const PAIRS = [...pairs].map((k) => k.split("|"));
  for (let it = 0; it < 90; it++) {
    /* 1) straighten: pull each interior station toward the midpoint of its
          neighbours on every line through it — corridors become linear */
    const F = {};
    ids.forEach((id) => (F[id] = { x: 0, y: 0, n: 0 }));
    LINES.forEach((l) => {
      for (let i = 1; i < l.sts.length - 1; i++) {
        const A = P[l.sts[i - 1]],
          B = P[l.sts[i]],
          C = P[l.sts[i + 1]],
          f = F[l.sts[i]];
        f.x += (A.x + C.x) / 2 - B.x;
        f.y += (A.y + C.y) / 2 - B.y;
        f.n++;
      }
    });
    for (const id of ids) {
      const f = F[id];
      if (!PIN.has(id) && f.n) {
        P[id].x += (0.22 * f.x) / f.n;
        P[id].y += (0.22 * f.y) / f.n;
      }
    }
    /* 2) space: neighbours closer than MINSEP push apart along their own axis */
    for (const [ia, ib] of PAIRS) {
      const a = P[ia],
        b = P[ib];
      let dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.hypot(dx, dy);
      if (d >= MINSEP) continue;
      if (d < 0.01) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const push = (MINSEP - d) / 2,
        ux = dx / d,
        uy = dy / d;
      const pa = PIN.has(ia),
        pb = PIN.has(ib);
      if (!pa) {
        a.x -= ux * push * (pb ? 2 : 1);
        a.y -= uy * push * (pb ? 2 : 1);
      }
      if (!pb) {
        b.x += ux * push * (pa ? 2 : 1);
        b.y += uy * push * (pa ? 2 : 1);
      }
    }
  }
  /* 3) SCHEMATIC PASS: every corridor between junctions/termini becomes a
        perfectly straight line with evenly spaced stations */
  computeChains().forEach((c) => {
    if (c.length < 3) return;
    const A = P[c[0]],
      B = P[c[c.length - 1]];
    for (let i = 1; i < c.length - 1; i++) {
      const t = i / (c.length - 1);
      P[c[i]].x = A.x + (B.x - A.x) * t;
      P[c[i]].y = A.y + (B.y - A.y) * t;
    }
  });
})();
export const kmBetween = (a, b) =>
  Math.hypot((ST[a].lo - ST[b].lo) * KMLON, (ST[a].la - ST[b].la) * KMLAT);
export const hopMin = (a, b) => 0.7 + kmBetween(a, b) * 0.85;
export const tname = (id) => ST[id].sn || ST[id].n;
export const AT = {};
for (const id in ST) AT[id] = [];
LINES.forEach((l) => l.sts.forEach((s) => AT[s].push(l.id)));
