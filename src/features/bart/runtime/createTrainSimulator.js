import { P } from "../core/geometry.js";
import { IDX } from "../core/routing.js";
import { LINES } from "../data/network.js";

export const TRAIN_SPEED = 10;

/**
 * Creates the deterministic in-browser train simulation used for live ETAs.
 * One real minute represents one simulated transit minute.
 */
export function createTrainSimulator() {
  const GEOM = {};
  for (const line of LINES) {
    const points = line.sts.map((stationId) => P[stationId]);
    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(
        cumulative[index - 1] +
          Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y),
      );
    }
    GEOM[line.id] = {
      pts: points,
      cum: cumulative,
      total: cumulative[cumulative.length - 1],
    };
  }

  const trains = [];
  for (const line of LINES) {
    const geometry = GEOM[line.id];
    const trainsPerDirection = Math.max(2, Math.round(geometry.total / 160));
    for (const direction of [1, -1]) {
      for (let index = 0; index < trainsPerDirection; index += 1) {
        trains.push({
          line: line.id,
          dir: direction,
          s:
            (((index + 0.5) / trainsPerDirection) * geometry.total +
              (direction > 0 ? 0 : geometry.total * 0.07)) %
            geometry.total,
        });
      }
    }
  }

  function advance(deltaSeconds) {
    for (const train of trains) {
      const geometry = GEOM[train.line];
      train.s += train.dir * TRAIN_SPEED * (deltaSeconds / 60);
      if (train.s >= geometry.total) {
        train.s = geometry.total;
        train.dir = -1;
      }
      if (train.s <= 0) {
        train.s = 0;
        train.dir = 1;
      }
    }
  }

  function nextETA(stationId, lineId, direction) {
    const geometry = GEOM[lineId];
    const stationIndex = IDX[lineId][stationId];
    if (stationIndex === undefined) return null;

    const stationDistance = geometry.cum[stationIndex];
    let best = null;
    for (const train of trains) {
      if (train.line !== lineId) continue;
      if (direction !== undefined && train.dir !== direction) continue;

      let distance = null;
      if (train.dir > 0 && train.s <= stationDistance - 0.5) {
        distance = stationDistance - train.s;
      }
      if (train.dir < 0 && train.s >= stationDistance + 0.5) {
        distance = train.s - stationDistance;
      }
      if (distance !== null) {
        const minutes = distance / TRAIN_SPEED;
        if (best === null || minutes < best) best = minutes;
      }
    }
    return best;
  }

  return { GEOM, trains, advance, nextETA };
}
