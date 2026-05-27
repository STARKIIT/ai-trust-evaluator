/**
 * Phase 5 Test Suite
 * Evaluates Markdown rendering, tab transitions, DOM highlighting, and extension messaging.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('Running Test Suite: Phase 5 (Advanced UX & Highlighting)');
console.log('----------------------------------------------------');

function logStep(msg) {
  const logStr = `[${new Date().toISOString()}] TEST (Phase 5): ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, '../../execution.log'), logStr);
}

// ─── 1. Setup Mock DOM Environment ──────────────────────────────────────────

const elements = {};
function createMockElement(tag, id = '', className = '') {
  const el = {
    tagName: tag.toUpperCase(),
    id: id,
    className: className,
    get classList() {
      const getList = () => new Set((el.className || '').split(' ').filter(Boolean));
      return {
        add(c) { 
          const l = getList();
          l.add(c); 
          el.className = Array.from(l).join(' '); 
        },
        remove(c) { 
          const l = getList();
          l.delete(c); 
          el.className = Array.from(l).join(' '); 
        },
        contains(c) { 
          return getList().has(c); 
        }
      };
    },
    style: {},
    innerHTML: '',
    textContent: '',
    attributes: {},
    setAttribute(name, val) { this.attributes[name] = val; },
    getAttribute(name) { return this.attributes[name]; },
    children: [],
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    insertBefore(newChild, refChild) {
      const idx = this.children.indexOf(refChild);
      if (idx !== -1) {
        this.children.splice(idx, 0, newChild);
      } else {
        this.children.push(newChild);
      }
      newChild.parentNode = this;
      return newChild;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    replaceChild(newChild, oldChild) {
      const idx = this.children.indexOf(oldChild);
      if (idx !== -1) {
        this.children[idx] = newChild;
        newChild.parentNode = this;
        oldChild.parentNode = null;
      }
      return oldChild;
    },
    normalize() {
      const newChildren = [];
      for (const child of this.children) {
        if (newChildren.length > 0 && newChildren[newChildren.length - 1].nodeType === 3 && child.nodeType === 3) {
          const last = newChildren[newChildren.length - 1];
          last.nodeValue += child.nodeValue;
          last.textContent = last.nodeValue;
        } else {
          newChildren.push(child);
        }
      }
      this.children = newChildren;
    },
    addEventListener(event, cb) {
      if (!this.listeners) this.listeners = {};
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(cb);
    },
    click() {
      if (this.listeners && this.listeners['click']) {
        this.listeners['click'].forEach(cb => cb());
      }
    }
  };
  if (id) {
    elements[id] = el;
  }
  return el;
}

// Global window and document mock
const domListeners = [];
const mouseUpListeners = [];

global.window = {
  location: { hostname: 'claude.ai' },
  addEventListener: () => {}
};

global.document = {
  body: createMockElement('body', 'body-el'),
  createElement: (tag) => createMockElement(tag),
  createTextNode: (text) => ({ nodeType: 3, nodeValue: text, textContent: text }),
  addEventListener: (event, cb) => {
    if (event === 'DOMContentLoaded') {
      domListeners.push(cb);
    } else if (event === 'mouseup') {
      mouseUpListeners.push(cb);
    }
  },
  getElementById: (id) => {
    return elements[id] || createMockElement('div', id);
  },
  querySelectorAll: (selector) => {
    if (selector === '.tab-btn') {
      return [
        createMockElement('button', 'tab-btn-assumptions', 'tab-btn active'),
        createMockElement('button', 'tab-btn-hallucinations', 'tab-btn'),
        createMockElement('button', 'tab-btn-logic', 'tab-btn')
      ];
    }
    if (selector === '.tab-panel') {
      return [
        createMockElement('div', 'tab-assumptions', 'tab-panel active'),
        createMockElement('div', 'tab-hallucinations', 'tab-panel'),
        createMockElement('div', 'tab-logic', 'tab-panel')
      ];
    }
    if (selector === '.ai-evaluator-highlight') {
      return []; // Return empty array or mock elements for clearing
    }
    return [];
  },
  querySelector: () => null
};

// Node TreeWalker Mock for content script highlighting
global.NodeFilter = { SHOW_TEXT: 4 };
global.document.createTreeWalker = (root, filter, config, entity) => {
  // Return a mock TreeWalker traversing child nodes
  let index = 0;
  const nodes = [];
  
  function collectTextNodes(node) {
    if (node.nodeType === 3) {
      nodes.push(node);
    } else if (node.children && node.children.length > 0) {
      node.children.forEach(collectTextNodes);
    }
  }
  collectTextNodes(root);

  return {
    nextNode() {
      if (index < nodes.length) {
        return nodes[index++];
      }
      return null;
    }
  };
};

// Chrome Extension Mock
const chromeMock = {
  runtime: {
    getURL: (path) => `chrome-extension://mock-id/${path}`,
    sendMessage: (msg, cb) => {
      chromeMock.messagesSent.push(msg);
      if (cb) cb({ success: true });
    },
    onMessage: {
      listeners: [],
      addListener: (cb) => {
        chromeMock.runtime.onMessage.listeners.push(cb);
      }
    }
  },
  messagesSent: []
};
global.chrome = chromeMock;

global.MutationObserver = class {
  observe() {}
};

async function runTests() {
  try {
    // Load content.js
    const contentCode = fs.readFileSync(path.join(__dirname, '../../extension/content.js'), 'utf8');
    
    // Expose local scope functions to evaluate
    let preprocessedContentCode = contentCode
      .replace('function applyHighlights', 'global.applyHighlights = function')
      .replace('function clearHighlights', 'global.clearHighlights = function')
      .replace('function highlightTextInElement', 'global.highlightTextInElement = function');

    eval(preprocessedContentCode);

    // Load sidebar.js
    const sidebarCode = fs.readFileSync(path.join(__dirname, '../../extension/sidebar.js'), 'utf8');
    
    // Expose parseMarkdown and showResults
    let preprocessedSidebarCode = sidebarCode
      .replace('function parseMarkdown', 'global.parseMarkdown = function')
      .replace('function showResults', 'global.showResults = function');

    eval(preprocessedSidebarCode);

    // Trigger DOM Content Loaded to wire up sidebar elements
    domListeners.forEach(cb => cb());

    // ═══════════════════════════════════════════════════════════════════════
    //  TEST 1: Markdown Rendering
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\nTest 1: parseMarkdown utility output validation...');
    const markdownText = 'This contains **bold text** and `inline code` and a list:\n- First item\n- Second item';
    const parsedHtml = global.parseMarkdown(markdownText);

    assert.ok(parsedHtml.includes('<strong>bold text</strong>'), 'Bold tag replacement failed');
    assert.ok(parsedHtml.includes('<code>inline code</code>'), 'Inline code replacement failed');
    assert.ok(parsedHtml.includes('<ul>'), 'List tag open injection failed');
    assert.ok(parsedHtml.includes('<li>First item</li>'), 'List item rendering failed');
    console.log('✓ Test 1 Passed: parseMarkdown compiles bold, code, and lists to HTML');
    logStep('Test 1 Passed: Markdown compiler');

    // ═══════════════════════════════════════════════════════════════════════
    //  TEST 2: Sidebar Dashboard Integration
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\nTest 2: showResults binds aggregated metrics to DOM badges...');
    
    const mockReportData = {
      overall_trust: 'HIGH',
      reliability_summary: 'Highly reliable answer.',
      dimension_scores: { logic: 0.90, hallucination: 0.95 },
      assumptions: [
        { category: 'technical', text: 'Needs node environment', confidence: 'HIGH' }
      ],
      hallucinations: [],
      logic_analysis: {
        coherence: 'EXCELLENT',
        issues: [],
        strengths: ['Great causality'],
        causal_chain_valid: true
      },
      judge_verdict: {
        verdict: 'APPROVED',
        score_rating: 9,
        rationale: 'Very solid reasoning.'
      }
    };

    global.showResults(mockReportData);

    const scoreValueEl = elements['score-value'];
    assert.strictEqual(scoreValueEl.textContent, 'HIGH', 'Overall Trust badge failed to map');
    assert.ok(scoreValueEl.className.includes('low-risk'), 'Low risk class assignment failed');

    const reliabilitySummaryEl = elements['reliability-summary'];
    assert.strictEqual(reliabilitySummaryEl.innerHTML, 'Highly reliable answer.', 'Reliability summary binding failed');

    const logicMetricEl = elements['metric-logic'];
    assert.strictEqual(logicMetricEl.textContent, 'Excellent', 'Logic rating failed');
    assert.ok(logicMetricEl.className.includes('text-green'));

    const assumptionsListEl = elements['assumptions-list'];
    assert.ok(assumptionsListEl.children.length > 0, 'Assumptions items list remains empty');
    const firstAssumpChild = assumptionsListEl.children[0];
    assert.ok(firstAssumpChild.className.includes('risk-high'), 'Assumption confidence mapping failed');
    console.log('✓ Test 2 Passed: showResults successfully populates sidebar elements with formatted data');
    logStep('Test 2 Passed: Sidebar data bindings');

    // ═══════════════════════════════════════════════════════════════════════
    //  TEST 3: DOM Highlighting
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\nTest 3: DOM-based text segment highlighting...');

    // Construct a mock assistant message block
    const assistantResponseEl = createMockElement('div', 'resp-1', 'model-response');
    const textNodeMock = { nodeType: 3, nodeValue: 'There is a suspicious hallucinated fact here.', textContent: 'There is a suspicious hallucinated fact here.' };
    assistantResponseEl.appendChild(textNodeMock);

    // Mock querySelectorAll for assistant responses
    const originalQueryAll = global.document.querySelectorAll;
    global.document.querySelectorAll = (selector) => {
      if (selector.includes('response') || selector.includes('message') || selector === '.message-content, .model-response') {
        return [assistantResponseEl];
      }
      if (selector === '.ai-evaluator-highlight') {
        // Return matching highlighted elements to clear
        return assistantResponseEl.children.filter(c => c.classList && c.classList.contains('ai-evaluator-highlight'));
      }
      return originalQueryAll(selector);
    };

    const mockEvaluation = {
      segments: [
        { id: 'seg-h1', type: 'hallucination_risk', content: 'There is a suspicious hallucinated fact here.' }
      ],
      attention_segments: [
        { segment_id: 'seg-h1', type: 'hallucination_risk', severity: 'HIGH', description: 'This is a fabricated statement.' }
      ]
    };

    global.applyHighlights(mockEvaluation);

    // Assert that the text node inside assistantResponseEl has been split/replaced with highlight span
    const highlightSpan = assistantResponseEl.children.find(c => c.tagName === 'SPAN' && c.classList.contains('ai-evaluator-highlight'));
    assert.ok(highlightSpan, 'Failed to inject highlight span wrapper around text');
    assert.strictEqual(highlightSpan.textContent, 'There is a suspicious hallucinated fact ', 'Highlight span text mismatch');
    assert.ok(highlightSpan.style.cssText.includes('background-color: rgba(239, 68, 68'), 'High severity color coding failed');

    // Clear highlights and check restoration
    global.clearHighlights();
    const highlightSpanCleared = assistantResponseEl.children.find(c => c.tagName === 'SPAN' && c.classList.contains('ai-evaluator-highlight'));
    assert.ok(!highlightSpanCleared, 'Failed to strip highlights from document node');
    console.log('✓ Test 3 Passed: DOM text nodes successfully wrapped with highlights and cleared on command');
    logStep('Test 3 Passed: DOM highlighting');

    // Restore original queries
    global.document.querySelectorAll = originalQueryAll;

    console.log('\n✅ All Phase 5 tests passed successfully!');
    logStep('All Phase 5 tests passed.');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Test validation failed:');
    console.error(error.stack || error.message);
    logStep(`Test failure: ${error.message}`);
    process.exit(1);
  }
}

runTests();
