"use strict";

function createHexFrameForwarder(onFrame) {
  let buffer = "";
  return {
    append(data) {
      const frames = [];
      buffer += String(data || "").toLowerCase();

      while (buffer.length) {
        const startIndex = buffer.indexOf("02");
        if (startIndex === -1) {
          buffer = "";
          break;
        }
        if (startIndex > 0) {
          buffer = buffer.slice(startIndex);
        }

        const endIndex = buffer.indexOf("0d", 2);
        if (endIndex === -1) {
          break;
        }

        const frame = buffer.slice(0, endIndex + 2);
        buffer = buffer.slice(endIndex + 2);
        frames.push(frame);
        onFrame(frame);
      }

      return frames;
    },
    clear() {
      buffer = "";
    },
  };
}

module.exports = {
  createHexFrameForwarder,
};
