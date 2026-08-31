import assert from "node:assert/strict";
import test from "node:test";

import { centeredMapView, pointMapView } from "../src/features/bart/core/camera.js";
import { AT } from "../src/features/bart/core/geometry.js";
import { route } from "../src/features/bart/core/routing.js";
import { LINES, ST } from "../src/features/bart/data/network.js";
import {
  createTrainSimulator,
  TRAIN_SPEED,
} from "../src/features/bart/runtime/createTrainSimulator.js";

test("the complete BART catalog is available", () => {
  assert.equal(Object.keys(ST).length, 50);
  assert.equal(LINES.length, 6);
  assert.deepEqual(AT.RICH.sort(), ["orange", "red"]);
});

test("a direct Richmond-to-SFO trip stays on the red line", () => {
  const legs = route("RICH", "SFIA");

  assert.ok(legs);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].line, "red");
  assert.equal(legs[0].sts[0], "RICH");
  assert.equal(legs[0].sts.at(-1), "SFIA");
  assert.equal(legs[0].toward, "Millbrae");
});

test("a cross-network trip includes valid connected legs", () => {
  const legs = route("DUBL", "ANTC");

  assert.ok(legs);
  assert.ok(legs.length > 1);
  assert.equal(legs[0].sts[0], "DUBL");
  assert.equal(legs.at(-1).sts.at(-1), "ANTC");

  for (let index = 1; index < legs.length; index += 1) {
    assert.equal(legs[index - 1].sts.at(-1), legs[index].sts[0]);
  }
});

test("the live train simulator advances and returns finite ETAs", () => {
  const simulator = createTrainSimulator();
  const before = simulator.trains[0].s;

  simulator.advance(1);

  assert.notEqual(simulator.trains[0].s, before);
  assert.equal(TRAIN_SPEED, 10);
  assert.ok(Number.isFinite(simulator.nextETA("MCAR", "red")));
});

test("camera views stay inside the map at desktop and mobile aspect ratios", () => {
  for (const [viewportWidth, viewportHeight] of [
    [1280, 800],
    [390, 844],
  ]) {
    const centered = centeredMapView({
      mapWidth: 1004,
      mapHeight: 1154,
      viewportWidth,
      viewportHeight,
    });
    const nearEdge = pointMapView({
      mapWidth: 1004,
      mapHeight: 1154,
      viewportWidth,
      viewportHeight,
      point: { x: 0, y: 0 },
      width: 280,
    });

    for (const view of [centered, nearEdge]) {
      assert.ok(view.x >= 0);
      assert.ok(view.y >= 0);
      assert.ok(view.x + view.w <= 1004);
      assert.ok(view.y + view.h <= 1154);
    }
  }
});
