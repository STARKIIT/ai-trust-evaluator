/**
 * AI Output Evaluator - Master Test Runner
 * Executes active test suites phase by phase.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const suites = [
  { name: 'Phase 1: Chrome Extension Foundation', file: 'phase1.test.js' },
  { name: 'Phase 2: Backend Orchestration Foundation', file: 'phase2.test.js' },
  { name: 'Phase 3: Segmentation & Evaluators', file: 'phase3.test.js' },
  { name: 'Phase 4: Aggregation, Scoring & Attention Areas', file: 'phase4.test.js' },
  { name: 'Phase 5: Advanced UX & Highlighting', file: 'phase5.test.js' }
];

function logToExecutionFile(message) {
  const logStr = `[${new Date().toISOString()}] TEST RUNNER: ${message}\n`;
  fs.appendFileSync(path.join(__dirname, '../../execution.log'), logStr);
}

function runSuite(index) {
  if (index >= suites.length) {
    console.log('\n====================================================');
    console.log('All executed test suites completed successfully. ✅');
    console.log('====================================================');
    logToExecutionFile('All executed test suites completed successfully.');
    process.exit(0);
    return;
  }

  const suite = suites[index];
  console.log(`Starting suite: ${suite.name}`);
  logToExecutionFile(`Starting test suite: ${suite.name}`);

  const child = spawn('node', [path.join(__dirname, suite.file)], { stdio: 'inherit' });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`\n✗ Suite failed: ${suite.name} with code ${code}`);
      logToExecutionFile(`Suite failed: ${suite.name} with code ${code}`);
      process.exit(code);
    }
    console.log(`✓ Suite completed: ${suite.name}\n`);
    logToExecutionFile(`Suite completed: ${suite.name}`);
    runSuite(index + 1);
  });
}

// Start running suites
runSuite(0);
