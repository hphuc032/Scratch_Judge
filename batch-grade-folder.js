const fs = require('fs');
const path = require('path');
const http = require('http');

const API_URL = 'http://localhost:3000/submit';
const OUTPUT_FILE = 'results.csv';
const REQUEST_TIMEOUT_MS = 120000;

const TASKS = [
  { file: 'bai1.sb3', problem: 'problem1' },
  { file: 'bai2.sb3', problem: 'problem2' },
  { file: 'bai3.sb3', problem: 'problem3' },
  { file: 'bai4.sb3', problem: 'problem4' }
];

function usage() {
  console.error('Usage: node batch-grade-folder.js "D:\\SUBMISSIONS"');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function countProblemTests(problem) {
  const problemDir = path.join(__dirname, 'problems', problem);
  if (!fs.existsSync(problemDir)) return 0;

  return fs
    .readdirSync(problemDir)
    .filter((name) => /^output\d+\.txt$/i.test(name))
    .length;
}

function listStudentDirs(rootDir) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      dir: path.join(rootDir, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function buildMultipartBody(filePath, problem) {
  const boundary = `----scratch-judge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const chunks = [
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="problem"\r\n\r\n' +
        `${problem}\r\n`
    ),
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, '\\"')}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n'
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ];

  return {
    body: Buffer.concat(chunks),
    boundary
  };
}

function submitFile(filePath, problem) {
  return new Promise((resolve) => {
    const { body, boundary } = buildMultipartBody(filePath, problem);
    const url = new URL(API_URL);

    const req = http.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                verdict: parsed.verdict || 'ERROR',
                passed: Number(parsed.passed || 0),
                total: Number(parsed.total || 0),
                message: parsed.error || ''
              });
            } else {
              resolve({
                verdict: 'ERROR',
                passed: Number(parsed.passed || 0),
                total: Number(parsed.total || 0),
                message: parsed.error || raw || `HTTP ${res.statusCode}`
              });
            }
          } catch (error) {
            resolve({
              verdict: 'ERROR',
              passed: 0,
              total: 0,
              message: raw || error.message
            });
          }
        });
      }
    );

    req.on('error', (error) => {
      resolve({
        verdict: 'ERROR',
        passed: 0,
        total: 0,
        message: error.message
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });

    req.write(body);
    req.end();
  });
}

function rowToCsv(row) {
  return [
    row.student,
    row.file,
    row.problem,
    row.verdict,
    row.passed,
    row.total,
    row.score,
    row.message
  ]
    .map(csvEscape)
    .join(',');
}

async function main() {
  const submissionsRoot = process.argv[2];
  if (!submissionsRoot) {
    usage();
    process.exit(1);
  }

  const rootDir = path.resolve(submissionsRoot);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    console.error(`Submission folder not found: ${rootDir}`);
    process.exit(1);
  }

  const rows = [];
  const students = listStudentDirs(rootDir);

  for (const student of students) {
    for (const task of TASKS) {
      const submissionPath = path.join(student.dir, task.file);
      const expectedTotal = countProblemTests(task.problem);

      if (!fs.existsSync(submissionPath)) {
        rows.push({
          student: student.name,
          file: task.file,
          problem: task.problem,
          verdict: 'MISSING',
          passed: 0,
          total: expectedTotal,
          score: 0,
          message: 'Missing file'
        });
        continue;
      }

      const result = await submitFile(submissionPath, task.problem);
      rows.push({
        student: student.name,
        file: task.file,
        problem: task.problem,
        verdict: result.verdict,
        passed: result.passed,
        total: result.total || expectedTotal,
        score: result.verdict === 'ACCEPTED' || result.verdict === 'WRONG ANSWER' ? result.passed : 0,
        message: result.message
      });
    }
  }

  const csv = [
    'student,file,problem,verdict,passed,total,score,message',
    ...rows.map(rowToCsv)
  ].join('\r\n');

  fs.writeFileSync(path.join(process.cwd(), OUTPUT_FILE), `${csv}\r\n`, 'utf8');
  console.log(`Wrote ${rows.length} rows to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
