/**
 * AI Output Evaluator - Central Server
 * Exposes /api/evaluate orchestration endpoint and logs activities.
 * Phase 3: Now integrates segmenter and evaluator engines.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');
const { segmentResponse, preprocessText } = require('./engines/segmenter');
const { runAllEvaluators, mockAssumptions, mockHallucinations, mockLogic, mockJudge } = require('./engines/evaluators');
const { aggregateEvaluations } = require('./engines/aggregator');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Log helper following rules.md Rule 5
function logEvent(level, message) {
  const timestamp = new Date().toISOString();
  const logStr = `[${timestamp}] [SERVER] [${level.toUpperCase()}]: ${message}\n`;
  console.log(logStr.trim());
  try {
    fs.appendFileSync(path.join(__dirname, '../execution.log'), logStr);
  } catch (err) {
    console.error('Failed to write to execution.log:', err);
  }
}

// Validation Schema for incoming evaluations
const evaluationRequestSchema = z.object({
  platform: z.string().optional().default('unknown'),
  prompt: z.string().optional().default(''),
  response: z.string().optional().default(''),
  selected_text: z.string().optional().default(''),
  metadata: z.record(z.any()).optional().default({})
});

// Setup Gemini Client
let genAI = null;
if (config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'stub_test_key_placeholder') {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  logEvent('info', 'Gemini Generative AI client initialized successfully.');
} else {
  logEvent('warn', 'Starting server with stub/mock API configuration.');
}

// Main Orchestration Endpoint
app.post('/api/evaluate', async (req, res) => {
  logEvent('info', `Received evaluation request for platform: ${req.body.platform || 'unknown'}`);
  
  // 1. Validate Input Body
  const parsedBody = evaluationRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    logEvent('error', `Invalid request parameters: ${JSON.stringify(parsedBody.error.format())}`);
    return res.status(400).json({ success: false, error: 'Invalid parameters', details: parsedBody.error.format() });
  }

  const { prompt, response, selected_text } = parsedBody.data;

  // Verify there is content to evaluate
  if (!response && !selected_text) {
    logEvent('warn', 'Request rejected: No response or selected text provided.');
    return res.status(400).json({ success: false, error: 'Either response or selected_text must be provided for evaluation.' });
  }

  // 2. Determine text to evaluate
  const textToEvaluate = selected_text || response;

  // 3. Mock Mode (test env or no API key)
  if (!genAI || config.NODE_ENV === 'test') {
    logEvent('info', 'Processing request in MOCK/TEST mode.');
    return res.json(generateMockResponse(parsedBody.data));
  }

  // 4. Live Evaluation Pipeline
  try {
    // 4a. Preprocess and Segment
    logEvent('info', 'Running preprocessing and segmentation...');
    const cleanedText = preprocessText(textToEvaluate);
    const segments = segmentResponse(cleanedText);
    logEvent('info', `Segmentation complete: ${segments.length} segments identified.`);

    // 4b. Run all evaluators in parallel via Gemini
    logEvent('info', 'Dispatching evaluators (assumptions, hallucinations, logic, judge)...');
    const evalResults = await runAllEvaluators(prompt, cleanedText);
    logEvent('info', `Evaluators completed. Used mock: ${evalResults.usedMock}`);

    // 4c. Build unified response using aggregator
    const resultPayload = aggregateEvaluations(evalResults, segments);

    logEvent('info', `Evaluation complete. Trust level: ${resultPayload.overall_trust}`);
    return res.json(resultPayload);

  } catch (error) {
    logEvent('error', `Evaluation pipeline failure: ${error.message}`);
    return res.status(500).json({ success: false, error: `Evaluation error: ${error.message}` });
  }
});

// Helper for Mock Data using Phase 4 Aggregation
function generateMockResponse(data) {
  const content = data.selected_text || data.response;
  const isSuspicious = content.toLowerCase().includes('hallucinate') || content.toLowerCase().includes('fake');

  const cleanedText = preprocessText(content);
  const segments = segmentResponse(cleanedText);

  // Generate simulated evaluator outputs
  const assumptionsObj = mockAssumptions();
  const hallucinationsObj = isSuspicious 
    ? { hallucinations: [{ claim: "Self-contradictory assertions", severity: "HIGH", reason: "Found references mimicking hallucinations." }] } 
    : mockHallucinations();
  const logicObj = isSuspicious 
    ? { coherence: "POOR", issues: ["Input contains potential self-contradictory phrases."], strengths: [], causal_chain_valid: false } 
    : mockLogic();
  const judgeObj = isSuspicious 
    ? { verdict: "REJECTED", score_rating: 3, rationale: "Mock response generated for test simulation purposes.", strengths: [], weaknesses: ["Suspicious words found."] } 
    : mockJudge();

  const evalResults = {
    assumptions: assumptionsObj,
    hallucinations: hallucinationsObj,
    logic: logicObj,
    judge: judgeObj,
    usedMock: true
  };

  return aggregateEvaluations(evalResults, segments);
}

// Start Server — reads PORT from env at startup to support test port injection
const listenPort = parseInt(process.env.PORT) || config.PORT;
const server = app.listen(listenPort, () => {
  logEvent('info', `Evaluation Server running on port ${listenPort} in ${config.NODE_ENV} environment.`);
});

// Graceful shutdowns
process.on('SIGTERM', () => {
  server.close(() => {
    logEvent('info', 'Evaluation Server terminated gracefully.');
  });
});

module.exports = { app, server };
