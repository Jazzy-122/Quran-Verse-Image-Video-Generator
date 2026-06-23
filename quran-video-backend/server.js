const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { writeFile, createReadStream } = require('fs');
const { rm } = require('fs/promises');

const app = express();

// Disk-based upload to handle large files reliably
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

app.use(cors());

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Quran Video Converter', uptime: process.uptime() });
});

// Convert video to WhatsApp-ready MP4
app.post('/convert', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

  const inputPath = req.file.path;
  const outputPath = path.join(os.tmpdir(), `quran-out-${Date.now()}.mp4`);

  try {
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y', '-i', inputPath,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-max_muxing_queue_size', '1024',
        outputPath
      ], { timeout: 5 * 60 * 1000 });

      let stderr = '';
      ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });
      ffmpeg.on('error', reject);
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
      });
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="quran-recitation.mp4"');
    const stream = createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { rm(outputPath).catch(() => {}); });
    stream.on('error', () => { rm(outputPath).catch(() => {}); });
  } catch (err) {
    console.error('Conversion failed:', err.message);
    try { await rm(outputPath); } catch (_) {}
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[start] Quran Video Converter on port ${PORT}`);
  console.log(`[start] ffmpeg: ${!!require('child_process').spawnSync('ffmpeg', ['-version']).stdout ? 'available' : 'NOT FOUND'}`);
});
