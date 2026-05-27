/**
 * Aggregation Engine
 * Combines outputs from all evaluator modules into a unified trust assessment.
 * Implements weighted scoring, conflict resolution, attention area synthesis,
 * and overall reliability classification.
 */

const { SEGMENT_TYPES } = require('./segmenter');

// ─── Scoring Weights ─────────────────────────────────────────────────────────
// Each dimension contributes a weighted share to the overall trust score.
// Weights sum to 1.0 for normalized output.
const DIMENSION_WEIGHTS = {
  hallucination: 0.30,  // Highest weight — fabricated claims are the most damaging
  logic:         0.25,  // Reasoning quality is critical for trust
  judge:         0.20,  // Meta-judge provides holistic quality signal
  assumptions:   0.15,  // Hidden assumptions erode reliability
  calibration:   0.10   // Confidence alignment (future-proofed)
};

// ─── Risk Level Mapping ──────────────────────────────────────────────────────
// Maps qualitative labels to numeric risk values for scoring math
const RISK_LEVELS = {
  LOW:    1,
  MEDIUM: 2,
  HIGH:   3
};

const COHERENCE_SCORES = {
  EXCELLENT: 0.95,
  GOOD:      0.75,
  FAIR:      0.50,
  POOR:      0.25
};

// ─── Main Aggregation Function ───────────────────────────────────────────────
/**
 * Aggregates all evaluator outputs into a single unified assessment.
 * 
 * @param {Object} evalResults - Combined output from runAllEvaluators()
 * @param {Array} segments - Segments from the segmenter engine
 * @returns {Object} Unified trust assessment
 */
function aggregateEvaluations(evalResults, segments) {
  const assumptions = evalResults.assumptions?.assumptions || [];
  const hallucinations = evalResults.hallucinations?.hallucinations || [];
  const logic = evalResults.logic || {};
  const judge = evalResults.judge || {};

  // 1. Compute dimension scores (0.0 = worst, 1.0 = best)
  const dimensionScores = {
    hallucination: computeHallucinationScore(hallucinations),
    logic:         computeLogicScore(logic),
    judge:         computeJudgeScore(judge),
    assumptions:   computeAssumptionScore(assumptions),
    calibration:   0.70  // Placeholder until calibration evaluator exists
  };

  // 2. Weighted aggregate score
  let weightedScore = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    weightedScore += (dimensionScores[dim] || 0.5) * weight;
  }

  // 3. Classify overall trust
  const overallTrust = classifyTrust(weightedScore);

  // 4. Build per-dimension detail cards
  const dimensionDetails = buildDimensionDetails(dimensionScores, { assumptions, hallucinations, logic, judge });

  // 5. Identify attention areas
  const attentionAreas = buildAttentionAreas(segments, hallucinations, logic, assumptions);

  // 6. Generate reliability summary
  const reliabilitySummary = generateSummary(overallTrust, dimensionScores, { assumptions, hallucinations, logic, judge });

  return {
    overall_trust: overallTrust,
    weighted_score: Math.round(weightedScore * 100) / 100,
    reliability_summary: reliabilitySummary,
    dimension_scores: dimensionScores,
    dimension_details: dimensionDetails,
    assumptions: assumptions,
    hallucinations: hallucinations,
    logic_analysis: logic,
    judge_verdict: judge,
    attention_segments: attentionAreas,
    segments: segments
  };
}

// ─── Individual Dimension Scorers ────────────────────────────────────────────

function computeHallucinationScore(hallucinations) {
  if (hallucinations.length === 0) return 1.0;

  // Score decreases with count and severity
  let penalty = 0;
  for (const h of hallucinations) {
    const sev = RISK_LEVELS[(h.severity || 'MEDIUM').toUpperCase()] || 2;
    penalty += sev * 0.15;
  }
  return Math.max(0, 1.0 - penalty);
}

function computeLogicScore(logic) {
  const coherenceScore = COHERENCE_SCORES[(logic.coherence || 'FAIR').toUpperCase()] || 0.50;
  const issueCount = (logic.issues || []).length;
  const issuePenalty = issueCount * 0.10;
  const causalBonus = logic.causal_chain_valid ? 0.05 : -0.10;
  return Math.max(0, Math.min(1.0, coherenceScore - issuePenalty + causalBonus));
}

function computeJudgeScore(judge) {
  const rating = judge.score_rating || 5;
  return rating / 10;
}

function computeAssumptionScore(assumptions) {
  if (assumptions.length === 0) return 1.0;

  let penalty = 0;
  for (const a of assumptions) {
    const confidence = RISK_LEVELS[(a.confidence || 'MEDIUM').toUpperCase()] || 2;
    penalty += confidence * 0.05;
  }
  return Math.max(0, 1.0 - penalty);
}

// ─── Trust Classification ────────────────────────────────────────────────────

function classifyTrust(score) {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

// ─── Dimension Detail Cards ──────────────────────────────────────────────────

function buildDimensionDetails(scores, data) {
  return [
    {
      dimension: 'Hallucination Risk',
      score: scores.hallucination,
      risk_level: scores.hallucination >= 0.8 ? 'LOW' : scores.hallucination >= 0.5 ? 'MEDIUM' : 'HIGH',
      count: data.hallucinations.length,
      summary: data.hallucinations.length === 0
        ? 'No potentially fabricated claims detected.'
        : `${data.hallucinations.length} suspicious claim(s) flagged for review.`
    },
    {
      dimension: 'Logic & Reasoning',
      score: scores.logic,
      risk_level: scores.logic >= 0.7 ? 'LOW' : scores.logic >= 0.4 ? 'MEDIUM' : 'HIGH',
      coherence: data.logic.coherence || 'N/A',
      issue_count: (data.logic.issues || []).length,
      summary: (data.logic.issues || []).length === 0
        ? 'Reasoning chain is coherent with no logical gaps.'
        : `${(data.logic.issues || []).length} logical issue(s) detected.`
    },
    {
      dimension: 'Judge Assessment',
      score: scores.judge,
      verdict: data.judge.verdict || 'N/A',
      rating: `${data.judge.score_rating || 'N/A'}/10`,
      summary: data.judge.rationale || 'No rationale provided.'
    },
    {
      dimension: 'Hidden Assumptions',
      score: scores.assumptions,
      risk_level: scores.assumptions >= 0.8 ? 'LOW' : scores.assumptions >= 0.5 ? 'MEDIUM' : 'HIGH',
      count: data.assumptions.length,
      summary: data.assumptions.length === 0
        ? 'No implicit assumptions identified.'
        : `${data.assumptions.length} unstated assumption(s) identified.`
    }
  ];
}

// ─── Attention Areas ─────────────────────────────────────────────────────────

function buildAttentionAreas(segments, hallucinations, logic, assumptions) {
  const areas = [];

  // Map hallucinations to attention flags
  for (const halluc of hallucinations) {
    const matched = segments.find(seg =>
      seg.content && halluc.claim &&
      seg.content.toLowerCase().includes(halluc.claim.toLowerCase().substring(0, 30))
    );
    areas.push({
      type: 'hallucination_risk',
      severity: halluc.severity || 'MEDIUM',
      description: halluc.claim,
      reason: halluc.reason || 'Potentially fabricated claim.',
      segment_id: matched ? matched.id : null
    });
  }

  // Map logic issues
  for (const issue of (logic.issues || [])) {
    areas.push({
      type: 'reasoning_gap',
      severity: 'MEDIUM',
      description: issue,
      segment_id: null
    });
  }

  // Flag numerical segments for independent verification
  for (const seg of segments) {
    if (seg.type === SEGMENT_TYPES.NUMERICAL_ESTIMATE) {
      areas.push({
        type: 'numerical_verification_needed',
        severity: 'LOW',
        description: `Contains numerical claim: "${seg.content.substring(0, 80)}"`,
        segment_id: seg.id
      });
    }
  }

  // Flag high-confidence assumptions
  for (const a of assumptions) {
    if ((a.confidence || '').toUpperCase() === 'HIGH') {
      areas.push({
        type: 'strong_hidden_assumption',
        severity: 'MEDIUM',
        description: a.text,
        segment_id: null
      });
    }
  }

  return areas;
}

// ─── Summary Generator ───────────────────────────────────────────────────────

function generateSummary(overallTrust, scores, data) {
  const parts = [];

  if (overallTrust === 'HIGH') {
    parts.push('The response demonstrates high reliability across all evaluation dimensions.');
  } else if (overallTrust === 'MEDIUM') {
    parts.push('The response shows moderate reliability with some areas requiring attention.');
  } else {
    parts.push('The response has significant reliability concerns that require careful review.');
  }

  if (data.hallucinations.length > 0) {
    parts.push(`${data.hallucinations.length} potentially hallucinated claim(s) were flagged.`);
  }

  if (data.assumptions.length > 0) {
    parts.push(`${data.assumptions.length} implicit assumption(s) were identified.`);
  }

  parts.push(`Logic coherence: ${data.logic.coherence || 'N/A'}.`);
  parts.push(`Judge verdict: ${data.judge.verdict || 'N/A'} (${data.judge.score_rating || 'N/A'}/10).`);

  return parts.join(' ');
}

module.exports = {
  aggregateEvaluations,
  computeHallucinationScore,
  computeLogicScore,
  computeJudgeScore,
  computeAssumptionScore,
  classifyTrust,
  DIMENSION_WEIGHTS
};
