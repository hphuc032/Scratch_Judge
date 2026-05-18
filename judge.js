process.removeAllListeners('warning');

const fs = require('fs/promises');
const path = require('path');
const ScratchVM = require('scratch-vm');

const DEFAULT_TIMEOUT_MS = 5000;
const RESULT_VARIABLE_NAME = 'KQ';

function constructVM() {
  const vm = new ScratchVM();

  vm.convertToPackagedRuntime();
  vm.setTurboMode(true);
  vm.setFramerate(250);

  vm.extensionManager.loadExtensionIdSync =
    vm.extensionManager.loadExtensionURL = (id) => {
      throw new Error(`Project uses unsupported extension: ${id}`);
    };

  return vm;
}

function normalizeOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
}

function makeInputProvider(inputText) {
  const lines = String(inputText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let lineIndex = 0;

  return function nextAnswer() {
    if (lineIndex >= lines.length) return '';
    return lines[lineIndex++];
  };
}

function getVariableValue(vm, variableName) {
  for (const target of vm.runtime.targets) {
    if (!target || !target.variables) continue;

    for (const variable of Object.values(target.variables)) {
      if (variable && variable.name === variableName) {
        return variable.value;
      }
    }
  }

  return '';
}

async function loadTestcases(problemDir) {
  const entries = await fs.readdir(problemDir);
  const inputFiles = entries
    .filter((name) => /^input\d+\.txt$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const testcases = [];
  for (const inputFile of inputFiles) {
    const id = inputFile.match(/\d+/)[0];
    const outputFile = `output${id}.txt`;
    const outputPath = path.join(problemDir, outputFile);

    try {
      await fs.access(outputPath);
    } catch {
      throw new Error(`Missing expected output file: ${outputFile}`);
    }

    testcases.push({
      id,
      inputFile,
      outputFile,
      input: await fs.readFile(path.join(problemDir, inputFile), 'utf8'),
      expected: await fs.readFile(outputPath, 'utf8')
    });
  }

  if (testcases.length === 0) {
    throw new Error(`No testcases found in ${problemDir}`);
  }

  return testcases;
}

async function runOneTestcase(projectBuffer, testcase, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const vm = constructVM();
  const nextAnswer = makeInputProvider(testcase.input);
  let timeoutHandle;

  vm.runtime._scratch_run_say = () => {};
  vm.runtime._scratch_run_think = () => {};
  vm.runtime._scratch_run_ask = () => nextAnswer();

  await vm.loadProject(projectBuffer);

  for (const target of vm.runtime.targets) {
    target.setVisible(false);
  }

  vm.runtime.precompile();

  const finished = new Promise((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      try {
        vm.runtime.quit();
      } catch {}
      reject(new Error('TIMEOUT'));
    }, timeoutMs);

    vm.runtime.once('PROJECT_RUN_STOP', () => resolve());
  });

  vm.start();
  vm.greenFlag();

  await finished.finally(() => {
    clearTimeout(timeoutHandle);
    try {
      vm.runtime.quit();
    } catch {}
  });

  const actual = getVariableValue(vm, RESULT_VARIABLE_NAME);
  const passed = normalizeOutput(actual) === normalizeOutput(testcase.expected);

  return {
    id: testcase.id,
    passed,
    expected: normalizeOutput(testcase.expected),
    actual: normalizeOutput(actual)
  };
}

async function judgeSubmission(projectPath, options = {}) {
  const problem = options.problem || 'problem1';
  const problemsRoot = options.problemsRoot || path.join(__dirname, 'problems');
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const problemDir = path.join(problemsRoot, problem);

  const [projectBuffer, testcases] = await Promise.all([
    fs.readFile(projectPath),
    loadTestcases(problemDir)
  ]);

  let passed = 0;
  const results = [];

  for (const testcase of testcases) {
    let result;
    try {
      result = await runOneTestcase(projectBuffer, testcase, timeoutMs);
    } catch (error) {
      result = {
        id: testcase.id,
        passed: false,
        expected: normalizeOutput(testcase.expected),
        actual: '',
        error: error.message
      };
    }

    results.push(result);
    if (result.passed) passed += 1;
  }

  return {
    verdict: passed === testcases.length ? 'ACCEPTED' : 'WRONG ANSWER',
    passed,
    total: testcases.length,
    results
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  RESULT_VARIABLE_NAME,
  judgeSubmission,
  loadTestcases,
  normalizeOutput,
  runOneTestcase
};
