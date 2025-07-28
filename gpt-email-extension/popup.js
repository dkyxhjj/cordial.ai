// Popup script for Smart Email Rewriter
const API_BASE_URL = 'https://cordial-ai.onrender.com/';

document.addEventListener('DOMContentLoaded', function() {
    const toneButtons = document.querySelectorAll('.tone-btn');
    const statusDiv = document.getElementById('status');
    const authSection = document.getElementById('auth-section');
    const mainSection = document.getElementById('main-section');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    
    // Check authentication status on load
    checkAuthStatus();
    
    // Add click handlers to tone buttons
    toneButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tone = this.getAttribute('data-tone');
            rewriteEmailWithTone(tone);
        });
    });
    
    // Add auth button handlers
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    async function rewriteEmailWithTone(tone) {
        try {
            // Show loading status
            showStatus('loading', 'Rewriting your email...');
            
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we're on Gmail
            if (!tab.url.includes('mail.google.com')) {
                showStatus('error', 'Please navigate to Gmail first!');
                return;
            }
            
            // First inject the content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            
            // Then execute the rewrite function
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: executeRewrite,
                args: [tone]
            });
            
            // Close popup after success
            setTimeout(() => {
                window.close();
            }, 500);
            
        } catch (error) {
            showStatus('error', 'Failed to rewrite email. Make sure you\'re on Gmail.');
        }
    }
    
    function showStatus(type, message) {
        statusDiv.className = `status ${type}`;
        
        if (type === 'loading') {
            statusDiv.innerHTML = `<span class="spinner"></span>${message}`;
        } else {
            statusDiv.textContent = message;
        }
        
        statusDiv.style.display = 'block';
        
        // Hide status after 3 seconds (except for loading)
        if (type !== 'loading') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
    }
});

// Function to be injected into the content script
function executeRewrite(tone) {
    // This function will be executed in the context of the Gmail page
    const API_BASE_URL = 'https://cordial-ai.onrender.com';
    
    async function getEmailEditor() {
        const selectors = [
            '[contenteditable="true"]',
            'div[role="textbox"]',
            '.Am.Al.editable',
            '.ii.gt .a3s',
            'div[aria-label*="Message Body"]'
        ];
        
        for (const selector of selectors) {
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
    
    async function rewriteEmail() {
        try {
            const editor = await getEmailEditor();
            if (!editor) {
                throw new Error('Email editor not found. Please click in the email compose area first.');
            }
            
            const originalText = editor.innerText || editor.textContent;
            
            if (!originalText || originalText.trim().length === 0) {
                throw new Error('Please write some content in the email first!');
            }
            
            // Check if the text is just whitespace or very short
            if (originalText.trim().length < 5) {
                throw new Error('Please write more content to rewrite!');
            }
            
            // Check if this is a new email or reply
            const isNew = isNewEmail();
            const threadContext = isNew ? '' : getEmailThreadContext();
            
            // Construct the message with appropriate context
            let fullMessage;
            if (threadContext) {
                fullMessage = `Email Thread Context:\n${threadContext}\n\n--- My Draft Reply ---\n${originalText}\n\nPlease rewrite my draft reply to be more professional and well-structured, taking into account the context of the email thread above.`;
            } else {
                fullMessage = `My draft email:\n${originalText}\n\nPlease rewrite this email to be more professional and well-structured. This is a new email I'm sending out (not a reply), so make it appropriate for reaching out or initiating communication.`;
            }
            
            // Get user info from storage for API request
            const userData = await new Promise((resolve) => {
                chrome.storage.local.get(['user'], (result) => {
                    resolve(result.user);
                });
            });
            
            // Send to Flask API
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
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 401 && errorData.auth_required) {
                    throw new Error('Please sign in to use the email rewriter');
                }
                throw new Error(`Server error: ${response.status}`);
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
                
                // Update credits in popup if available
                if (data.credits_remaining !== undefined) {
                    chrome.storage.local.get(['user'], (result) => {
                        if (result.user) {
                            result.user.credits = data.credits_remaining;
                            chrome.storage.local.set({user: result.user});
                        }
                    });
                }
                
                // Show success notification
                showNotification('Email rewritten successfully!', 'success');
            } else {
                throw new Error('No response received from API');
            }
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
            throw error;
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
    
    // Execute the rewrite
    return rewriteEmail();
}

// Authentication functions
async function checkAuthStatus() {
    try {
        chrome.storage.local.get(['user'], (result) => {
            if (result.user && result.user.authenticated) {
                showAuthenticatedState(result.user);
            } else {
                showUnauthenticatedState();
            }
        });
    } catch (error) {
        showUnauthenticatedState();
    }
}

function showAuthenticatedState(user) {
    const authSection = document.getElementById('auth-section');
    const mainSection = document.getElementById('main-section');
    const userInfo = document.getElementById('user-info');
    
    if (authSection) {
        authSection.style.display = 'none';
    }
    if (mainSection) {
        mainSection.style.display = 'block';
    }
    if (userInfo) {
        userInfo.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                ${user.picture ? `<img src="${user.picture}" style="width: 24px; height: 24px; border-radius: 50%;" />` : ''}
                <span style="font-size: 12px; color: #666;">${user.email}</span>
                <button id="logout-btn" style="margin-left: auto; padding: 4px 8px; font-size: 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Logout</button>
            </div>
        `;
        
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }
    
    loadUserCredits();
}

async function loadUserCredits() {
    try {
        chrome.storage.local.get(['user'], async (result) => {
            if (result.user && result.user.email) {
                try {
                    const response = await fetch(`${API_BASE_URL}/get-credits`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            user: result.user
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        updateCreditsDisplay(data.credits);
                    } else {
                        updateCreditsDisplay(result.user.credits || 10);
                    }
                } catch (error) {
                    updateCreditsDisplay(result.user.credits || 10);
                }
            } else {
                updateCreditsDisplay(0);
            }
        });
    } catch (error) {
        updateCreditsDisplay(0);
    }
}

function updateCreditsDisplay(credits) {
    const creditsDisplay = document.getElementById('credits-display');
    const creditsCount = document.getElementById('credits-count');
    
    if (creditsDisplay && creditsCount) {
        creditsCount.textContent = credits;
        creditsDisplay.style.display = 'block';
        
        if (credits <= 3) {
            creditsDisplay.classList.add('low-credits');
        } else {
            creditsDisplay.classList.remove('low-credits');
        }
    }
}

function showUnauthenticatedState() {
    const authSection = document.getElementById('auth-section');
    const mainSection = document.getElementById('main-section');
    
    if (authSection) {
        authSection.style.display = 'block';
    }
    if (mainSection) {
        mainSection.style.display = 'none';
    }
}

async function handleLogin() {
    try {
        // Open OAuth popup
        const authUrl = `${API_BASE_URL}/auth/login`;
        const popup = window.open(authUrl, 'oauth', 'width=500,height=600,scrollbars=yes,resizable=yes');
        
        // Listen for auth success message
        const messageListener = (event) => {
            if (event.data && event.data.type === 'auth_success' && event.data.user) {
                window.removeEventListener('message', messageListener);
                popup.close();
                
                const user = event.data.user;
                user.authenticated = true;
                chrome.storage.local.set({user: user}, () => {
                    showAuthenticatedState(user);
                });
            }
        };
        
        window.addEventListener('message', messageListener);
        
        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', messageListener);
            }
        }, 1000);
        
    } catch (error) {
        showStatus('error', 'Login failed. Please try again.');
    }
}

async function handleLogout() {
    try {
        chrome.storage.local.remove(['user'], () => {
            showUnauthenticatedState();
            showStatus('success', 'Logged out successfully');
        });
        
        fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'GET',
            credentials: 'include'
        }).catch(() => {});
        
    } catch (error) {
        showStatus('error', 'Logout failed');
    }
}
