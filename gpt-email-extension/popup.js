// Popup script for Smart Email Rewriter
// Load configuration
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 'https://cordial-ai.onrender.com';

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
            
            // Set a timeout to prevent infinite loading
            const operationTimeout = setTimeout(() => {
                showStatus('error', 'Operation timed out. Please try again.');
            }, 30000); // 30 second timeout
            
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                clearTimeout(operationTimeout);
                showStatus('error', 'Could not access current tab. Please try again.');
                return;
            }
            
            // Check if we're on Gmail
            if (!tab.url || !tab.url.includes('mail.google.com')) {
                clearTimeout(operationTimeout);
                showStatus('error', 'Please navigate to Gmail first!');
                return;
            }
            
            try {
                // Check if content script is already loaded, if not inject it
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: () => {
                        return typeof rewriteEmail === 'function';
                    }
                });
                
                if (!result.result) {
                    // Content script not loaded, inject config and content script
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['config.js', 'content.js']
                    });
                    
                    // Wait a moment for the script to load
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (scriptError) {
                clearTimeout(operationTimeout);
                showStatus('error', 'Failed to inject content script. Please refresh Gmail and try again.');
                return;
            }
            
            try {
                // Execute the rewrite function and capture result
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: async (tone) => {
                        try {
                            if (typeof rewriteEmail === 'function') {
                                return await rewriteEmail(tone);
                            } else {
                                return {
                                    success: false,
                                    error: 'Content script not properly loaded'
                                };
                            }
                        } catch (error) {
                            return {
                                success: false,
                                error: `Script execution failed: ${error.message}`
                            };
                        }
                    },
                    args: [tone]
                });
                
                // Handle the result from content script
                const executionResult = result.result;
                
                // Check if we got a valid result
                if (!executionResult) {
                    throw new Error('No result returned from content script');
                }
                
                // Clear timeout since operation completed
                clearTimeout(operationTimeout);
                
                if (executionResult && executionResult.success) {
                    // Show success message
                    showStatus('success', executionResult.message || 'Email rewritten successfully!');
                    
                    // Close popup after showing success
                    setTimeout(() => {
                        window.close();
                    }, 1500);
                } else {
                    // Show error message from content script
                    const errorMsg = executionResult?.error || 'Failed to rewrite email';
                    showStatus('error', errorMsg);
                }
                
            } catch (executeError) {
                clearTimeout(operationTimeout);
                console.error('Execute error:', executeError);
                showStatus('error', 'Failed to execute rewrite. Please refresh Gmail and try again.');
            }
            
        } catch (error) {
            // Make sure to clear timeout in case of any uncaught errors
            if (typeof operationTimeout !== 'undefined') {
                clearTimeout(operationTimeout);
            }
            console.error('Rewrite error:', error);
            showStatus('error', `Error: ${error.message || 'Unknown error occurred'}`);
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
        
        // Clear any existing status timeouts
        if (window.statusTimeout) {
            clearTimeout(window.statusTimeout);
        }
        
        // Hide status after delay (except for loading)
        if (type !== 'loading') {
            window.statusTimeout = setTimeout(() => {
                statusDiv.style.display = 'none';
            }, type === 'success' ? 1500 : 4000); // Success shows shorter, errors longer
        }
    }
});

// Authentication functions
async function checkAuthStatus() {
    try {
        chrome.storage.local.get(['user'], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
                showUnauthenticatedState();
                return;
            }
            
            if (result.user && result.user.authenticated) {
                showAuthenticatedState(result.user);
            } else {
                showUnauthenticatedState();
            }
        });
    } catch (error) {
        console.error('Auth check error:', error);
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
            if (chrome.runtime.lastError) {
                console.error('Storage error loading credits:', chrome.runtime.lastError);
                updateCreditsDisplay(0);
                return;
            }
            
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
                        console.warn('Failed to fetch credits from server, using cached value');
                        updateCreditsDisplay(result.user.credits || 10);
                    }
                } catch (error) {
                    console.error('Credits fetch error:', error);
                    updateCreditsDisplay(result.user.credits || 10);
                }
            } else {
                updateCreditsDisplay(0);
            }
        });
    } catch (error) {
        console.error('Load credits error:', error);
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
                // Send acknowledgment back to auth window
                event.source.postMessage({
                    type: 'auth_received'
                }, event.origin);
                
                window.removeEventListener('message', messageListener);
                popup.close();
                
                const user = event.data.user;
                user.authenticated = true;
                chrome.storage.local.set({user: user}, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Storage error:', chrome.runtime.lastError);
                        showStatus('error', 'Failed to save authentication');
                        return;
                    }
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
            if (chrome.runtime.lastError) {
                console.error('Storage error during logout:', chrome.runtime.lastError);
                showStatus('error', 'Logout failed - storage error');
                return;
            }
            showUnauthenticatedState();
            showStatus('success', 'Logged out successfully');
        });
        
        // Attempt to logout from server (don't block on this)
        fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'GET',
            credentials: 'include'
        }).catch((error) => {
            console.warn('Server logout failed:', error);
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        showStatus('error', 'Logout failed');
    }
}
