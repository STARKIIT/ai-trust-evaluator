/**
 * AI Output Trust & Reliability Evaluator - Background Worker
 * Handles message routing, API calling, caching, and state storage.
 */

const BACKEND_URL = 'http://localhost:3000/api/evaluate';
let cachedConversations = {};

// Keep track of the active payload to supply sidebar when requested
let activeConversationPayload = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Evaluator Extension] Service worker installed.');
  chrome.storage.local.set({ evaluations: {} });
});

// Helper: SHA-256 hash generator for caching
async function getHash(text) {
  if (!text) return 'empty';
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Send message to active tab's content script
function sendToActiveTab(action, payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action, payload }, () => {
        // Suppress errors about closed channels or non-existent tabs
        const err = chrome.runtime.lastError;
      });
    }
  });
}

// Perform evaluation by calling backend api
async function performEvaluation(payload, sendResponse) {
  const hashKey = await getHash(payload.prompt + '|||' + payload.response + '|||' + (payload.selected_text || ''));
  
  // Check Chrome storage cache
  const storage = await chrome.storage.local.get('evaluations');
  const cache = storage.evaluations || {};

  if (cache[hashKey]) {
    console.log('[Evaluator Extension] Serving evaluation from cache.');
    sendResponse({ success: true, cached: true, data: cache[hashKey] });
    // Also broadcast to sidebar and active tab
    chrome.runtime.sendMessage({ action: 'EVALUATION_RESULT', payload: cache[hashKey] });
    sendToActiveTab('EVALUATION_RESULT', cache[hashKey]);
    return;
  }

  console.log('[Evaluator Extension] Sending request to backend evaluation api...');
  
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platform: payload.platform || 'unknown',
        prompt: payload.prompt || '',
        response: payload.response || '',
        selected_text: payload.selected_text || '',
        metadata: {
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    const resultData = await response.json();
    
    // Save to Cache
    cache[hashKey] = resultData;
    await chrome.storage.local.set({ evaluations: cache });

    console.log('[Evaluator Extension] Evaluation retrieved successfully.');
    sendResponse({ success: true, cached: false, data: resultData });
    
    // Broadcast result to sidebar and active tab
    chrome.runtime.sendMessage({ action: 'EVALUATION_RESULT', payload: resultData });
    sendToActiveTab('EVALUATION_RESULT', resultData);

  } catch (error) {
    console.error('[Evaluator Extension] Backend connection failed:', error);
    const errPayload = { success: false, error: error.message };
    sendResponse(errPayload);
    chrome.runtime.sendMessage({ action: 'EVALUATION_ERROR', payload: errPayload });
  }
}

// Messaging router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Evaluator Extension] Background received action:', request.action);

  if (request.action === 'SEND_CONVERSATION_DATA') {
    activeConversationPayload = request.payload;
    // Broadcast to any active sidebar
    chrome.runtime.sendMessage({ action: 'UPDATE_ACTIVE_DATA', payload: request.payload });
    sendResponse({ success: true });
  } 
  
  else if (request.action === 'GET_ACTIVE_DATA') {
    sendResponse(activeConversationPayload);
  } 
  
  else if (request.action === 'TRIGGER_EVALUATION') {
    const payload = request.payload || activeConversationPayload;
    if (!payload || (!payload.response && !payload.selected_text)) {
      sendResponse({ success: false, error: 'No content to evaluate' });
      return true;
    }
    
    performEvaluation(payload, sendResponse);
    return true; // Keep message channel open for async response
  } 
  
  else if (request.action === 'EVALUATE_SELECTION') {
    activeConversationPayload = request.payload;
    performEvaluation(request.payload, sendResponse);
    return true; // Keep message channel open for async response
  }

  else if (request.action === 'CLEAR_CACHE') {
    chrome.storage.local.set({ evaluations: {} }, () => {
      sendToActiveTab('CLEAR_CACHE', null);
      sendResponse({ success: true });
    });
    return true;
  }

  return true;
});
