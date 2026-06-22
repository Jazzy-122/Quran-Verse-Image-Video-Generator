import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import cors from 'cors';
import express from 'express';
import multer from 'multer';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 250);
const CONVERT_TIMEOUT_MS = Number(process.env.CONVERT_TIMEOUT_MS || 10 * 60 * 1000);
const MAX_ACTIVE_CONVERSIONS = Number(process.env.MAX_ACTIVE_CONVERSIONS || 2);
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

let activeConversions = 0;

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const nameOk = /\.(webm|mp4|mov|m4v)$/i.test(file.originalname || '');
    const mimeOk = /^(video\/|application\/octet-stream$)/i.test(file.mimetype || '');
    cb(nameOk || mimeOk ? null : new Error('Upload must be a browser-recorded video file.'), nameOk || mimeOk);
  }
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('This origin is not allowed by CORS_ORIGIN.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, activeConversions, maxActiveConversions: MAX_ACTIVE_CONVERSIONS });
});

app.post('/convert', upload.single('video'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file was uploaded.' });
    return;
  }
  if (activeConversions >= MAX_ACTIVE_CONVERSIONS) {
    await removeQuietly(req.file.path);
    res.status(503).json({ error: 'The converter is busy. Please try again in a moment.' });
    return;
  }

  activeConversions += 1;
  const jobId = crypto.randomUUID();
  const inputPath = req.file.path;
  const outputPath = path.join(os.tmpdir(), `${jobId}.mp4`);

  try {
    await runFfmpeg(inputPath, outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="quran-video.mp4"');
    res.sendFile(outputPath, async (sendErr) => {
      await Promise.all([removeQuietly(inputPath), removeQuietly(outputPath)]);
      if (sendErr) console.error(`[${jobId}] send failed`, sendErr);
    });
  } catch (err) {
    await Promise.all([removeQuietly(inputPath), removeQuietly(outputPath)]);
    console.error(`[${jobId}] conversion failed`, err);
    if (!res.headersSent) {
      res.status(422).json({ error: err.message || 'Video conversion failed.' });
    }
  } finally {
    activeConversions -= 1;
  }
});

app.use((err, _req, res, _next) => {
  console.error('[request failed]', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: `Video is too large. Limit is ${MAX_UPLOAD_MB} MB.` });
    return;
  }
  res.status(400).json({ error: err.message || 'Bad request.' });
});

app.listen(PORT, () => {
  console.log(`Video converter listening on port ${PORT}`);
});

function runFfmpeg(inputPath, outputPath) {
  const args = [
    '-hide_banner',
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      reject(new Error('Conversion timed out. Try a shorter verse range.'));
    }, CONVERT_TIMEOUT_MS);

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    ffmpeg.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`FFmpeg could not start: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(cleanFfmpegError(stderr) || `FFmpeg exited with code ${code}.`));
    });
  });
}

function cleanFfmpegError(stderr) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-4).join(' ');
}

async function removeQuietly(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {}
}
