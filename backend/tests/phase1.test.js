/**
 * Phase 1 Mock Test Suite
 * Tests Chrome Extension DOM Extraction, Selection tracking, and Messaging mock contracts.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('Running Test Suite: Phase 1 (Chrome Extension Core)');
console.log('----------------------------------------------------');

// Mock browser environments
global.window = {
  location: { hostname: 'claude.ai' },
  scrollY: 100,
  scrollX: 200,
  addEventListener: () => {},
  getSelection: () => ({
    toString: () => '  Mocked Selection  ',
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ top: 150, left: 250, width: 100, height: 20 })
    })
  })
};

global.document = {
  body: {
    appendChild: (el) => {
      // Mock append
      el.id = el.id || 'mocked-id';
      return el;
    },
    remove: () => {}
  },
  createElement: (tag) => {
    return {
      tagName: tag,
      style: {},
      addEventListener: () => {},
      appendChild: () => {},
      remove: () => {}
    };
  },
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

// Mock Chrome Extension API
const chromeMock = {
  runtime: {
    getURL: (path) => `chrome-extension://mock-id/${path}`,
    sendMessage: (msg, callback) => {
      chromeMock.messagesSent.push(msg);
      if (callback) {
        // Simulate successful response
        setTimeout(() => callback({ success: true }), 0);
      }
    },
    onMessage: {
      listeners: [],
      addListener: (cb) => {
        chromeMock.runtime.onMessage.listeners.push(cb);
      }
    }
  },
  storage: {
    local: {
      data: {},
      set: (data, cb) => {
        Object.assign(chromeMock.storage.local.data, data);
        if (cb) cb();
      },
      get: (keys) => {
        return Promise.resolve(chromeMock.storage.local.data);
      }
    }
  },
  messagesSent: []
};

global.chrome = chromeMock;
global.MutationObserver = class {
  observe() {}
};

// Log helper to track steps in execution.log
function logStep(msg) {
  const logStr = `[${new Date().toISOString()}] TEST (Phase 1): ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, '../../execution.log'), logStr);
}

// Read content.js code to evaluate it in this context
const contentScriptPath = path.join(__dirname, '../../extension/content.js');
let contentScriptCode = fs.readFileSync(contentScriptPath, 'utf8');

// Preprocess to expose module-scoped variables and functions to global scope for assertion testing
contentScriptCode = contentScriptCode.replace('let lastSelectedText =', 'global.lastSelectedText =');
contentScriptCode = contentScriptCode.replace('let floatingEvaluateButton =', 'global.floatingEvaluateButton =');
contentScriptCode = contentScriptCode.replace('function detectPlatform()', 'global.detectPlatform = function()');
contentScriptCode = contentScriptCode.replace('function extractConversations()', 'global.extractConversations = function()');
contentScriptCode = contentScriptCode.replace('function handleSelectionChange(e)', 'global.handleSelectionChange = function(e)');

// Evaluate the script (mock loading)
try {
  eval(contentScriptCode);
  console.log('✓ Successfully parsed and exposed extension/content.js');
  logStep('Successfully parsed content.js');
} catch (err) {
  console.error('✗ Failed to parse extension/content.js');
  console.error(err);
  process.exit(1);
}

// Run unit assertions
async function runTests() {
  try {
    // 1. Test Detect Platform
    const detected = global.detectPlatform();
    assert.strictEqual(detected, 'claude', 'Should detect claude.ai hostname');
    console.log('✓ Test 1 Passed: detectPlatform correctly identifies hostname');
    logStep('Test 1 Passed: detectPlatform correctly identifies hostname');

    // 2. Test DOM Extraction (Claude format)
    const mockPrompts = [{ innerText: 'Write a python script' }];
    const mockResponses = [{ innerText: 'Here is the python script...' }];
    
    // Temporarily override querySelectorAll
    const originalQueryAll = global.document.querySelectorAll;
    global.document.querySelectorAll = (selector) => {
      if (selector.includes('prompt') || selector.includes('user-message')) {
        return mockPrompts;
      }
      if (selector.includes('response') || selector.includes('assistant-message')) {
        return mockResponses;
      }
      return [];
    };

    const extraction = global.extractConversations();
    assert.strictEqual(extraction.platform, 'claude');
    assert.strictEqual(extraction.prompt, 'Write a python script');
    assert.strictEqual(extraction.response, 'Here is the python script...');
    console.log('✓ Test 2 Passed: extractConversations correctly returns prompt/response pairs');
    logStep('Test 2 Passed: extractConversations correctly returns prompt/response pairs');

    // Restore querySelectorAll
    global.document.querySelectorAll = originalQueryAll;

    // 3. Test Selection Event Tracking
    // Trigger the mouse up event handler
    const eventMock = { target: {} };
    global.handleSelectionChange(eventMock);
    
    assert.strictEqual(global.lastSelectedText, 'Mocked Selection', 'Selection should be saved and trimmed');
    console.log('✓ Test 3 Passed: Selection tracking captures correct selected string');
    logStep('Test 3 Passed: Selection tracking captures correct selected string');

    console.log('\nAll Phase 1 tests passed successfully! 🎉');
    logStep('All Phase 1 tests passed.');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test validation failed:');
    console.error(error.stack || error.message);
    logStep(`Test failure: ${error.message}`);
    process.exit(1);
  }
}

runTests();
