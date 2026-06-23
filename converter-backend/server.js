const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
app.use(cors());

app.get('/', (_req, res) => res.json({ status: 'ok', service: 'Quran Video Converter' }));

app.post('/convert', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

  const ffmpeg = spawn('ffmpeg', [
    '-y', '-f', 'webm', '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-f', 'mp4', 'pipe:1'
  ], { timeout: 5 * 60 * 1000 });

  // Pipe uploaded buffer into ffmpeg stdin
  const input = new Readable();
  input.push(req.file.buffer);
  input.push(null);
  input.pipe(ffmpeg.stdin);

  let stderr = '';
  ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });

  ffmpeg.on('error', (err) => {
    console.error('ffmpeg error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  ffmpeg.on('close', (code) => {
    if (code !== 0) {
      console.error('ffmpeg exit', code, stderr.slice(-300));
      if (!res.headersSent) res.status(500).json({ error: `ffmpeg exit ${code}` });
      return;
    }
  });

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', 'attachment; filename="quran-recitation.mp4"');
  ffmpeg.stdout.pipe(res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Converter on port ${PORT}`));
