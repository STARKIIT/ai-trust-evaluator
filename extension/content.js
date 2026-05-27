/**
 * AI Output Trust & Reliability Evaluator - Content Script
 * Handles DOM monitoring, text selection, floating widgets, and sidebar injection.
 */

// Define platform-specific selectors for prompts and responses
const PLATFORM_SELECTORS = {
  chatgpt: {
    prompt: '[data-message-author-role="user"]',
    response: '[data-message-author-role="assistant"]',
    container: 'main'
  },
  claude: {
    prompt: '.font-user-prompt, [data-testid="user-message"]',
    response: '.font-claude-message, [data-testid="assistant-message"]',
    container: 'main, .flex-col'
  },
  gemini: {
    prompt: 'user-query, .query-text, .user-query',
    response: 'message-content, .message-content, .model-response, model-response',
    container: '.chat-history, .conversation-container, chat-history, conversation-container'
  }
};

let currentPlatform = 'unknown';
let sidebarIframe = null;
let lastSelectedText = '';
let floatingEvaluateButton = null;

// Determine current platform based on URL
function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('chatgpt.com')) return 'chatgpt';
  if (host.includes('gemini.google.com')) return 'gemini';
  return 'unknown';
}

// Extract prompt-response pairs from the page
function extractConversations() {
  const platform = detectPlatform();
  currentPlatform = platform;
  const selectors = PLATFORM_SELECTORS[platform];
  if (!selectors) return { prompt: '', response: '' };

  const prompts = document.querySelectorAll(selectors.prompt);
  const responses = document.querySelectorAll(selectors.response);

  let lastPrompt = '';
  let lastResponse = '';

  if (prompts.length > 0) {
    lastPrompt = prompts[prompts.length - 1].innerText || prompts[prompts.length - 1].textContent;
  }
  if (responses.length > 0) {
    lastResponse = responses[responses.length - 1].innerText || responses[responses.length - 1].textContent;
  }

  // Fallback if structured selectors failed (sometimes platforms update class names)
  if (!lastPrompt || !lastResponse) {
    // Try simple heuristics: look for general text blocks
    const chatContainer = document.querySelector(selectors.container) || document.body;
    console.log('[Evaluator Extension] Fallback scanning in container:', chatContainer);
  }

  return {
    platform: platform,
    prompt: lastPrompt.trim(),
    response: lastResponse.trim()
  };
}

// Set up UI Sidebar
function injectSidebar() {
  if (sidebarIframe) return;

  // Create iframe container
  const container = document.createElement('div');
  container.id = 'ai-evaluator-sidebar-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    right: -450px;
    width: 420px;
    height: 100vh;
    z-index: 2147483647;
    transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: -5px 0 25px rgba(0,0,0,0.15);
    background: #0B0F19;
    border-left: 1px solid #1E293B;
  `;

  // Create iframe pointing to extension's sidebar page
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('sidebar.html');
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
  `;
  container.appendChild(iframe);
  document.body.appendChild(container);
  sidebarIframe = container;

  // Create Floating Toggle Button on the side of the screen
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'ai-evaluator-toggle';
  toggleBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M12 8v4"/>
      <path d="M12 16h.01"/>
    </svg>
  `;
  toggleBtn.style.cssText = `
    position: fixed;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    width: 40px;
    height: 48px;
    background: #4F46E5;
    color: white;
    border: 1px solid #6366F1;
    border-radius: 8px 0 0 8px;
    cursor: pointer;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: -2px 2px 10px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
  `;
  
  toggleBtn.addEventListener('mouseenter', () => {
    toggleBtn.style.background = '#6366F1';
    toggleBtn.style.width = '44px';
  });
  toggleBtn.addEventListener('mouseleave', () => {
    toggleBtn.style.background = '#4F46E5';
    toggleBtn.style.width = '40px';
  });

  toggleBtn.addEventListener('click', () => {
    toggleSidebar();
  });

  document.body.appendChild(toggleBtn);
}

function toggleSidebar(forceOpen = null) {
  if (!sidebarIframe) injectSidebar();
  
  const isOpen = sidebarIframe.style.right === '0px';
  const shouldOpen = forceOpen !== null ? forceOpen : !isOpen;

  if (shouldOpen) {
    sidebarIframe.style.right = '0px';
    // When opening, extract conversation data and send it to the sidebar
    setTimeout(() => {
      const data = extractConversations();
      data.selected_text = lastSelectedText;
      chrome.runtime.sendMessage({ action: 'SEND_CONVERSATION_DATA', payload: data });
    }, 100);
  } else {
    sidebarIframe.style.right = '-450px';
  }
}

// Floating Selection Widget setup
function handleSelectionChange(e) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length > 0) {
    lastSelectedText = selectedText;
    
    // Show floating button
    if (!floatingEvaluateButton) {
      floatingEvaluateButton = document.createElement('button');
      floatingEvaluateButton.innerText = 'Evaluate Quality';
      floatingEvaluateButton.style.cssText = `
        position: fixed;
        background: #6366F1;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 20px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        transition: transform 0.1s ease;
      `;
      floatingEvaluateButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar(true);
        // Send data directly
        const data = extractConversations();
        data.selected_text = lastSelectedText;
        chrome.runtime.sendMessage({ action: 'EVALUATE_SELECTION', payload: data });
        removeFloatingButton();
      });
      document.body.appendChild(floatingEvaluateButton);
    }
    
    // Position floating button near selection
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      floatingEvaluateButton.style.top = `${window.scrollY + rect.top - 36}px`;
      floatingEvaluateButton.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 50}px`;
      floatingEvaluateButton.style.display = 'block';
    } catch (err) {
      removeFloatingButton();
    }
  } else {
    // Check if clicked outside button
    if (floatingEvaluateButton && e.target !== floatingEvaluateButton) {
      removeFloatingButton();
    }
  }
}

function removeFloatingButton() {
  if (floatingEvaluateButton) {
    floatingEvaluateButton.remove();
    floatingEvaluateButton = null;
  }
}

// Observe DOM for response completion
let lastResponseLength = 0;
let checkTimeout = null;

function setupMutationObserver() {
  const targetNode = document.body;
  const config = { childList: true, subtree: true, characterData: true };

  const callback = (mutationsList, observer) => {
    const platform = detectPlatform();
    const selectors = PLATFORM_SELECTORS[platform];
    if (!selectors) return;

    const responses = document.querySelectorAll(selectors.response);
    if (responses.length === 0) return;

    const lastResponse = responses[responses.length - 1];
    const textLength = lastResponse.innerText ? lastResponse.innerText.length : 0;

    if (textLength > 0 && textLength !== lastResponseLength) {
      lastResponseLength = textLength;
      
      // Debounce trigger: wait for generation to stop for 2 seconds
      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        console.log('[Evaluator Extension] Detected message complete. Sending update.');
        const data = extractConversations();
        chrome.runtime.sendMessage({ action: 'MESSAGE_COMPLETED', payload: data });
      }, 2000);
    }
  };

  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
}

// ─── DOM Highlighting Logic ──────────────────────────────────────────────────

function clearHighlights() {
  const highlights = document.querySelectorAll('.ai-evaluator-highlight');
  highlights.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      const textNode = document.createTextNode(span.textContent);
      parent.replaceChild(textNode, span);
      parent.normalize();
    }
  });
}

function highlightTextInElement(element, searchText, type, severity, description) {
  if (!element || !searchText) return;
  
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  let node;
  while (node = walk.nextNode()) {
    textNodes.push(node);
  }
  
  let searchStr = searchText.trim();
  if (searchStr.length > 40) {
    searchStr = searchStr.substring(0, 40);
  }
  
  const searchTextLower = searchStr.toLowerCase();
  if (searchTextLower.length < 5) return;

  for (const textNode of textNodes) {
    const parent = textNode.parentNode;
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.classList.contains('ai-evaluator-highlight'))) {
      continue;
    }
    
    const nodeText = textNode.nodeValue;
    const nodeTextLower = nodeText.toLowerCase();
    const index = nodeTextLower.indexOf(searchTextLower);
    
    if (index !== -1) {
      const matchText = nodeText.substring(index, index + searchStr.length);
      const beforeText = nodeText.substring(0, index);
      const afterText = nodeText.substring(index + searchStr.length);
      
      const beforeNode = document.createTextNode(beforeText);
      const afterNode = document.createTextNode(afterText);
      
      const highlightSpan = document.createElement('span');
      highlightSpan.className = `ai-evaluator-highlight type-${type} severity-${severity.toLowerCase()}`;
      highlightSpan.textContent = matchText;
      
      let bgColor = 'rgba(245, 158, 11, 0.25)'; // MEDIUM (yellow)
      let borderBottom = '2px dashed #F59E0B';
      if (severity.toUpperCase() === 'HIGH') {
        bgColor = 'rgba(239, 68, 68, 0.3)'; // HIGH (red)
        borderBottom = '2px solid #EF4444';
      } else if (severity.toUpperCase() === 'LOW') {
        bgColor = 'rgba(99, 102, 241, 0.2)'; // LOW (indigo/blue)
        borderBottom = '2px dashed #6366F1';
      }
      
      highlightSpan.style.cssText = `
        background-color: ${bgColor};
        border-bottom: ${borderBottom};
        cursor: help;
        transition: background-color 0.2s ease;
        position: relative;
        border-radius: 2px;
        padding: 1px 0;
      `;
      highlightSpan.title = `[${type.replace(/_/g, ' ').toUpperCase()}] ${description}`;
      
      parent.insertBefore(beforeNode, textNode);
      parent.insertBefore(highlightSpan, textNode);
      parent.insertBefore(afterNode, textNode);
      parent.removeChild(textNode);
      break;
    }
  }
}

function applyHighlights(data) {
  clearHighlights();
  
  const platform = detectPlatform();
  const selectors = PLATFORM_SELECTORS[platform];
  if (!selectors) return;

  const responses = document.querySelectorAll(selectors.response);
  if (responses.length === 0) return;
  const latestResponseElement = responses[responses.length - 1];

  const attentionAreas = data.attention_segments || [];
  const segments = data.segments || [];

  for (const area of attentionAreas) {
    let searchText = '';
    
    // If we have a segment_id, find the segment's content
    if (area.segment_id) {
      const matchSeg = segments.find(s => s.id === area.segment_id);
      if (matchSeg) {
        searchText = matchSeg.content;
      }
    }
    
    // Fallback to description if no segment match or content is empty
    if (!searchText) {
      searchText = area.description;
    }

    if (searchText) {
      highlightTextInElement(
        latestResponseElement, 
        searchText, 
        area.type, 
        area.severity || 'MEDIUM', 
        area.description
      );
    }
  }
}

// Message listener from background/sidebar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_EXTRACTED_DATA') {
    const data = extractConversations();
    data.selected_text = lastSelectedText;
    sendResponse(data);
  } else if (request.action === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  } else if (request.action === 'EVALUATION_RESULT') {
    applyHighlights(request.payload);
  } else if (request.action === 'CLEAR_CACHE') {
    clearHighlights();
  }
  return true;
});

// Initialize elements
document.addEventListener('mouseup', handleSelectionChange);
injectSidebar();
setupMutationObserver();

console.log('[Evaluator Extension] Content script successfully loaded.');
