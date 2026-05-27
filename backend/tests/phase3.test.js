/**
 * Phase 3 Test Suite
 * Tests segmentation engine, evaluator module schemas, and mock evaluator outputs.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('Running Test Suite: Phase 3 (Segmentation & Evaluators)');
console.log('----------------------------------------------------');

function logStep(msg) {
  const logStr = `[${new Date().toISOString()}] TEST (Phase 3): ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, '../../execution.log'), logStr);
}

// Set test env before requiring modules
process.env.NODE_ENV = 'test';

const { segmentResponse, preprocessText, classifySegment, SEGMENT_TYPES } = require('../engines/segmenter');
const {
  mockAssumptions, mockHallucinations, mockLogic, mockJudge, runAllEvaluators
} = require('../engines/evaluators');

async function runTests() {
  try {
    // ═══════════════════════════════════════════════════════════════════════
    //  SEGMENTER TESTS
    // ═══════════════════════════════════════════════════════════════════════

    // Test 1: preprocessText normalizes whitespace
    console.log('\nTest 1: preprocessText normalizes whitespace...');
    const rawText = "Hello\r\n\r\n\r\n\r\nWorld\t\tExtra    spaces";
    const cleaned = preprocessText(rawText);
    assert.ok(!cleaned.includes('\r\n'), 'Should remove Windows line endings');
    assert.ok(!cleaned.includes('\t'), 'Should replace tabs');
    assert.ok(!cleaned.includes('  '), 'Should collapse multiple spaces');
    console.log('✓ Test 1 Passed: preprocessText normalizes whitespace correctly');
    logStep('Test 1 Passed: preprocessText normalizes whitespace');

    // Test 2: segmentResponse produces segments from multi-sentence text
    console.log('\nTest 2: segmentResponse produces typed segments...');
    const sampleResponse = `The average temperature in summer is 35 degrees. Therefore, air conditioning usage increases significantly. You should consider installing a heat pump. According to the EPA, energy consumption rises by 20% in July.`;
    const segments = segmentResponse(sampleResponse);

    assert.ok(segments.length > 0, 'Should produce at least one segment');
    assert.ok(segments.every(s => s.id && s.type && s.content), 'Every segment must have id, type, and content');
    console.log(`   Produced ${segments.length} segments`);
    console.log('✓ Test 2 Passed: segmentResponse produces valid typed segments');
    logStep('Test 2 Passed: segmentResponse produces valid typed segments');

    // Test 3: classifySegment detects reasoning markers
    console.log('\nTest 3: classifySegment detects reasoning chain markers...');
    const reasoningSentence = 'Therefore, the system will fail under load.';
    assert.strictEqual(classifySegment(reasoningSentence), SEGMENT_TYPES.REASONING);
    console.log('✓ Test 3 Passed: Reasoning sentence classified as reasoning_chain');
    logStep('Test 3 Passed: Reasoning classification works');

    // Test 4: classifySegment detects numerical estimates
    console.log('\nTest 4: classifySegment detects numerical estimates...');
    const numericalSentence = 'The system processes 500 million requests per day.';
    assert.strictEqual(classifySegment(numericalSentence), SEGMENT_TYPES.NUMERICAL_ESTIMATE);
    console.log('✓ Test 4 Passed: Numerical sentence classified as numerical_estimate');
    logStep('Test 4 Passed: Numerical classification works');

    // Test 5: classifySegment detects citations
    console.log('\nTest 5: classifySegment detects citation markers...');
    const citationSentence = 'According to the World Bank, poverty rates declined.';
    assert.strictEqual(classifySegment(citationSentence), SEGMENT_TYPES.CITATION);
    console.log('✓ Test 5 Passed: Citation sentence classified as citation');
    logStep('Test 5 Passed: Citation classification works');

    // Test 6: segmentResponse handles code blocks
    console.log('\nTest 6: segmentResponse extracts code blocks...');
    const codeText = 'Here is an example.\n\n```python\nprint("hello")\n```\n\nThis shows the output.';
    const codeSegments = segmentResponse(codeText);
    const codeBlock = codeSegments.find(s => s.type === SEGMENT_TYPES.CODE_BLOCK);
    assert.ok(codeBlock, 'Should find a code_block segment');
    assert.ok(codeBlock.content.includes('print'), 'Code block should contain the code content');
    console.log('✓ Test 6 Passed: Code blocks extracted and typed correctly');
    logStep('Test 6 Passed: Code block extraction works');

    // Test 7: segmentResponse handles empty/null input gracefully
    console.log('\nTest 7: segmentResponse handles edge cases...');
    assert.deepStrictEqual(segmentResponse(''), [], 'Empty string returns empty array');
    assert.deepStrictEqual(segmentResponse(null), [], 'Null input returns empty array');
    assert.deepStrictEqual(segmentResponse(undefined), [], 'Undefined input returns empty array');
    console.log('✓ Test 7 Passed: Edge cases handled gracefully');
    logStep('Test 7 Passed: Edge case handling works');

    // ═══════════════════════════════════════════════════════════════════════
    //  EVALUATOR MODULE TESTS (Mock Mode)
    // ═══════════════════════════════════════════════════════════════════════

    // Test 8: mockAssumptions returns valid schema
    console.log('\nTest 8: Mock assumption extractor schema validation...');
    const assumptions = mockAssumptions();
    assert.ok(Array.isArray(assumptions.assumptions), 'assumptions field must be an array');
    assert.ok(assumptions.assumptions.length > 0, 'Should return at least one mock assumption');
    for (const a of assumptions.assumptions) {
      assert.ok(typeof a.category === 'string', 'Each assumption needs a category');
      assert.ok(typeof a.text === 'string', 'Each assumption needs text');
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(a.confidence), `Invalid confidence: ${a.confidence}`);
    }
    console.log('✓ Test 8 Passed: Mock assumptions match expected schema');
    logStep('Test 8 Passed: Mock assumptions schema valid');

    // Test 9: mockHallucinations returns valid schema
    console.log('\nTest 9: Mock hallucination analyzer schema validation...');
    const hallucinations = mockHallucinations();
    assert.ok(Array.isArray(hallucinations.hallucinations), 'hallucinations field must be an array');
    console.log('✓ Test 9 Passed: Mock hallucinations match expected schema');
    logStep('Test 9 Passed: Mock hallucinations schema valid');

    // Test 10: mockLogic returns valid schema
    console.log('\nTest 10: Mock logic analyzer schema validation...');
    const logic = mockLogic();
    assert.ok(['POOR', 'FAIR', 'GOOD', 'EXCELLENT'].includes(logic.coherence), `Invalid coherence: ${logic.coherence}`);
    assert.ok(Array.isArray(logic.issues), 'issues must be an array');
    assert.ok(Array.isArray(logic.strengths), 'strengths must be an array');
    assert.strictEqual(typeof logic.causal_chain_valid, 'boolean', 'causal_chain_valid must be boolean');
    console.log('✓ Test 10 Passed: Mock logic analysis matches expected schema');
    logStep('Test 10 Passed: Mock logic schema valid');

    // Test 11: mockJudge returns valid schema
    console.log('\nTest 11: Mock LLM-as-a-Judge schema validation...');
    const judge = mockJudge();
    assert.ok(['APPROVED', 'CONDITIONAL', 'REJECTED'].includes(judge.verdict), `Invalid verdict: ${judge.verdict}`);
    assert.ok(typeof judge.score_rating === 'number', 'score_rating must be a number');
    assert.ok(judge.score_rating >= 1 && judge.score_rating <= 10, 'score_rating must be 1-10');
    assert.ok(typeof judge.rationale === 'string', 'rationale must be a string');
    assert.ok(Array.isArray(judge.strengths), 'strengths must be an array');
    assert.ok(Array.isArray(judge.weaknesses), 'weaknesses must be an array');
    console.log('✓ Test 11 Passed: Mock judge verdict matches expected schema');
    logStep('Test 11 Passed: Mock judge schema valid');

    // Test 12: runAllEvaluators orchestrates all modules and returns combined results
    console.log('\nTest 12: runAllEvaluators orchestration (mock mode)...');
    const combined = await runAllEvaluators('Test prompt', 'Test response text.');
    assert.strictEqual(typeof combined.usedMock, 'boolean', 'usedMock must be a boolean');
    assert.ok(combined.assumptions, 'Must contain assumptions result');
    assert.ok(combined.hallucinations, 'Must contain hallucinations result');
    assert.ok(combined.logic, 'Must contain logic result');
    assert.ok(combined.judge, 'Must contain judge result');
    console.log('✓ Test 12 Passed: runAllEvaluators returns all four evaluator results');
    logStep('Test 12 Passed: runAllEvaluators orchestration works');

    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n✅ All Phase 3 tests passed successfully!');
    logStep('All Phase 3 tests passed.');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Test validation failed:');
    console.error(error.stack || error.message);
    logStep(`Test failure: ${error.message}`);
    process.exit(1);
  }
}

runTests();
