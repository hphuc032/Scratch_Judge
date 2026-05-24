# Scratch Auto Judge

Scratch Auto Judge is a small NodeJS + Express backend for judging Scratch `.sb3` submissions.

It uses `scratch-vm` to run Scratch projects in NodeJS, injects testcase input through normal Scratch `ask and wait` / `answer`, then reads the final result from a Scratch variable named `KQ`.

## Requirements

- NodeJS LTS

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Default server:

```text
http://localhost:3000
```

## Grade A Folder Of Students

Start the judge server first:

```bash
npm start
```

Then run the folder grading script in another terminal:

```powershell
node batch-grade-folder.js "D:\SUBMISSIONS"
```

Expected folder layout:

```text
D:\SUBMISSIONS\
  Nguyen Van A\
    bai1.sb3
    bai2.sb3
    bai3.sb3
    bai4.sb3
  Tran Thi B\
    bai1.sb3
    bai3.sb3
```

The script maps files to problems like this:

```text
bai1.sb3 -> problem1
bai2.sb3 -> problem2
bai3.sb3 -> problem3
bai4.sb3 -> problem4
```

It writes `results.csv` with these columns:

```text
student,file,problem,verdict,passed,total,score,message
```

## Test API

Single submission:

PowerShell:

```powershell
curl.exe -F "file=@sample.sb3" -F "problem=problem1" http://localhost:3000/submit
```

Example response:

```json
{
  "verdict": "ACCEPTED",
  "passed": 10,
  "total": 10
}
```

Batch submissions:

```powershell
curl.exe -F "files=@student1.sb3" -F "files=@student2.sb3" -F "problem=problem1" http://localhost:3000/submit-batch
```

Example batch response:

```json
[
  {
    "file": "student1.sb3",
    "verdict": "ACCEPTED",
    "passed": 10,
    "total": 10
  },
  {
    "file": "bad.sb3",
    "verdict": "ERROR",
    "message": "..."
  }
]
```

## Scratch Project Format

Students create a normal Scratch project and export it as `.sb3`.

The project should:

1. Use `ask and wait` to read input.
2. Use `answer` to get the current input value.
3. Store the final answer in a variable named exactly `KQ`.

The judge returns the next line from `inputXX.txt` for each `ask and wait`.

## Testcase Format

Problems are stored in `problems/`.

```text
problems/
  problem1/
    input01.txt
    output01.txt
    input02.txt
    output02.txt
```

Each `inputXX.txt` must have a matching `outputXX.txt`.

Possible verdicts:

```text
ACCEPTED
WRONG ANSWER
```
