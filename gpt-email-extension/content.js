
// Configuration
const API_BASE_URL = 'https://cordial-ai.onrender.com/'; // Change this to your deployed URL when ready

// Gmail editor selectors
const GMAIL_SELECTORS = [
  '[contenteditable="true"]',
  'div[role="textbox"]',
  '.Am.Al.editable',
  '.ii.gt .a3s',
  'div[aria-label*="Message Body"]'
];

function getEmailEditor() {
  for (const selector of GMAIL_SELECTORS) {
    const editor = document.querySelector(selector);
    if (editor && editor.isContentEditable) {
      return editor;
    }
  }
  return null;
}

function getEmailThreadContext() {
  // Try to capture the full email conversation thread
  const threadSelectors = [
    '.ii.gt',  // Gmail conversation messages
    '.adn.ads', // Gmail message containers
    '.h7', // Gmail message content
    '.ii.gt .a3s', // Gmail message body
    '[data-message-id]', // Gmail message containers with IDs
    '.nH .if', // Gmail conversation view
    '.Ar.Au .h7' // Gmail expanded messages
  ];
  
  let threadContext = '';
  
  // Try to get the conversation thread
  for (const selector of threadSelectors) {
    const messages = document.querySelectorAll(selector);
    if (messages.length > 0) {
      messages.forEach((message, index) => {
        const messageText = message.innerText || message.textContent;
        if (messageText && messageText.trim().length > 20) {
          // Skip if it's likely the compose window itself
          if (!message.isContentEditable && !message.querySelector('[contenteditable="true"]')) {
            threadContext += `\n--- Message ${index + 1} ---\n${messageText.trim()}\n`;
          }
        }
      });
      break; // Use the first selector that finds messages
    }
  }
  
  // If no thread context found, try to get subject line
  if (!threadContext.trim()) {
    const subjectSelectors = [
      '.hP', // Gmail subject line
      '.bog', // Gmail subject in compose
      '[name="subjectbox"]', // Gmail subject input
      '.aoT' // Gmail subject area
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

  // Simple approach: check if we can find any previous message content in the DOM
  // This works for replies to any type of message (starred, regular, etc.)
  const previousMessages = document.querySelectorAll('.ii.gt .a3s, .adn .a3s, .gs .a3s');
  const hasPreviousMessages = previousMessages.length > 0;
  
  // Check subject line for reply indicators
  const subjectInput = document.querySelector('input[name="subjectbox"]');
  const isReplySubject = subjectInput && subjectInput.value && 
    (subjectInput.value.toLowerCase().startsWith('re:') || 
     subjectInput.value.toLowerCase().startsWith('fwd:') ||
     subjectInput.value.toLowerCase().startsWith('fw:'));
  
  // Check if we're in a conversation view (has thread indicators)
  const conversationView = document.querySelector('.if, .nH[role="main"] .adn');
  const inConversationView = !!conversationView;
  
  
  // It's a new email if there are no previous messages AND no reply subject
  return !hasPreviousMessages && !isReplySubject;
}



function waitForEditor(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const editor = getEmailEditor();
      if (editor) {
        clearInterval(interval);
        resolve(editor);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error('Email editor not found within timeout'));
      }
    }, 500);
  });
}

async function rewriteEmail(tone = 'professional') {
  try {
    const editor = await waitForEditor();
    const originalText = editor.innerText || editor.textContent;
    
    if (!originalText || originalText.trim().length === 0) {
      showNotification('Please write some content in the email first!', 'warning');
      return;
    }
    
    // Check if the text is just whitespace or very short
    if (originalText.trim().length < 5) {
      showNotification('Please write more content to rewrite!', 'warning');
      return;
    }

    // Show loading indicator
    showNotification('Rewriting your email...', 'info');
    
    // Check if this is a new email or reply
    // Inside rewriteEmail():
    const isNew = isNewEmail();
    const threadContext = isNew ? '' : getEmailThreadContext();

    
    // Construct the message with appropriate context
    let fullMessage;
    if (threadContext) {
      fullMessage = `Email Thread Context:\n${threadContext}\n\n--- My Draft Reply ---\n${originalText}\n\nPlease rewrite my draft reply to be more professional and well-structured, taking into account the context of the email thread above.`;
    } else {
      fullMessage = `My draft email:\n${originalText}\n\nPlease rewrite this email to be more professional and well-structured. This is a new email I'm sending out (not a reply), so make it appropriate for reaching out or initiating communication.`;
    }
    
    
    // Send to Flask API
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
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.response) {
      // Replace the content in the editor
      if (editor.innerHTML) {
        editor.innerHTML = data.response.replace(/\n/g, '<br>');
      } else {
        editor.textContent = data.response;
      }
      
      // Trigger input event to notify Gmail of the change
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      throw new Error('No response received from API');
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.email-rewriter-notification');
  existingNotifications.forEach(notification => notification.remove());
  
  // Create notification element
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
  
  // Add animation keyframes
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
  
  // Set border color based on type
  const borderColors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#6b7280'
  };
  notification.style.borderLeftColor = borderColors[type] || borderColors.info;
  notification.style.borderLeftWidth = '3px';
  notification.style.borderLeftStyle = 'solid';
  
  // Simple text icons
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
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOutScale 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

// Add floating action button
function createFloatingButton() {
  // Remove existing button if any
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

// Keyboard shortcut listener
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    rewriteEmail('professional');
  }
});

// Initialize when DOM is ready
function initialize() {
  // Only run on Gmail
  if (window.location.hostname === 'mail.google.com') {
    
    // Wait a bit for Gmail to load
    setTimeout(() => {
      createFloatingButton();
    }, 2000);
    
    // Re-create button when navigating within Gmail
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

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
