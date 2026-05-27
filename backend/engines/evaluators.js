/**
 * Evaluator Modules
 * Independent evaluators for Assumptions, Hallucinations, Logic/Reasoning, and LLM-as-a-Judge.
 * Each uses Gemini API with strict JSON schema responses for deterministic parsing.
 */

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const config = require('../config');

// Gemini client (only instantiate if real key is present)
let genAI = null;
if (config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'stub_test_key_placeholder') {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

// ─── Helper: Call Gemini with a schema-enforced prompt ───────────────────────
// Direct call to Gemini
async function callGeminiDirect({ modelName = 'gemini-2.5-flash', systemPrompt, userContent, responseSchema }) {
  if (!genAI) {
    throw new Error('Gemini client is not initialized. Ensure GEMINI_API_KEY is set in .env');
  }

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema
    }
  });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n---\n\n${userContent}` }]
      }
    ]
  });

  const text = result.response.text();
  return JSON.parse(text);
}

// Wrapper with retry and exponential backoff to handle 429 / 503 limits
async function callGemini(options, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await callGeminiDirect(options);
    } catch (err) {
      const errMsg = err.message || '';
      const isRetryable = errMsg.includes('503') || 
                          errMsg.includes('429') || 
                          errMsg.includes('Quota exceeded') || 
                          errMsg.includes('Service Unavailable') ||
                          errMsg.includes('limit');
      
      if (isRetryable && i < retries - 1) {
        console.warn(`[Gemini API] Rate limit or service spike encountered. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
}

// ─── 1. Assumption Extractor ─────────────────────────────────────────────────
const ASSUMPTION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    assumptions: {
      type: SchemaType.ARRAY,
      description: 'List of implicit assumptions found in the text',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING, description: 'Type of assumption: market, technical, contextual, domain, logical' },
          text: { type: SchemaType.STRING, description: 'The assumption statement' },
          confidence: { type: SchemaType.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Confidence this is truly implicit' }
        },
        required: ['category', 'text', 'confidence']
      }
    }
  },
  required: ['assumptions']
};

async function extractAssumptions(prompt, response) {
  const systemPrompt = `You are an expert evaluator analyzing AI-generated responses.
Your task: Identify implicit assumptions that the AI response makes but does not explicitly state.
Focus on: missing context, unstated prerequisites, domain-specific knowledge assumed, cultural or environmental assumptions.
Do NOT include obvious logical axioms. Return structured JSON only.`;

  const userContent = `Prompt given to AI: "${prompt || 'No prompt provided'}"
AI Response to evaluate: "${response}"`;

  return callGemini({ systemPrompt, userContent, responseSchema: ASSUMPTION_SCHEMA });
}

// ─── 2. Hallucination Analyzer ───────────────────────────────────────────────
const HALLUCINATION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    hallucinations: {
      type: SchemaType.ARRAY,
      description: 'List of potentially hallucinated or unverifiable claims',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          claim: { type: SchemaType.STRING, description: 'The specific claim that may be hallucinated or inaccurate' },
          reason: { type: SchemaType.STRING, description: 'Why this claim is suspicious or unverifiable' },
          severity: { type: SchemaType.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Risk severity level' }
        },
        required: ['claim', 'reason', 'severity']
      }
    }
  },
  required: ['hallucinations']
};

async function analyzeHallucinations(prompt, response) {
  const systemPrompt = `You are an expert AI output verifier.
Your task: Identify claims in the AI response that are potentially fabricated, unverifiable, contradicted by common knowledge, or suspiciously specific without evidence.
Criteria for flagging:
- Specific statistics without citation
- Named sources that may not exist
- Technical claims that contradict established knowledge
- Overly confident assertions about uncertain things
Return structured JSON only. Be conservative — only flag genuinely suspicious claims.`;

  const userContent = `Prompt: "${prompt || 'No prompt provided'}"
AI Response: "${response}"`;

  return callGemini({ systemPrompt, userContent, responseSchema: HALLUCINATION_SCHEMA });
}

// ─── 3. Logic & Reasoning Analyzer ──────────────────────────────────────────
const LOGIC_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    coherence: { type: SchemaType.STRING, enum: ['POOR', 'FAIR', 'GOOD', 'EXCELLENT'], description: 'Overall coherence rating' },
    issues: {
      type: SchemaType.ARRAY,
      description: 'Specific logical issues found',
      items: { type: SchemaType.STRING }
    },
    strengths: {
      type: SchemaType.ARRAY,
      description: 'Logical strengths of the response',
      items: { type: SchemaType.STRING }
    },
    causal_chain_valid: { type: SchemaType.BOOLEAN, description: 'Whether cause-effect reasoning is sound' }
  },
  required: ['coherence', 'issues', 'strengths', 'causal_chain_valid']
};

async function analyzeLogic(prompt, response) {
  const systemPrompt = `You are a critical reasoning expert.
Your task: Evaluate the logical quality of an AI-generated response.
Assess:
- Internal consistency: Does the response contradict itself?
- Causal reasoning: Are cause-effect relationships sound?
- Completeness: Does it address all parts of the prompt?
- Logical gaps: Are there unjustified leaps in reasoning?
- Unsupported conclusions: Are final claims grounded in the argument?
Return structured JSON only.`;

  const userContent = `Prompt: "${prompt || 'No prompt provided'}"
AI Response: "${response}"`;

  return callGemini({ systemPrompt, userContent, responseSchema: LOGIC_SCHEMA });
}

// ─── 4. LLM-as-a-Judge ───────────────────────────────────────────────────────
const JUDGE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    verdict: { type: SchemaType.STRING, enum: ['APPROVED', 'CONDITIONAL', 'REJECTED'], description: 'Overall judgment' },
    score_rating: { type: SchemaType.NUMBER, description: 'Score from 1-10 based on quality' },
    rationale: { type: SchemaType.STRING, description: 'Detailed explanation of the judgment' },
    strengths: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Key strengths of this response'
    },
    weaknesses: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Key weaknesses of this response'
    }
  },
  required: ['verdict', 'score_rating', 'rationale', 'strengths', 'weaknesses']
};

async function runJudgeEvaluation(prompt, response) {
  const systemPrompt = `You are a senior AI evaluator acting as a meta-judge.
Your task: Evaluate the overall quality of an AI-generated response across multiple dimensions.
You are NOT evaluating factual truth — you are assessing:
- Clarity: Is the response easy to understand?
- Completeness: Does it fully address the user's intent?
- Coherence: Is it well-structured and logical?
- Usefulness: Will this genuinely help the user?
- Tone: Is it appropriate and professional?
IMPORTANT: You are an assistive evaluator, NOT an authority. Your verdict is advisory.
Score from 1-10 and return structured JSON only.`;

  const userContent = `Original Prompt: "${prompt || 'No prompt provided'}"
AI Response to judge: "${response}"`;

  // Use gemini-2.5-flash for the judge evaluation as well
  return callGemini({ modelName: 'gemini-2.5-flash', systemPrompt, userContent, responseSchema: JUDGE_SCHEMA });
}

// ─── Mock Evaluators (fallback when no API key) ───────────────────────────────
function mockAssumptions() {
  return {
    assumptions: [
      { category: 'contextual', text: 'Assumes user has basic domain knowledge.', confidence: 'MEDIUM' },
      { category: 'technical', text: 'Assumes standard environmental setup.', confidence: 'LOW' }
    ]
  };
}

function mockHallucinations() {
  return { hallucinations: [] };
}

function mockLogic() {
  return {
    coherence: 'GOOD',
    issues: [],
    strengths: ['Clear structure', 'Addresses the prompt directly'],
    causal_chain_valid: true
  };
}

function mockJudge() {
  return {
    verdict: 'CONDITIONAL',
    score_rating: 7,
    rationale: 'Mock evaluation: Response appears reasonable but requires real Gemini API evaluation for accurate assessment.',
    strengths: ['Concise', 'Relevant'],
    weaknesses: ['API key not configured — real analysis pending']
  };
}

// ─── Public Exports ───────────────────────────────────────────────────────────
async function runAllEvaluators(prompt, response) {
  const useMock = !genAI || config.NODE_ENV === 'test';

  let assumptions, hallucinations, logic, judge;

  if (useMock) {
    assumptions = mockAssumptions();
    hallucinations = mockHallucinations();
    logic = mockLogic();
    judge = mockJudge();
  } else {
    // Run sequentially with a tiny spacing (200ms) to avoid triggering concurrent spikes on the free tier
    assumptions = await extractAssumptions(prompt, response);
    await new Promise(r => setTimeout(r, 200));
    
    hallucinations = await analyzeHallucinations(prompt, response);
    await new Promise(r => setTimeout(r, 200));
    
    logic = await analyzeLogic(prompt, response);
    await new Promise(r => setTimeout(r, 200));
    
    judge = await runJudgeEvaluation(prompt, response);
  }

  return { assumptions, hallucinations, logic, judge, usedMock: useMock };
}

module.exports = {
  extractAssumptions,
  analyzeHallucinations,
  analyzeLogic,
  runJudgeEvaluation,
  runAllEvaluators,
  // Mock exports for testing
  mockAssumptions,
  mockHallucinations,
  mockLogic,
  mockJudge
};
