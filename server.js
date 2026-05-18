const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { judgeSubmission, DEFAULT_TIMEOUT_MS } = require('./judge');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const PROBLEMS_DIR = path.join(__dirname, 'problems');

fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SUBMISSIONS_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.sb3') {
      cb(new Error('Only .sb3 files are accepted'));
      return;
    }
    cb(null, true);
  }
});

function hasProjectJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  const marker = Buffer.from('project.json');

  return buffer.includes(marker);
}

function judgeOptions(problem) {
  return {
    problem: problem || 'problem1',
    problemsRoot: PROBLEMS_DIR,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
}

app.get('/', (_req, res) => {
  res.json({
    service: 'Scratch Auto Judge',
    submit: 'POST /submit',
    submitBatch: 'POST /submit-batch',
    fields: {
      file: '.sb3 file',
      files: 'multiple .sb3 files',
      problem: 'optional, default problem1'
    }
  });
});

app.post('/submit', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ verdict: 'WRONG ANSWER', passed: 0, total: 0, error: 'Missing .sb3 file field: file' });
    return;
  }

  try {
    const result = await judgeSubmission(req.file.path, judgeOptions(req.body.problem));

    res.json({
      verdict: result.verdict,
      passed: result.passed,
      total: result.total
    });
  } catch (error) {
    res.status(400).json({
      verdict: 'WRONG ANSWER',
      passed: 0,
      total: 0,
      error: error.message
    });
  }
});

app.post('/submit-batch', upload.array('files', 100), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    res.status(400).json([
      {
        file: null,
        verdict: 'ERROR',
        message: 'Missing .sb3 file field: files'
      }
    ]);
    return;
  }

  const results = [];

  for (const file of req.files) {
    try {
      if (!hasProjectJson(file.path)) {
        throw new Error('Invalid .sb3 file: missing project.json');
      }

      const result = await judgeSubmission(file.path, judgeOptions(req.body.problem));
      const erroredTestcase =
        result.results && result.results.find((testcase) => testcase.error && testcase.error !== 'TIMEOUT');

      if (erroredTestcase) {
        results.push({
          file: file.originalname,
          verdict: 'ERROR',
          message: erroredTestcase.error
        });
        continue;
      }

      results.push({
        file: file.originalname,
        verdict: result.verdict,
        passed: result.passed,
        total: result.total
      });
    } catch (error) {
      results.push({
        file: file.originalname,
        verdict: 'ERROR',
        message: error.message
      });
    }
  }

  res.json(results);
});

app.use((error, _req, res, _next) => {
  res.status(400).json({
    verdict: 'WRONG ANSWER',
    passed: 0,
    total: 0,
    error: error.message
  });
});

app.listen(PORT, () => {
  console.log(`Scratch judge listening on http://localhost:${PORT}`);
});
