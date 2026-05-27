/**
 * AI Output Trust & Reliability Evaluator - Sidebar Logic
 * Handles tab transitions, background message handling, evaluation triggers, and UI bindings.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Views
  const welcomeView = document.getElementById('welcome-view');
  const loadingView = document.getElementById('loading-view');
  const resultsView = document.getElementById('results-view');
  const errorView = document.getElementById('error-view');

  // Preview elements
  const previewPromptText = document.getElementById('preview-prompt-text');
  const previewResponseText = document.getElementById('preview-response-text');

  // Buttons
  const evaluateBtn = document.getElementById('evaluate-btn');
  const reEvaluateBtn = document.getElementById('re-evaluate-btn');
  const retryBtn = document.getElementById('retry-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');

  // Active state data
  let activePayload = null;

  // 1. Fetch current page extraction on load
  function fetchActiveData() {
    chrome.runtime.sendMessage({ action: 'GET_ACTIVE_DATA' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Evaluator Sidebar] Could not contact background worker:', chrome.runtime.lastError);
        return;
      }
      updatePreview(response);
    });
  }

  function updatePreview(payload) {
    if (!payload) return;
    activePayload = payload;

    if (payload.prompt) {
      previewPromptText.textContent = payload.prompt.length > 150 
        ? payload.prompt.substring(0, 150) + '...' 
        : payload.prompt;
    } else {
      previewPromptText.textContent = 'No prompt captured yet.';
    }

    if (payload.response) {
      previewResponseText.textContent = payload.response.length > 200 
        ? payload.response.substring(0, 200) + '...' 
        : payload.response;
    } else if (payload.selected_text) {
      previewResponseText.textContent = `[Text Selection]: "${payload.selected_text.substring(0, 200)}..."`;
    } else {
      previewResponseText.textContent = 'No response captured yet.';
    }
  }

  // 2. Tab switching logic
  const tabs = document.querySelectorAll('.tab-chip');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs & panels
      document.querySelectorAll('.tab-chip').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

      // Add active to current
      tab.classList.add('active');
      const targetPanel = tab.getAttribute('data-tab');
      document.getElementById(targetPanel).classList.add('active');
    });
  });

  // 3. Trigger evaluation action
  function runEvaluation() {
    welcomeView.classList.add('hidden');
    resultsView.classList.add('hidden');
    errorView.classList.add('hidden');
    loadingView.classList.remove('hidden');

    chrome.runtime.sendMessage({ 
      action: 'TRIGGER_EVALUATION',
      payload: activePayload 
    }, (result) => {
      if (chrome.runtime.lastError || !result || !result.success) {
        showError(result?.error || 'Evaluation server could not be reached.');
        return;
      }
      showResults(result.data);
    });
  }

  function showError(msg) {
    loadingView.classList.add('hidden');
    welcomeView.classList.add('hidden');
    resultsView.classList.add('hidden');
    errorView.classList.remove('hidden');
    document.getElementById('error-message').textContent = msg;
  }

  // Markdown Parser Utility
  function parseMarkdown(text) {
    if (!text) return '';
    // Escape html characters to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Fenced Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');

    // Bullet lists
    const lines = html.split('\n');
    let inList = false;
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*)[-*]\s+(.+)$/);
      if (match) {
        if (!inList) {
          processedLines.push('<ul>');
          inList = true;
        }
        processedLines.push(`<li>${match[2]}</li>`);
      } else {
        if (inList) {
          processedLines.push('</ul>');
          inList = false;
        }
        processedLines.push(line);
      }
    }
    if (inList) {
      processedLines.push('</ul>');
    }

    html = processedLines.join('\n');
    html = html.replace(/\n\n/g, '<p></p>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<\/ul><br>/g, '</ul>');
    html = html.replace(/<\/pre><br>/g, '</pre>');
    html = html.replace(/<p><\/p>/g, '<br><br>');
    
    return html;
  }

  // 4. Bind evaluation report JSON to UI
  function showResults(data) {
    loadingView.classList.add('hidden');
    errorView.classList.add('hidden');
    welcomeView.classList.add('hidden');
    resultsView.classList.remove('hidden');

    // Set overall score card
    const overallTrust = data.overall_trust || 'MEDIUM';
    const scoreCard = document.getElementById('score-card');
    const scoreVal = document.getElementById('score-value');
    const indicator = document.getElementById('score-badge-indicator');
    const reliabilitySummary = document.getElementById('reliability-summary');

    // Reset styles
    scoreCard.className = 'result-score-card';
    scoreVal.className = 'score-value';
    if (typeof indicator.removeAttribute === 'function') {
      indicator.removeAttribute('style');
    }

    if (overallTrust === 'LOW') {
      scoreCard.classList.add('high-risk-glow');
      scoreVal.classList.add('high-risk');
      scoreVal.textContent = 'LOW';
      indicator.textContent = 'High Evaluation Risk';
    } else if (overallTrust === 'MEDIUM') {
      scoreCard.classList.add('medium-risk-glow');
      scoreVal.classList.add('medium-risk');
      scoreVal.textContent = 'MEDIUM';
      indicator.textContent = 'Medium Evaluation Risk';
    } else {
      scoreCard.classList.add('low-risk-glow');
      scoreVal.classList.add('low-risk');
      scoreVal.textContent = 'HIGH';
      indicator.textContent = 'Highly Reliable';
    }

    reliabilitySummary.innerHTML = parseMarkdown(data.reliability_summary || 'Evaluation finished successfully.');

    // Mini Metrics indicators
    const hasHallucinations = data.hallucinations && data.hallucinations.length > 0;
    const logicVerdict = document.getElementById('metric-logic');
    const hallucVerdict = document.getElementById('metric-hallucination');

    // Set logic metric val based on numeric score
    const logicScoreVal = data.dimension_scores?.logic !== undefined ? data.dimension_scores.logic : 0.70;
    logicVerdict.textContent = logicScoreVal >= 0.75 ? 'Excellent' : logicScoreVal >= 0.50 ? 'Good' : 'Poor';
    logicVerdict.className = `metric-val ${logicScoreVal >= 0.75 ? 'text-green' : logicScoreVal >= 0.50 ? 'text-yellow' : 'text-red'}`;

    // Set hallucination metric val based on numeric score
    const hallucScoreVal = data.dimension_scores?.hallucination !== undefined ? data.dimension_scores.hallucination : 1.0;
    hallucVerdict.textContent = hallucScoreVal >= 0.85 ? 'Low Risk' : hallucScoreVal >= 0.50 ? 'Medium Risk' : 'High Risk';
    hallucVerdict.className = `metric-val ${hallucScoreVal >= 0.85 ? 'text-green' : hallucScoreVal >= 0.50 ? 'text-yellow' : 'text-red'}`;

    // Populate Assumptions Tab
    const assumptionsList = document.getElementById('assumptions-list');
    assumptionsList.innerHTML = '';
    const assumptions = data.assumptions || [];
    if (assumptions.length === 0) {
      assumptionsList.innerHTML = '<div class="list-item">No implicit assumptions identified.</div>';
    } else {
      assumptions.forEach(assump => {
        const item = document.createElement('div');
        const conf = (assump.confidence || 'MEDIUM').toLowerCase();
        item.className = `list-item risk-${conf === 'high' ? 'high' : conf === 'low' ? 'low' : 'medium'}`;
        
        const title = document.createElement('div');
        title.className = 'list-item-title';
        title.textContent = assump.category ? `${assump.category.toUpperCase()} (Confidence: ${assump.confidence})` : 'Assumption';
        
        const body = document.createElement('div');
        body.innerHTML = parseMarkdown(assump.text);
        
        item.appendChild(title);
        item.appendChild(body);
        assumptionsList.appendChild(item);
      });
    }

    // Populate Hallucinations Tab
    const hallucinationsList = document.getElementById('hallucinations-list');
    hallucinationsList.innerHTML = '';
    const hallucinations = data.hallucinations || [];
    if (hallucinations.length === 0) {
      hallucinationsList.innerHTML = '<div class="list-item text-green" style="border-left-color: var(--color-low-risk)">No unsupported/hallucinated claims detected.</div>';
    } else {
      hallucinations.forEach(halluc => {
        const item = document.createElement('div');
        const risk = (halluc.severity || 'medium').toLowerCase();
        item.className = `list-item risk-${risk === 'high' ? 'high' : risk === 'low' ? 'low' : 'medium'}`;

        const title = document.createElement('div');
        title.className = 'list-item-title';
        title.textContent = `${halluc.claim || 'Unverified Claim'} (${risk.toUpperCase()} Risk)`;
        
        const body = document.createElement('div');
        body.innerHTML = parseMarkdown(halluc.reason || 'No specific contradiction listed.');
        
        item.appendChild(title);
        item.appendChild(body);
        hallucinationsList.appendChild(item);
      });
    }

    // Populate Logic & Reasoning Tab
    const logicBox = document.getElementById('logic-analysis-box');
    const reasoning = data.logic_analysis || {};
    let logicHtml = `<div class="analysis-field"><strong>Coherence Rating:</strong> <span class="badge coherence-${(reasoning.coherence || 'N/A').toLowerCase()}">${reasoning.coherence || 'N/A'}</span></div>`;
    logicHtml += `<div class="analysis-field"><strong>Causal Chain Valid:</strong> <span class="badge coherence-${reasoning.causal_chain_valid ? 'excellent' : 'poor'}">${reasoning.causal_chain_valid ? 'YES' : 'NO'}</span></div>`;
    
    if (reasoning.issues && reasoning.issues.length > 0) {
      logicHtml += `<div class="analysis-section-title">Issues Identified:</div><ul class="issues-list">`;
      reasoning.issues.forEach(issue => {
        logicHtml += `<li>${parseMarkdown(issue)}</li>`;
      });
      logicHtml += `</ul>`;
    } else {
      logicHtml += `<div class="analysis-section-title">Issues Identified:</div><p style="color: var(--color-low-risk); font-size: 12px; margin-bottom: 10px;">None</p>`;
    }

    if (reasoning.strengths && reasoning.strengths.length > 0) {
      logicHtml += `<div class="analysis-section-title">Strengths Identified:</div><ul class="strengths-list">`;
      reasoning.strengths.forEach(strength => {
        logicHtml += `<li>${parseMarkdown(strength)}</li>`;
      });
      logicHtml += `</ul>`;
    }
    
    logicBox.innerHTML = logicHtml;

    // Judge Verdict
    const judgeBox = document.getElementById('judge-verdict-box');
    const judge = data.judge_verdict || {};
    let judgeHtml = `<div class="analysis-field"><strong>Final Decision:</strong> <span class="badge verdict-${(judge.verdict || 'N/A').toLowerCase()}">${judge.verdict || 'N/A'}</span></div>`;
    judgeHtml += `<div class="analysis-field"><strong>Score Rating:</strong> <span class="judge-score">${judge.score_rating || 'N/A'}/10</span></div>`;
    judgeHtml += `<div class="analysis-section-title">Critique & Rationale:</div>`;
    judgeHtml += `<div class="rationale-text">${parseMarkdown(judge.rationale || 'No explanation provided.')}</div>`;
    judgeBox.innerHTML = judgeHtml;
  }

  // 5. Button Listeners
  evaluateBtn.addEventListener('click', runEvaluation);
  reEvaluateBtn.addEventListener('click', runEvaluation);
  retryBtn.addEventListener('click', runEvaluation);

  clearCacheBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' }, (res) => {
      if (res && res.success) {
        alert('Evaluation cache cleared successfully.');
        welcomeView.classList.remove('hidden');
        resultsView.classList.add('hidden');
        errorView.classList.add('hidden');
        fetchActiveData();
      }
    });
  });

  // 6. Listen for push updates from content script / background worker
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'UPDATE_ACTIVE_DATA') {
      updatePreview(request.payload);
    } else if (request.action === 'EVALUATION_RESULT') {
      showResults(request.payload);
    } else if (request.action === 'EVALUATION_ERROR') {
      showError(request.payload.error);
    }
  });

  // Load initial data
  fetchActiveData();
});
