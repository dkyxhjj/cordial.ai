
// Load configuration or use defaults
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 'https://cordial-ai.onrender.com';
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
  const conversationView = document.querySelector('.if, .nH[role="main"] .adn');
  const inConversationView = !!conversationView;
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

async function rewriteEmail(tone = 'professional') {
  try {
    const editor = await waitForEditor();
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
    
    const isNew = isNewEmail();
    const threadContext = isNew ? '' : getEmailThreadContext();

    let fullMessage;
    if (threadContext) {
      fullMessage = `Email Thread Context:\n${threadContext}\n\n--- My Draft Reply ---\n${originalText}\n\nPlease rewrite my draft reply to be more professional and well-structured, taking into account the context of the email thread above.`;
    } else {
      fullMessage = `My draft email:\n${originalText}\n\nPlease rewrite this email to be more professional and well-structured. This is a new email I'm sending out (not a reply), so make it appropriate for reaching out or initiating communication.`;
    }
    
    const response = await fetch(`${API_BASE_URL}/generate-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: fullMessage,
        tone: tone
      })
    });

    if (!response.ok) {
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
      
      showNotification('Email rewritten successfully!', 'success');
      
      return {
        success: true,
        message: 'Email rewritten successfully!'
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
  }, 4000);
}

function createFloatingButton() {
  const existingButton = document.querySelector('.email-rewriter-fab');
  if (existingButton) {
    existingButton.remove();
  }
  
  const fab = document.createElement('div');
  fab.className = 'email-rewriter-fab';
  fab.innerHTML = '✨';
  fab.title = 'Rewrite Email (Ctrl+Shift+R)';
  fab.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 24px;
    color: white;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 9999;
    transition: all 0.3s ease;
    user-select: none;
  `;
  
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.1)';
    fab.style.boxShadow = '0 6px 25px rgba(0,0,0,0.4)';
  });
  
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
    fab.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
  });
  
  fab.addEventListener('click', () => {
    rewriteEmail('professional');
  });
  
  document.body.appendChild(fab);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    rewriteEmail('professional');
  }
});

function initialize() {
  if (window.location.hostname === 'mail.google.com') {
    setTimeout(() => {
      createFloatingButton();
    }, 2000);
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(createFloatingButton, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
