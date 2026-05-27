/**
 * Segmentation Engine
 * Splits LLM response text into typed segments: claims, reasoning, summaries, citations, recommendations.
 * Uses rule-based heuristics + structural markers to classify segments without extra API calls.
 */

// Segment type taxonomy
const SEGMENT_TYPES = {
  FACTUAL_CLAIM: 'factual_claim',
  REASONING: 'reasoning_chain',
  RECOMMENDATION: 'recommendation',
  NUMERICAL_ESTIMATE: 'numerical_estimate',
  CITATION: 'citation',
  CODE_BLOCK: 'code_block',
  GENERAL: 'general'
};

// Pattern matchers for rapid classification
const PATTERNS = {
  // Reasoning chain markers
  reasoning: /\b(therefore|because|since|as a result|due to|consequently|this means|which implies|it follows that|this shows|hence|thus)\b/i,
  // Numerical / statistical claims
  numerical: /\d+(\.\d+)?\s*(%|percent|billion|million|thousand|million dollars|kg|ms|seconds|times|x)\b/i,
  // Recommendations or suggestions
  recommendation: /^(you should|i recommend|consider|make sure|ensure|use|try|avoid|don't|never|always|it is (best|important|advisable) to)/i,
  // Citation indicators
  citation: /\b(according to|source:|ref:|cited by|referenced in|see also|as stated by|per the|study by|research by|reported by)\b/i,
  // Code block openings
  codeBlock: /^```/m,
  // Factual or assertive claims: third-person declarative statements
  factualClaim: /^(the|it|this|these|there|a |an )\w+.*\.([\s]|$)/i
};

/**
 * Extract code blocks before splitting the rest into logical text segments.
 * @param {string} text - Full response text
 * @returns {{ codeBlocks: Array, strippedText: string }}
 */
function extractCodeBlocks(text) {
  const codeBlocks = [];
  const stripped = text.replace(/```[\w]*\n([\s\S]*?)```/g, (match, code, offset) => {
    codeBlocks.push({
      id: `cb_${codeBlocks.length}`,
      type: SEGMENT_TYPES.CODE_BLOCK,
      content: code.trim(),
      position: offset
    });
    return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
  });
  return { codeBlocks, strippedText: stripped };
}

/**
 * Split a plain text block into sentence-level segments.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
  // Split on sentence-terminating punctuation followed by whitespace/newline
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])|(?<=\n)\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Filter out very short/empty fragments
}

/**
 * Classify a single text segment into its type.
 * @param {string} segment
 * @returns {string} SEGMENT_TYPE
 */
function classifySegment(segment) {
  if (PATTERNS.codeBlock.test(segment)) return SEGMENT_TYPES.CODE_BLOCK;
  if (PATTERNS.citation.test(segment)) return SEGMENT_TYPES.CITATION;
  if (PATTERNS.numerical.test(segment)) return SEGMENT_TYPES.NUMERICAL_ESTIMATE;
  if (PATTERNS.reasoning.test(segment)) return SEGMENT_TYPES.REASONING;
  if (PATTERNS.recommendation.test(segment)) return SEGMENT_TYPES.RECOMMENDATION;
  if (PATTERNS.factualClaim.test(segment)) return SEGMENT_TYPES.FACTUAL_CLAIM;
  return SEGMENT_TYPES.GENERAL;
}

/**
 * Main segmentation function.
 * Preprocesses, strips code blocks, then classifies each sentence.
 *
 * @param {string} rawText - Raw LLM response
 * @returns {Array<{id: string, type: string, content: string, index: number}>}
 */
function segmentResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // 1. Strip code blocks first
  const { codeBlocks, strippedText } = extractCodeBlocks(rawText);

  // 2. Split stripped text into sentences
  const sentences = splitIntoSentences(strippedText);

  // 3. Classify each sentence
  const textSegments = sentences.map((sentence, i) => {
    // Restore code block references back to proper content
    const restored = sentence.replace(/\[CODE_BLOCK_(\d+)\]/g, (match, idx) => {
      return codeBlocks[parseInt(idx)]?.content || match;
    });

    return {
      id: `seg_${i}`,
      type: classifySegment(sentence),
      content: restored,
      index: i
    };
  });

  // 4. Merge code blocks into segments at their proper positions
  const allSegments = [...textSegments, ...codeBlocks].sort((a, b) => a.index - b.index);

  return allSegments;
}

/**
 * Preprocess raw text: normalize whitespace, strip UI artifacts.
 * @param {string} text
 * @returns {string}
 */
function preprocessText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')            // Normalize Windows line endings
    .replace(/\t/g, ' ')              // Replace tabs with spaces
    .replace(/[ ]{2,}/g, ' ')        // Collapse multiple spaces
    .replace(/(\n){3,}/g, '\n\n')    // Collapse excessive blank lines
    .trim();
}

module.exports = { segmentResponse, preprocessText, classifySegment, SEGMENT_TYPES };
