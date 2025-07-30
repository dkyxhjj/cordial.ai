// Simple Popup script for Smart Email Rewriter
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
    
    // Add click handler for tips button
    const tipsButton = document.getElementById('tips');
    if (tipsButton) {
        tipsButton.addEventListener('click', function() {
            window.open('https://buy.stripe.com/28E6oIgkv4l11Wd4Jo5gc02', '_blank');
        });
    }
    
    // Add auth button handlers
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    async function rewriteEmailWithTone(tone) {
        try {
            showStatus('loading', 'Rewriting your email...');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url || !tab.url.includes('mail.google.com')) {
                showStatus('error', 'Please navigate to Gmail first!');
                return;
            }
            
            try {
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: () => typeof rewriteEmail === 'function'
                });
                
                if (!result.result) {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['config.js', 'content.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (scriptError) {
                showStatus('error', 'Failed to inject content script. Please refresh Gmail and try again.');
                return;
            }
            
            try {
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: async (tone) => {
                        if (typeof rewriteEmail === 'function') {
                            return await rewriteEmail(tone);
                        } else {
                            return { success: false, error: 'Content script not properly loaded' };
                        }
                    },
                    args: [tone]
                });
                
                const executionResult = result.result;
                
                if (executionResult && executionResult.success) {
                    showStatus('success', executionResult.message || 'Email rewritten successfully!');
                    
                    // Update credits display if available
                    if (typeof executionResult.credits_remaining === 'number') {
                        updateCreditsDisplay(executionResult.credits_remaining);
                        
                        // Update cached user data
                        chrome.storage.local.get(['user'], (result) => {
                            if (result.user) {
                                const updatedUser = { ...result.user, credits: executionResult.credits_remaining };
                                chrome.storage.local.set({ user: updatedUser });
                            }
                        });
                    }
                    
                    setTimeout(() => window.close(), 1500);
                } else {
                    const errorMsg = executionResult?.error || 'Failed to rewrite email';
                    showStatus('error', errorMsg);
                }
                
            } catch (executeError) {
                showStatus('error', 'Failed to execute rewrite. Please refresh Gmail and try again.');
            }
            
        } catch (error) {
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
        
        if (window.statusTimeout) {
            clearTimeout(window.statusTimeout);
        }
        
        if (type !== 'loading') {
            window.statusTimeout = setTimeout(() => {
                statusDiv.style.display = 'none';
            }, type === 'success' ? 1500 : 4000);
        }
    }
});

// Authentication functions
async function checkAuthStatus() {
    try {
        chrome.storage.local.get(['user'], (result) => {
            if (chrome.runtime.lastError) {
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
        showUnauthenticatedState();
    }
}

function showAuthenticatedState(user) {
    const authSection = document.getElementById('auth-section');
    const mainSection = document.getElementById('main-section');
    const userInfo = document.getElementById('user-info');
    
    if (authSection) authSection.style.display = 'none';
    if (mainSection) mainSection.style.display = 'block';
    
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
    
    // Show credits
    const cachedCredits = user.credits || 15;
    updateCreditsDisplay(cachedCredits);
    
    const creditsActions = document.getElementById('credits-actions');
    if (creditsActions) {
        creditsActions.style.display = 'block';
    }
    
    // Setup add credits button
    setupAddCreditsButton(user);
    
    // Setup credit refresh monitoring for Stripe purchases
    setupStripeMonitoring();
    
    // Load fresh credits from server
    loadUserCredits();
}

function setupAddCreditsButton(user) {
    const addButton = document.getElementById('claim-daily-credits');
    if (!addButton) return;
    
    // Check if user has already claimed today
    checkDailyClaimAvailability(user, addButton);
}

function checkDailyClaimAvailability(user, button) {
    const now = new Date();
    const todayStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
    const lastClaim = user.last_daily_claim ? new Date(user.last_daily_claim) : null;
    
    if (lastClaim && lastClaim >= todayStart) {
        // Already claimed today
        button.disabled = true;
        button.textContent = 'Claimed Today';
        button.style.background = '#9ca3af';
        button.style.borderColor = '#9ca3af';
        button.style.color = '#6b7280';
        button.style.cursor = 'not-allowed';
    } else {
        // Can claim today
        button.disabled = false;
        button.textContent = 'Claim Daily Credits';
        button.style.background = 'white';
        button.style.borderColor = '#d1d5db';
        button.style.color = '#374151';
        button.style.cursor = 'pointer';
        
        // Remove existing listeners and add new one
        button.replaceWith(button.cloneNode(true));
        const newButton = document.getElementById('claim-daily-credits');
        newButton.addEventListener('click', () => handleAddCredits(user));
    }
}

async function handleAddCredits(user) {
    try {
        showStatus('loading', 'Adding credits...');
        
        const response = await fetch(`${API_BASE_URL}/add-credits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ user: user })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showStatus('success', `Added 5 credits!`);
            updateCreditsDisplay(data.new_total);
            
            // Update cached user data with claim timestamp
            const updatedUser = { 
                ...user, 
                credits: data.new_total,
                last_daily_claim: new Date().toISOString()
            };
            chrome.storage.local.set({ user: updatedUser });
            
            // Update button state to show it's been claimed
            const button = document.getElementById('claim-daily-credits');
            if (button) {
                checkDailyClaimAvailability(updatedUser, button);
            }
        } else {
            if (data.already_claimed) {
                showStatus('error', 'Already claimed today. Try again tomorrow!');
            } else {
                showStatus('error', data.error || 'Failed to add credits');
            }
        }
    } catch (error) {
        showStatus('error', 'Failed to add credits');
    }
}

function setupStripeMonitoring() {
    // Listen for messages from Stripe checkout success/cancel pages
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'stripe_payment_success') {
            // Refresh credits with retry logic after successful payment
            let retryCount = 0;
            const maxRetries = 5;
            
            const refreshWithRetry = () => {
                setTimeout(() => {
                    loadUserCredits();
                    retryCount++;
                    
                    if (retryCount < maxRetries) {
                        refreshWithRetry();
                    } else {
                        showStatus('success', 'Payment processed! Your credits have been updated.');
                    }
                }, retryCount * 2000); // 2s, 4s, 6s, 8s, 10s delays
            };
            
            refreshWithRetry();
        }
    });
    
    // Also periodically refresh credits while popup is open
    // This helps catch credit updates from successful payments
    setInterval(() => {
        loadUserCredits();
    }, 30000); // Refresh every 30 seconds
}

async function loadUserCredits() {
    try {
        chrome.storage.local.get(['user'], async (result) => {
            if (result.user && result.user.email) {
                try {
                    const creditsResponse = await fetch(`${API_BASE_URL}/get-credits`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({ user: result.user })
                    });
                    
                    if (creditsResponse.ok) {
                        const data = await creditsResponse.json();
                        updateCreditsDisplay(data.credits);
                        
                        const updatedUser = { ...result.user, credits: data.credits };
                        chrome.storage.local.set({ user: updatedUser });
                    }
                } catch (error) {
                    console.error('Credits fetch error:', error);
                }
            }
        });
    } catch (error) {
        console.error('Load credits error:', error);
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
    
    if (authSection) authSection.style.display = 'block';
    if (mainSection) mainSection.style.display = 'none';
}

async function handleLogin() {
    try {
        const authUrl = `${API_BASE_URL}/auth/login`;
        const popup = window.open(authUrl, 'oauth', 'width=500,height=600,scrollbars=yes,resizable=yes');
        
        // Multiple methods to detect authentication success
        
        // Method 1: PostMessage listener  
        const messageListener = (event) => {
            if (event.data && event.data.type === 'auth_success' && event.data.user) {
                processAuthSuccess(event.data.user);
            }
        };
        window.addEventListener('message', messageListener);
        
        // Method 2: Check Chrome storage periodically
        const checkInterval = setInterval(() => {
            chrome.storage.local.get(['user'], (result) => {
                if (result.user && result.user.authenticated) {
                    processAuthSuccess(result.user);
                }
            });
        }, 1000);
        
        // Method 3: Check localStorage for auth success
        const checkLocalStorage = setInterval(() => {
            try {
                const authData = localStorage.getItem('cordial_auth_success');
                const authTimestamp = localStorage.getItem('cordial_auth_timestamp');
                
                if (authData && authTimestamp) {
                    const now = Date.now();
                    const timestamp = parseInt(authTimestamp);
                    
                    if (now - timestamp < 30000) { // Within 30 seconds
                        const userInfo = JSON.parse(JSON.parse(authData));
                        localStorage.removeItem('cordial_auth_success');
                        localStorage.removeItem('cordial_auth_timestamp');
                        processAuthSuccess(userInfo);
                    }
                }
            } catch (e) {
                // Ignore localStorage errors
            }
        }, 500);
        
        function processAuthSuccess(userInfo) {
            clearInterval(checkInterval);
            clearInterval(checkLocalStorage);
            window.removeEventListener('message', messageListener);
            
            if (popup && !popup.closed) {
                popup.close();
            }
            
            // Store user data
            const user = { ...userInfo, authenticated: true };
            chrome.storage.local.set({ user: user }, () => {
                if (chrome.runtime.lastError) {
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
                clearInterval(checkInterval);
                clearInterval(checkLocalStorage);
                window.removeEventListener('message', messageListener);
            }
        }, 1000);
        
        // Clean up after 60 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            clearInterval(checkLocalStorage);
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
        }, 60000);
        
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
        showUnauthenticatedState();
    }
}

