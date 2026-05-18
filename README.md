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

## Test API

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
