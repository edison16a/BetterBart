import { AT, hopMin, tname } from "./geometry.js";
import { LINES, LN } from "../data/network.js";

/** Transfer penalty, in simulated transit minutes. */
export const IDX = {};
LINES.forEach((l) => {
  IDX[l.id] = {};
  l.sts.forEach((s, i) => (IDX[l.id][s] = i));
});
const TRANSFER = 6;
export function route(a, b) {
  if (a === b) return null;
  const dist = {},
    prev = {},
    done = {},
    pq = [];
  AT[a].forEach((l) => {
    const k = a + "|" + l;
    dist[k] = 0;
    pq.push([0, k]);
  });
  const push = (d, k, p) => {
    if (dist[k] === undefined || d < dist[k] - 1e-9) {
      dist[k] = d;
      prev[k] = p;
      pq.push([d, k]);
    }
  };
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, k] = pq.shift();
    if (done[k]) continue;
    done[k] = 1;
    const [st, lid] = k.split("|");
    const L = LN[lid],
      i = IDX[lid][st];
    if (st === b) continue;
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= L.sts.length) continue;
      push(d + hopMin(st, L.sts[j]), L.sts[j] + "|" + lid, k);
    }
    for (const ol of AT[st]) if (ol !== lid) push(d + TRANSFER, st + "|" + ol, k);
  }
  let best = null;
  AT[b].forEach((l) => {
    const k = b + "|" + l;
    if (dist[k] !== undefined && (!best || dist[k] < dist[best])) best = k;
  });
  if (!best) return null;
  const chain = [];
  for (let k = best; k; k = prev[k]) chain.unshift(k);
  const legs = [];
  chain.forEach((k) => {
    const [st, lid] = k.split("|"),
      cur = legs[legs.length - 1];
    if (cur && cur.line === lid) {
      if (cur.sts[cur.sts.length - 1] !== st) cur.sts.push(st);
    } else legs.push({ line: lid, sts: [st] });
  });
  const real = legs.filter((l) => l.sts.length > 1);
  real.forEach((l) => {
    l.mins = 0;
    for (let i = 0; i < l.sts.length - 1; i++) l.mins += hopMin(l.sts[i], l.sts[i + 1]);
    l.dir = IDX[l.line][l.sts[1]] > IDX[l.line][l.sts[0]] ? 1 : -1;
    const S = LN[l.line].sts;
    l.toward = tname(l.dir > 0 ? S[S.length - 1] : S[0]);
  });
  return real.length ? real : null;
}
