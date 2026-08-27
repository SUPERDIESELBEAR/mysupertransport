// Intentionally empty.
//
// jsdom probes for canvas like this (jsdom/lib/jsdom/utils.js):
//
//   try { require.resolve("canvas"); canvasInstalled = true } catch {}
//   if (canvasInstalled) {
//     const Canvas = require("canvas");
//     if (typeof Canvas.createCanvas === "function") exports.Canvas = Canvas;
//   }
//
// Because we export no `createCanvas`, jsdom keeps Canvas = null and runs in
// its normal no-canvas mode. Nothing in this suite renders to a real 2D
// context; the components that do use `html2canvas` / `@napi-rs/canvas`, which
// are separate packages and unaffected.
module.exports = {};
