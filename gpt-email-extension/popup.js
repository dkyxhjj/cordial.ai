// Popup script for Smart Email Rewriter
// Load configuration
const API_BASE_URL = 'https://cordial-ai.onrender.com';

document.addEventListener('DOMContentLoaded', function() {
    const toneButtons = document.querySelectorAll('.tone-btn');
    const statusDiv = document.getElementById('status');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
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
    
    // Show cached credits immediately, then update with server data
    const cachedCredits = user.credits || 15;
    updateCreditsDisplay(cachedCredits);
    
    // Show credits actions
    const creditsActions = document.getElementById('credits-actions');
    if (creditsActions) {
        creditsActions.style.display = 'block';
    }
    
    // Add event listeners for credit buttons
    setupCreditButtons(user);
    
    loadUserCredits();
}

// Debug function to test API connectivity
window.testClaimAPI = async function() {
    try {
        const response = await fetch(`${API_BASE_URL}/claim-daily-credits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                user: { 
                    email: 'test@example.com' 
                } 
            })
        });
        
        console.log('Test API response status:', response.status);
        const data = await response.json();
        console.log('Test API response data:', data);
    } catch (error) {
        console.error('Test API error:', error);
    }
};

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
                        
                        // Update cached user data with fresh credits
                        const updatedUser = { ...result.user, credits: data.credits };
                        chrome.storage.local.set({ user: updatedUser });
                    } else {
                        console.warn('Failed to fetch credits from server, using cached value');
                        updateCreditsDisplay(result.user.credits || 15);
                    }
                } catch (error) {
                    console.error('Credits fetch error:', error);
                    updateCreditsDisplay(result.user.credits || 15);
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
        console.log('Auth URL:', authUrl);
        const popup = window.open(authUrl, 'oauth', 'width=500,height=600,scrollbars=yes,resizable=yes');
        console.log('Popup opened:', popup);
        
        // Method 1: Direct function call
        window.handleAuthSuccess = function(userInfo) {
            console.log('Direct auth success called!', userInfo);
            processAuthSuccess(userInfo);
        };
        
        // Method 2: PostMessage listener  
        const messageListener = (event) => {
            console.log('Message received:', event.data, 'from origin:', event.origin);
            if (event.data && event.data.type === 'auth_success' && event.data.user) {
                console.log('Auth success message received!');
                processAuthSuccess(event.data.user);
            }
        };
        window.addEventListener('message', messageListener);
        
        // Method 3: Check Chrome storage for auth success
        const checkAuthSuccess = setInterval(() => {
            chrome.storage.local.get(['authSuccess', 'user', 'timestamp'], (result) => {
                if (result.authSuccess && result.user && result.timestamp) {
                    // Check if auth is recent (within last 30 seconds)
                    const now = Date.now();
                    if (now - result.timestamp < 30000) {
                        console.log('Auth success found in Chrome storage!');
                        processAuthSuccess(result.user);
                        return;
                    }
                }
            });
            
            // Method 4: Check localStorage for auth success
            try {
                const authData = localStorage.getItem('cordial_auth_success');
                const authTimestamp = localStorage.getItem('cordial_auth_timestamp');
                
                if (authData && authTimestamp) {
                    const now = Date.now();
                    const timestamp = parseInt(authTimestamp);
                    
                    if (now - timestamp < 30000) { // Within 30 seconds
                        console.log('Auth success found in localStorage!');
                        const userInfo = JSON.parse(decodeURIComponent(authData));
                        localStorage.removeItem('cordial_auth_success');
                        localStorage.removeItem('cordial_auth_timestamp');
                        processAuthSuccess(userInfo);
                    }
                }
            } catch (e) {
                console.log('localStorage check failed:', e);
            }
        }, 500);
        
        // Function to process successful authentication
        function processAuthSuccess(userInfo) {
            clearInterval(checkAuthSuccess);
            window.removeEventListener('message', messageListener);
            
            // Clean up auth success flag
            chrome.storage.local.remove(['authSuccess', 'timestamp']);
            
            // Close popup if still open
            if (popup && !popup.closed) {
                popup.close();
            }
            
            // Update UI with authenticated state
            const user = userInfo;
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
        
        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                clearInterval(checkAuthSuccess);
            }
        }, 1000);
        
        // Clean up after 60 seconds
        setTimeout(() => {
            clearInterval(checkAuthSuccess);
        }, 60000);
        
    } catch (error) {
        showStatus('error', 'Login failed. Please try again.');
    }
}

function setupCreditButtons(user) {
    const claimButton = document.getElementById('claim-daily-credits');
    const buyButton = document.getElementById('buy-credits');
    
    if (claimButton) {
        claimButton.addEventListener('click', () => handleClaimDailyCredits(user));
        checkDailyCreditAvailability(user);
    }
    
    if (buyButton) {
        buyButton.addEventListener('click', () => handleBuyCredits(user));
    }

}

async function handleBuyCredits(user) {
    try {
        showStatus('loading', 'Creating checkout session...');
        
        const response = await fetch(`${API_BASE_URL}/create-checkout-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: user.email,
                credits: 20 // Default 10 credits for $10
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.checkout_url) {
            showStatus('success', 'Redirecting to checkout...');
            window.open(data.checkout_url, '_blank');
        } else {
            showStatus('error', data.error || 'Failed to create checkout session');
        }
    } catch (error) {
        console.error('Buy credits error:', error);
        showStatus('error', 'Failed to start checkout process');
    }
}

async function handleClaimDailyCredits(user) {
    try {
        console.log('Starting claim credits for user:', user);
        console.log('User email check:', user?.email);
        
        if (!user || !user.email) {
            showStatus('error', 'User authentication required');
            console.error('No user or email found:', user);
            return;
        }
        
        showStatus('loading', 'Claiming daily credits...');
        
        const requestBody = { user: user };
        console.log('Request body:', requestBody);
        console.log('API URL:', `${API_BASE_URL}/claim-daily-credits`);
        
        const response = await fetch(`${API_BASE_URL}/claim-daily-credits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.ok && data.success) {
            showStatus('success', `Claimed ${data.credits_added} credits!`);
            updateCreditsDisplay(data.new_total);
            
            // Update cached user data with last claim info
            const updatedUser = { 
                ...user, 
                credits: data.new_total,
                last_daily_claim: new Date().toISOString()
            };
            chrome.storage.local.set({ user: updatedUser });
            
            // Disable button until next day
            checkDailyCreditAvailability(updatedUser);
        } else {
            console.error('Claim failed:', data);
            showStatus('error', data.error || 'Failed to claim credits');
        }
    } catch (error) {
        console.error('Claim credits error:', error);
        showStatus('error', 'Failed to claim daily credits');
    }
}

function checkDailyCreditAvailability(user) {
    const claimButton = document.getElementById('claim-daily-credits');
    if (!claimButton) return;
    
    // Check if user has already claimed today (UTC)
    const now = new Date();
    const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const lastClaim = user.last_daily_claim ? new Date(user.last_daily_claim) : null;
    
    if (lastClaim) {
        const lastClaimDay = new Date(lastClaim.getUTCFullYear(), lastClaim.getUTCMonth(), lastClaim.getUTCDate());
        
        if (today.getTime() === lastClaimDay.getTime()) {
            // Already claimed today
            claimButton.disabled = true;
            claimButton.textContent = 'Claimed Today';
            claimButton.style.background = '#9ca3af';
            claimButton.style.borderColor = '#9ca3af';
            claimButton.style.color = '#6b7280';
            claimButton.style.cursor = 'not-allowed';
            return;
        }
    }
    
    // Can claim today
    claimButton.disabled = false;
    claimButton.textContent = 'Claim Daily Credits (3)';
    claimButton.style.background = 'white';
    claimButton.style.borderColor = '#d1d5db';
    claimButton.style.color = '#374151';
    claimButton.style.cursor = 'pointer';
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
