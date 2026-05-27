/**
 * Phase 4 Test Suite
 * Tests scoring logic, boundary conditions, risk aggregation, and API payload contracts.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('----------------------------------------------------');
console.log('Running Test Suite: Phase 4 (Aggregation & Scoring)');
console.log('----------------------------------------------------');

function logStep(msg) {
  const logStr = `[${new Date().toISOString()}] TEST (Phase 4): ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, '../../execution.log'), logStr);
}

// Set test env
process.env.NODE_ENV = 'test';
const TEST_PORT = 3101;

// Require modules under test
const {
  computeHallucinationScore,
  computeLogicScore,
  computeJudgeScore,
  computeAssumptionScore,
  classifyTrust,
  aggregateEvaluations,
  DIMENSION_WEIGHTS
} = require('../engines/aggregator');

const { SEGMENT_TYPES } = require('../engines/segmenter');

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
  try {
    // ═══════════════════════════════════════════════════════════════════════
    //  SCORER UNIT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    // Test 1: computeHallucinationScore penalties and bounds
    console.log('\nTest 1: computeHallucinationScore penalties...');
    assert.strictEqual(computeHallucinationScore([]), 1.0, 'No hallucinations must yield 1.0');
    
    // MEDIUM severity = RISK_LEVELS.MEDIUM (2) * 0.15 = 0.30 penalty -> 0.70
    const scoreMed = computeHallucinationScore([{ severity: 'MEDIUM', claim: 'x' }]);
    assert.strictEqual(scoreMed, 0.70, 'One MEDIUM hallucination should yield 0.70');

    // HIGH severity = RISK_LEVELS.HIGH (3) * 0.15 = 0.45 penalty. LOW severity = RISK_LEVELS.LOW (1) * 0.15 = 0.15 penalty. Total = 0.60 penalty -> 0.40
    const scoreMultiple = computeHallucinationScore([
      { severity: 'HIGH', claim: 'a' },
      { severity: 'LOW', claim: 'b' }
    ]);
    assert.strictEqual(Math.round(scoreMultiple * 100) / 100, 0.40, 'Multiple hallucinations should subtract severity penalties');

    // Floor at 0.0
    const scoreFloored = computeHallucinationScore([
      { severity: 'HIGH', claim: 'a' },
      { severity: 'HIGH', claim: 'b' },
      { severity: 'HIGH', claim: 'c' }
    ]);
    assert.strictEqual(scoreFloored, 0.0, 'Hallucination score must floor at 0.0');
    console.log('✓ Test 1 Passed: Hallucination scorer penalties and floor bounds match specification');
    logStep('Test 1 Passed: computeHallucinationScore penalties');

    // Test 2: computeLogicScore reasoning chain validity & coherence levels
    console.log('\nTest 2: computeLogicScore reasoning chain...');
    // EXCELLENT (0.95), 0 issues (0.0), causal_chain_valid = true (+0.05) -> 1.0
    const scoreExcellent = computeLogicScore({ coherence: 'EXCELLENT', issues: [], causal_chain_valid: true });
    assert.strictEqual(scoreExcellent, 1.0);

    // GOOD (0.75), 1 issue (-0.10), causal_chain_valid = false (-0.10) -> 0.55
    const scoreGoodIssues = computeLogicScore({ coherence: 'GOOD', issues: ['an issue'], causal_chain_valid: false });
    assert.strictEqual(Math.round(scoreGoodIssues * 100) / 100, 0.55);

    // Floor at 0.0
    const scorePoor = computeLogicScore({ coherence: 'POOR', issues: ['a', 'b', 'c', 'd'], causal_chain_valid: false });
    assert.strictEqual(scorePoor, 0.0, 'Logic score must floor at 0.0');
    console.log('✓ Test 2 Passed: Logic scorer coherence ratings and penalties are correct');
    logStep('Test 2 Passed: computeLogicScore coherence calculations');

    // Test 3: computeJudgeScore scaling
    console.log('\nTest 3: computeJudgeScore rating mapping...');
    assert.strictEqual(computeJudgeScore({ score_rating: 10 }), 1.0);
    assert.strictEqual(computeJudgeScore({ score_rating: 5 }), 0.5);
    assert.strictEqual(computeJudgeScore({ score_rating: 1 }), 0.1);
    console.log('✓ Test 3 Passed: Judge rating score scaling verified');
    logStep('Test 3 Passed: computeJudgeScore scaling');

    // Test 4: computeAssumptionScore unstated risk mapping
    console.log('\nTest 4: computeAssumptionScore unstated risks...');
    assert.strictEqual(computeAssumptionScore([]), 1.0);
    
    // MEDIUM confidence assumption = RISK_LEVELS.MEDIUM (2) * 0.05 = 0.10 penalty -> 0.90
    const scoreAssumpMed = computeAssumptionScore([{ confidence: 'MEDIUM', text: 'x' }]);
    assert.strictEqual(scoreAssumpMed, 0.90);

    // HIGH confidence assumption = RISK_LEVELS.HIGH (3) * 0.05 = 0.15 penalty -> 0.85
    const scoreAssumpHigh = computeAssumptionScore([{ confidence: 'HIGH', text: 'x' }]);
    assert.strictEqual(scoreAssumpHigh, 0.85);
    console.log('✓ Test 4 Passed: Assumption scorer risk penalties are correct');
    logStep('Test 4 Passed: computeAssumptionScore unstated risk calculations');

    // Test 5: classifyTrust score classification boundaries
    console.log('\nTest 5: classifyTrust boundary conditions...');
    assert.strictEqual(classifyTrust(0.85), 'HIGH');
    assert.strictEqual(classifyTrust(0.75), 'HIGH');
    assert.strictEqual(classifyTrust(0.74), 'MEDIUM');
    assert.strictEqual(classifyTrust(0.45), 'MEDIUM');
    assert.strictEqual(classifyTrust(0.44), 'LOW');
    assert.strictEqual(classifyTrust(0.10), 'LOW');
    console.log('✓ Test 5 Passed: Trust classification boundaries validated');
    logStep('Test 5 Passed: classifyTrust boundaries');

    // Test 6: aggregateEvaluations weights normalized mapping
    console.log('\nTest 6: aggregateEvaluations scoring and metadata extraction...');
    const mockEvaluatorResults = {
      assumptions: {
        assumptions: [
          { category: 'market', text: 'Assuming normal distribution', confidence: 'HIGH' } // penalty 0.15 -> score 0.85
        ]
      },
      hallucinations: {
        hallucinations: [
          { claim: 'Simulated hallucination', severity: 'MEDIUM', reason: 'Fails to verify' } // penalty 0.30 -> score 0.70
        ]
      },
      logic: {
        coherence: 'GOOD', // 0.75
        issues: ['Some small leap'], // penalty 0.10
        strengths: ['Clear start'],
        causal_chain_valid: true // bonus 0.05 -> score 0.70
      },
      judge: {
        verdict: 'APPROVED',
        score_rating: 8, // score 0.80
        rationale: 'Good response overall',
        strengths: [],
        weaknesses: []
      }
    };

    const mockSegments = [
      { id: 'seg-1', type: SEGMENT_TYPES.REASONING, content: 'This is a logical reasoning step.' },
      { id: 'seg-2', type: SEGMENT_TYPES.NUMERICAL_ESTIMATE, content: 'We predict a growth of 15% next year.' }
    ];

    const result = aggregateEvaluations(mockEvaluatorResults, mockSegments);

    // Verify weights:
    // assumptions: weight 0.15 * score 0.85 = 0.1275
    // hallucination: weight 0.30 * score 0.70 = 0.21
    // logic: weight 0.25 * score 0.70 = 0.175
    // judge: weight 0.20 * score 0.80 = 0.16
    // calibration: weight 0.10 * score 0.70 = 0.07 (placeholder)
    // Expected Weighted Sum = 0.1275 + 0.21 + 0.175 + 0.16 + 0.07 = 0.7425 -> approx 0.74
    assert.strictEqual(result.weighted_score, 0.74, `Expected weighted score 0.74, got ${result.weighted_score}`);
    assert.strictEqual(result.overall_trust, 'MEDIUM', `Expected trust MEDIUM, got ${result.overall_trust}`);
    assert.ok(Math.abs(result.dimension_scores.hallucination - 0.70) < 0.001);
    assert.ok(Math.abs(result.dimension_scores.logic - 0.70) < 0.001);
    assert.ok(Math.abs(result.dimension_scores.judge - 0.80) < 0.001);
    assert.ok(Math.abs(result.dimension_scores.assumptions - 0.85) < 0.001);
    console.log('✓ Test 6 Passed: aggregateEvaluations returns expected weighted scores and detail lists');
    logStep('Test 6 Passed: aggregateEvaluations weighting');

    // Test 7: buildAttentionAreas segment mapping
    console.log('\nTest 7: buildAttentionAreas segment mapping...');
    // We pass a segment matching the hallucination claim to check mapping
    const matchSegments = [
      { id: 'seg-halluc', type: SEGMENT_TYPES.RECOMMENDATION, content: 'Simulated hallucination is real.' },
      { id: 'seg-num', type: SEGMENT_TYPES.NUMERICAL_ESTIMATE, content: 'The value is 45 dollars.' }
    ];
    const areas = result.attention_segments || [];
    
    // Test that the hallucination segment is correctly matched (contains case-insensitive substring of 'Simulated hallucination')
    const hallucArea = areas.find(a => a.type === 'hallucination_risk');
    assert.ok(hallucArea, 'Should create a hallucination risk attention area');
    
    // We should run buildAttentionAreas directly to verify ID matching
    const { aggregateEvaluations: reEval } = require('../engines/aggregator');
    const customResult = reEval(mockEvaluatorResults, matchSegments);
    const customAreas = customResult.attention_segments;

    const matchedHalluc = customAreas.find(a => a.type === 'hallucination_risk');
    assert.strictEqual(matchedHalluc.segment_id, 'seg-halluc', 'Should map the segment ID correctly');

    const matchedNumerical = customAreas.find(a => a.type === 'numerical_verification_needed');
    assert.strictEqual(matchedNumerical.segment_id, 'seg-num', 'Should find numerical estimate segment and map ID');
    console.log('✓ Test 7 Passed: Attention segment identification matches substring claims and types');
    logStep('Test 7 Passed: buildAttentionAreas segment mapping');

    // ═══════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST WITH SERVER
    // ═══════════════════════════════════════════════════════════════════════

    // Test 8: Integrated endpoint evaluation under mock server environment
    console.log('\nTest 8: Testing integrated Express server endpoint schema...');
    process.env.PORT = String(TEST_PORT);
    const { server } = require('../server');

    // Wait briefly for server startup
    await new Promise(r => setTimeout(r, 200));

    const responsePayload = await httpPost(TEST_PORT, '/api/evaluate', {
      platform: 'claude',
      prompt: 'Is this real?',
      response: 'This is a fake hallucinate claim with a value of 100 dollars.'
    });

    assert.strictEqual(responsePayload.status, 200);
    const body = responsePayload.body;
    
    // Assert all Phase 4 specific fields are populated in integration
    assert.ok(body.hasOwnProperty('weighted_score'), 'Missing weighted_score');
    assert.ok(body.hasOwnProperty('dimension_scores'), 'Missing dimension_scores');
    assert.ok(body.hasOwnProperty('dimension_details'), 'Missing dimension_details');
    assert.ok(body.hasOwnProperty('attention_segments'), 'Missing attention_segments');
    assert.strictEqual(body.overall_trust, 'LOW', 'Suspicious content must resolve to LOW trust');
    
    // Clean up server
    server.close();
    console.log('✓ Test 8 Passed: Endpoint returns detailed aggregator schema keys');
    logStep('Test 8 Passed: Integrated endpoint evaluation');

    console.log('\n✅ All Phase 4 tests passed successfully!');
    logStep('All Phase 4 tests passed.');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Test validation failed:');
    console.error(error.stack || error.message);
    logStep(`Test failure: ${error.message}`);
    process.exit(1);
  }
}

runTests();
