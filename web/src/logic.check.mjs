import assert from "node:assert/strict";
import { clock, needsResync, nextUnreviewed, swipeVerdict } from "./logic.js";

assert.equal(swipeVerdict(150, 400, 0.1), "right");
assert.equal(swipeVerdict(-150, 400, 0.1), "left");
assert.equal(swipeVerdict(60, 400, 0.1), null);
assert.equal(swipeVerdict(-60, 400, 0.9), "left");
assert.equal(swipeVerdict(20, 400, 2), null);
assert.equal(needsResync(10, 10.1), false);
assert.equal(needsResync(10, 10.3), true);
const items = [{ id: "a", mine: "agree" }, { id: "b" }, { id: "c", mine: "agree" }, { id: "d" }];
assert.equal(nextUnreviewed(items, "b"), items[3]);
assert.equal(nextUnreviewed(items, "d"), items[1]);
assert.equal(nextUnreviewed(items, "a"), items[1]);
assert.equal(nextUnreviewed([{ id: "x" }], "x"), null);
assert.equal(clock(65), "1:05");
console.log("logic ok");
