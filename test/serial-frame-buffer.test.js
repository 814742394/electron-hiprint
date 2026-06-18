"use strict";

const assert = require("assert");
const { createHexFrameForwarder } = require("../src/serialFrame");

function collect(chunks) {
  const sent = [];
  const forwarder = createHexFrameForwarder((frame) => {
    sent.push(frame);
  });
  chunks.forEach((chunk) => forwarder.append(chunk));
  return sent;
}

assert.deepStrictEqual(
  collect(["022c302020202035", "3737202020303030", "0d"]),
  ["022c30202020203537372020203030300d"],
  "split hex frame should be forwarded as one payload",
);

assert.deepStrictEqual(
  collect(["022c30202020203537372020203030300d022c30202020203537372020203030300d"]),
  [
    "022c30202020203537372020203030300d",
    "022c30202020203537372020203030300d",
  ],
  "multiple complete frames in one chunk should be forwarded separately",
);

assert.deepStrictEqual(
  collect(["ffee022c302020202035", "37372020203030300d"]),
  ["022c30202020203537372020203030300d"],
  "data before the first frame start should be discarded",
);

assert.deepStrictEqual(
  collect(["022c3020202020353737202020303030"]),
  [],
  "incomplete frame should wait for the ending byte",
);

console.log("serial frame buffer checks passed");
