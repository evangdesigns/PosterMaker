// server.js (proxy edition)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: true }));

app.get("/healthz", (_req, res) => res.status(200).send("OK"));

app.options("/api/removebg", (_req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }).status(204).send();
});

app.post("/api/removebg", upload.single("image_file"), async (req, res) => {
  try {
    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) return res.status(500).send("Missing REMOVE_BG_API_KEY");
    if (!req.file) return res.status(400).send("Missing image_file");

    const { size = "auto", format = "png" } = req.body || {};

    const form = new FormData();
    form.append("image_file", req.file.buffer, {
      filename: req.file.originalname || "upload.jpg",
      contentType: req.file.mimetype || "image/jpeg",
      knownLength: req.file.size,
    });
    form.append("size", size);
    form.append("format", format);

    const r = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, ...form.getHeaders() },
      body: form,
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("remove.bg error", r.status, txt);
      return res
        .set("Access-Control-Allow-Origin", "*")
        .status(r.status)
        .type("text/plain")
        .send(txt || "remove.bg error");
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res
      .set({
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      })
      .status(200)
      .send(buf);
  } catch (e) {
    console.error("proxy error", e);
    res
      .set("Access-Control-Allow-Origin", "*")
      .status(500)
      .send("Proxy error");
  }
});

// serve Vite build
const distPath = path.join(__dirname, "dist");
const indexHtml = path.join(distPath, "index.html");
app.use(express.static(distPath));
app.get("*", (_req, res) => res.sendFile(indexHtml));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PosterMaker listening on :${PORT}`));