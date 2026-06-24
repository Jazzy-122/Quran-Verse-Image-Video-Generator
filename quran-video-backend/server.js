import express from "express";
import cors from "cors";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = "uploads";
const outputDir = "outputs";

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB safety
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.post("/convert", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video uploaded" });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(
    outputDir,
    `${Date.now()}-whatsapp.mp4`
  );

  ffmpeg(inputPath)
    .outputOptions([
      "-c:v libx264",
      "-pix_fmt yuv420p",
      "-profile:v main",
      "-level 3.1",
      "-movflags +faststart",
      "-c:a aac",
      "-b:a 128k"
    ])
    .on("end", () => {
      // VERY IMPORTANT: delete input only
      fs.unlinkSync(inputPath);

      res.download(outputPath, "quran-video.mp4", () => {
        // delete AFTER download finishes
        fs.unlinkSync(outputPath);
      });
    })
    .on("error", (err) => {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      res.status(500).json({ error: err.message });
    })
    .save(outputPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
