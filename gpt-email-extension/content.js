
// Load configuration or use defaults
const API_BASE_URL = 'https://cordial-ai.onrender.com';
const GMAIL_SELECTORS = window.CONFIG?.GMAIL_SELECTORS || [
  '[contenteditable="true"]',
  'div[role="textbox"]',
  '.Am.Al.editable',
  '.ii.gt .a3s',
  'div[aria-label*="Message Body"]'
];

// Cache for DOM elements to improve performance
let cachedEditor = null;
let lastEditorCheck = 0;
const CACHE_DURATION = 2000; // 2 seconds

function getEmailEditor() {
  const now = Date.now();
  
  // Return cached editor if valid and still in DOM
  if (cachedEditor && (now - lastEditorCheck) < CACHE_DURATION && document.contains(cachedEditor)) {
    return cachedEditor;
  }
  
  // Find editor using optimized selector order (most common first)
  const optimizedSelectors = [
    'div[role="textbox"][contenteditable="true"]', // Most specific Gmail compose
    '[contenteditable="true"]',
    '.Am.Al.editable',
    'div[aria-label*="Message Body"]',
    '.ii.gt .a3s'
  ];
  
  for (const selector of optimizedSelectors) {
    const editor = document.querySelector(selector);
    if (editor && editor.isContentEditable) {
      cachedEditor = editor;
      lastEditorCheck = now;
      return editor;
    }
  }
  
  cachedEditor = null;
  return null;
}

function getEmailThreadContext() {
  const threadSelectors = window.CONFIG?.THREAD_SELECTORS || [
    '.ii.gt',
    '.adn.ads',
    '.h7',
    '.ii.gt .a3s',
    '[data-message-id]',
    '.nH .if',
    '.Ar.Au .h7'
  ];
  
  let threadContext = '';
  for (const selector of threadSelectors) {
    const messages = document.querySelectorAll(selector);
    if (messages.length > 0) {
      messages.forEach((message, index) => {
        const messageText = message.innerText || message.textContent;
        if (messageText && messageText.trim().length > 20) {
          if (!message.isContentEditable && !message.querySelector('[contenteditable="true"]')) {
            threadContext += `\n--- Message ${index + 1} ---\n${messageText.trim()}\n`;
          }
        }
      });
      break;
    }
  }
  if (!threadContext.trim()) {
    const subjectSelectors = window.CONFIG?.SUBJECT_SELECTORS || [
      '.hP',
      '.bog',
      '[name="subjectbox"]',
      '.aoT'
    ];
    
    for (const selector of subjectSelectors) {
      const subjectElement = document.querySelector(selector);
      if (subjectElement) {
        const subjectText = subjectElement.innerText || subjectElement.textContent || subjectElement.value;
        if (subjectText && subjectText.trim()) {
          threadContext = `Subject: ${subjectText.trim()}`;
          break;
        }
      }
    }
  }
  
  return threadContext.trim();
}

function isNewEmail() {
  const editor = getEmailEditor();
  if (!editor) return false;

  const previousMessages = document.querySelectorAll('.ii.gt .a3s, .adn .a3s, .gs .a3s');
  const hasPreviousMessages = previousMessages.length > 0;
  const subjectInput = document.querySelector('input[name="subjectbox"]');
  const isReplySubject = subjectInput && subjectInput.value && 
    (subjectInput.value.toLowerCase().startsWith('re:') || 
     subjectInput.value.toLowerCase().startsWith('fwd:') ||
     subjectInput.value.toLowerCase().startsWith('fw:'));
  return !hasPreviousMessages && !isReplySubject;
}



function waitForEditor(timeout = 10000) {
  return new Promise((resolve, reject) => {
    // First try to get editor immediately
    const editor = getEmailEditor();
    if (editor) {
      resolve(editor);
      return;
    }
    
    // Use MutationObserver for more efficient DOM watching
    const observer = new MutationObserver(() => {
      const editor = getEmailEditor();
      if (editor) {
        observer.disconnect();
        resolve(editor);
      }
    });
    
    // Watch for changes in compose area
    const composeArea = document.querySelector('.nH[role="main"]') || document.body;
    observer.observe(composeArea, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['contenteditable', 'role']
    });
    
    // Fallback timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Email editor not found within timeout'));
    }, timeout);
  });
}

function getUserData() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['user'], (result) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(result.user || null);
      });
    } else {
      resolve(null);
    }
  });
}

async function rewriteEmail(tone = 'professional') {
  try {
    // First check if we're in a compose window at all
    const isInCompose = document.querySelector('.T-I.T-I-KE') ||  // Send button
                        document.querySelector('[role="button"][data-tooltip*="Send"]') ||
                        document.querySelector('.nH .if') ||  // Compose window
                        document.querySelector('.aO7') ||     // Compose dialog
                        document.querySelector('[contenteditable="true"]'); // Any editor
    
    if (!isInCompose) {
      showNotification('Please open a compose window first!', 'warning');
      return {
        success: false,
        error: 'Please open a compose window first!'
      };
    }
    
    // Check for editor immediately - don't wait if none exists
    let editor = getEmailEditor();
    if (!editor) {
      showNotification('Navigate to compose window or reply thread!', 'warning');
      return {
        success: false,
        error: 'Navigate to compose window or reply thread!'
      };
    }
    
    const originalText = editor.innerText || editor.textContent;
    
    if (!originalText || originalText.trim().length === 0) {
      showNotification('Please write some content in the email first!', 'warning');
      return {
        success: false,
        error: 'Please write some content in the email first!'
      };
    }
    
    if (originalText.trim().length < 5) {
      showNotification('Please write more content to rewrite!', 'warning');
      return {
        success: false,
        error: 'Please write more content to rewrite!'
      };
    }

    showNotification('Rewriting your email...', 'info');
    
    // Get user authentication data from Chrome storage
    const userData = await getUserData();
    if (!userData || !userData.authenticated) {
      showNotification('Please log in to use email rewriting!', 'error');
      return {
        success: false,
        error: 'Authentication required. Please log in first.'
      };
    }
    
    const isNew = isNewEmail();
    const threadContext = isNew ? '' : getEmailThreadContext();

    let fullMessage;
    if (threadContext) {
      fullMessage = `Email Thread Context:\n${threadContext}\n\n--- My Draft Reply ---\n${originalText}\n\nPlease rewrite my draft reply to be well-structured, taking into account the context of the email thread above, and make sure to value user's input`;
    } else {
      fullMessage = `My draft email:\n${originalText}\n\nPlease rewrite this email to be well-structured and appropriate for reaching out or initiating communication.`;
    }
    
    const response = await fetch(`${API_BASE_URL}/generate-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        message: fullMessage,
        tone: tone,
        user: userData
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        showNotification('Please log in to use email rewriting!', 'error');
        return {
          success: false,
          error: 'Authentication required. Please log in first.'
        };
      } else if (response.status === 402) {
        showNotification('Insufficient credits! Please add more credits.', 'error');
        return {
          success: false,
          error: 'Insufficient credits. Please add more credits.'
        };
      }
      const errorMessage = `Server error: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (data.response) {
      // Sanitize and safely insert the response to prevent XSS
      const sanitizedResponse = data.response.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      if (editor.isContentEditable && editor.innerHTML !== undefined) {
        // For contenteditable elements, preserve line breaks securely
        editor.innerHTML = sanitizedResponse.replace(/\n/g, '<br>');
      } else {
        // For regular text inputs, use textContent for safety
        editor.textContent = data.response;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      
      const creditsRemaining = data.credits_remaining || 0;
      showNotification(`Email rewritten successfully! Credits remaining: ${creditsRemaining}`, 'success');
      
      return {
        success: true,
        message: 'Email rewritten successfully!',
        credits_remaining: creditsRemaining
      };
    } else {
      throw new Error('No response received from API');
    }
  } catch (error) {
    const errorMessage = `Error: ${error.message}`;
    showNotification(errorMessage, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

function showNotification(message, type = 'info') {
  const existingNotifications = document.querySelectorAll('.email-rewriter-notification');
  existingNotifications.forEach(notification => notification.remove());
  const notification = document.createElement('div');
  notification.className = 'email-rewriter-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 16px 24px;
    border-radius: 8px;
    background: white;
    color: #333;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 400;
    z-index: 999999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    max-width: 320px;
    min-width: 240px;
    word-wrap: break-word;
    text-align: center;
    border: 1px solid #e5e5e5;
    animation: slideInScale 0.2s ease-out;
  `;
  if (!document.querySelector('#email-rewriter-animations')) {
    const style = document.createElement('style');
    style.id = 'email-rewriter-animations';
    style.textContent = `
      @keyframes slideInScale {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      @keyframes slideOutScale {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
      }
    `;
    document.head.appendChild(style);
  }
  const borderColors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#6b7280'
  };
  notification.style.borderLeftColor = borderColors[type] || borderColors.info;
  notification.style.borderLeftWidth = '3px';
  notification.style.borderLeftStyle = 'solid';
  const icons = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i'
  };
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span style="font-size: 14px; font-weight: 600; color: ${borderColors[type] || borderColors.info};">${icons[type] || icons.info}</span>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOutScale 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }
  }, 2000);
}

function initialize() {
  if (window.location.hostname === 'mail.google.com') {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
      }
    }).observe(document, { subtree: true, childList: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
