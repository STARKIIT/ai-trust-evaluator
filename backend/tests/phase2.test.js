/**
 * Phase 2 Integration Test Suite
 * Tests Express Router routing, validation schemas, and mock evaluation pathways.
 * Uses Node's built-in http module for compatibility across Node versions.
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('Running Test Suite: Phase 2 (Backend Foundation)');
console.log('----------------------------------------------------');

const TEST_PORT = 3099; // Isolated test port

function logStep(msg) {
  const logStr = `[${new Date().toISOString()}] TEST (Phase 2): ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, '../../execution.log'), logStr);
}

// Helper: HTTP POST using http module (no fetch dependency)
function httpPost(port, urlPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`JSON parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function runTests() {
  // Set env before requiring server
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);

  let server;
  try {
    // Start server
    const appModule = require('../server');
    server = appModule.server;

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    logStep(`Started backend server on test port ${TEST_PORT}.`);

    // -------------------------------------------------------
    // Test 1: Empty body returns 400 with correct error text
    // -------------------------------------------------------
    console.log('\nTest 1: Validating empty body rejection...');
    const res1 = await httpPost(TEST_PORT, '/api/evaluate', {});
    
    assert.strictEqual(res1.status, 400, `Expected 400 but got ${res1.status}`);
    assert.strictEqual(res1.body.success, false);
    assert.ok(
      res1.body.error && res1.body.error.includes('Either response or selected_text'),
      `Expected "Either response..." error, got: ${JSON.stringify(res1.body)}`
    );
    console.log('✓ Test 1 Passed: Empty body rejected with 400 and correct message');
    logStep('Test 1 Passed: Empty body rejected with 400');

    // -------------------------------------------------------
    // Test 2: Valid response returns 200 with correct schema
    // -------------------------------------------------------
    console.log('\nTest 2: Validating standard evaluation response schema...');
    const res2 = await httpPost(TEST_PORT, '/api/evaluate', {
      platform: 'claude',
      prompt: 'What is 2+2?',
      response: 'The answer is 4.'
    });

    assert.strictEqual(res2.status, 200, `Expected 200 but got ${res2.status}`);
    const d2 = res2.body;
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(d2.overall_trust), `Unexpected trust level: ${d2.overall_trust}`);
    assert.ok(typeof d2.reliability_summary === 'string', 'Missing reliability_summary');
    assert.ok(Array.isArray(d2.assumptions), 'assumptions must be an array');
    assert.ok(Array.isArray(d2.hallucinations), 'hallucinations must be an array');
    assert.ok(typeof d2.judge_verdict === 'object', 'Missing judge_verdict object');
    assert.ok(typeof d2.judge_verdict.score_rating === 'number', 'Missing numeric score_rating');
    console.log('✓ Test 2 Passed: Standard evaluation returns complete JSON schema');
    logStep('Test 2 Passed: Standard evaluation returns complete JSON schema');

    // -------------------------------------------------------
    // Test 3: Suspicious keywords trigger LOW trust + hallucinations
    // -------------------------------------------------------
    console.log('\nTest 3: Validating risk escalation for suspicious content...');
    const res3 = await httpPost(TEST_PORT, '/api/evaluate', {
      platform: 'chatgpt',
      response: 'This is a fake hallucinate claim.'
    });

    assert.strictEqual(res3.status, 200);
    const d3 = res3.body;
    assert.strictEqual(d3.overall_trust, 'LOW', `Expected LOW trust for suspicious input, got: ${d3.overall_trust}`);
    assert.strictEqual(d3.judge_verdict.verdict, 'REJECTED');
    assert.strictEqual(d3.hallucinations.length, 1, 'Expected exactly 1 hallucination entry');
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(d3.hallucinations[0].severity.toUpperCase()), 'Missing severity field');
    console.log('✓ Test 3 Passed: Suspicious input escalates to LOW trust and flags hallucination');
    logStep('Test 3 Passed: Risk trigger conditions modify mock output correctly');

    // -------------------------------------------------------
    // Test 4: selected_text only (no response field) is accepted
    // -------------------------------------------------------
    console.log('\nTest 4: Validating selected_text-only evaluation...');
    const res4 = await httpPost(TEST_PORT, '/api/evaluate', {
      platform: 'gemini',
      selected_text: 'This specific claim needs evaluation.'
    });

    assert.strictEqual(res4.status, 200, `Expected 200 but got ${res4.status}`);
    console.log('✓ Test 4 Passed: selected_text-only requests are accepted');
    logStep('Test 4 Passed: selected_text-only requests are accepted');

    console.log('\n✅ All Phase 2 tests passed successfully!');
    logStep('All Phase 2 tests passed.');

    server.close();
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Integration test failed:');
    console.error(error.stack || error.message);
    logStep(`Test failure: ${error.message}`);
    if (server) server.close();
    process.exit(1);
  }
}

runTests();
