const express = require("express");
const path = require("path");
const fs = require("fs");
const { createCanvas, loadImage } = require("canvas");
const tf = require("@tensorflow/tfjs-node");

const app = express();
const PORT = process.env.PORT || 3000;

const distPath = path.resolve(__dirname, "dist");

// Helper function to run U2Net model and composite the matte
async function runU2Net(buffer, orig) {
  // Load model once
  if (!runU2Net.model) {
    runU2Net.model = await tf.loadGraphModel("file://u2net/model.json");
  }

  // Preprocess image to 320x320 RGB tensor normalized [0,1]
  const img = await loadImage(buffer);
  const canvas = createCanvas(320, 320);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, 320, 320);
  const imageData = ctx.getImageData(0, 0, 320, 320);
  const input = tf.tensor(new Uint8Array(imageData.data.buffer), [320, 320, 4], "int32");
  const rgb = tf.slice(input, [0, 0, 0], [320, 320, 3]);
  const normalized = tf.div(tf.cast(rgb, "float32"), 255.0);
  const batched = normalized.expandDims(0);

  // Run model
  const output = runU2Net.model.execute(batched);
  const probsTensor = output.squeeze();
  const probs = Array.from(probsTensor.dataSync());
  probsTensor.dispose();
  output.dispose();
  batched.dispose();
  normalized.dispose();
  rgb.dispose();
  input.dispose();

  // Heuristic to detect inversion: compare edge vs center means
  const side = Math.sqrt(probs.length) | 0; // square side
  let edgeSum = 0, edgeCount = 0, centerSum = 0, centerCount = 0;
  const border = Math.max(2, Math.floor(side * 0.05));
  const c0 = Math.floor(side * 0.25), c1 = Math.floor(side * 0.75);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const v = probs[y * side + x];
      const isEdge = (x < border || x >= side - border || y < border || y >= side - border);
      if (isEdge) { edgeSum += v; edgeCount++; }
      const inCenter = (x >= c0 && x < c1 && y >= c0 && y < c1);
      if (inCenter) { centerSum += v; centerCount++; }
    }
  }
  const edgeMean = edgeSum / Math.max(1, edgeCount);
  const centerMean = centerSum / Math.max(1, centerCount);
  // If edges are brighter than center, invert (common when model output is reversed)
  if (edgeMean > centerMean) {
    for (let i = 0; i < probs.length; i++) probs[i] = 1 - probs[i];
  }
  // 2) Min–max normalize (improves contrast on some exports)
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < probs.length; i++) {
    const v = probs[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const matte = new Float32Array(probs.length);
  const denom = Math.max(1e-6, hi - lo);
  for (let i = 0; i < probs.length; i++) {
    matte[i] = (probs[i] - lo) / denom; // normalized [0,1]
  }
  return compositeWithMatte(buffer, matte, side, orig);
}

// Composite the matte onto original image buffer
function compositeWithMatte(buffer, matte, size, orig) {
  // Implementation details omitted for brevity
  // Returns composited image buffer
  return buffer;
}

app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

app.options("/api/removebg", (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.sendStatus(204);
});

app.post("/api/removebg", express.raw({ type: "image/*", limit: "10mb" }), async (req, res) => {
  try {
    const orig = req.body;
    const result = await runU2Net(orig, orig);
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    });
    res.status(200).send(result);
  } catch (e) {
    res.status(500).send("Internal Server Error");
  }
});

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
