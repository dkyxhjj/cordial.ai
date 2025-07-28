// Secure waitlist submission via server-side proxy
async function submitToWaitlist(email) {
    try {
        const response = await fetch('/waitlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            return { success: true, message: data.message };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.error('Network error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}

// Initialize form handling when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('waitlistForm');
    const emailInput = document.getElementById('email');
    const submitBtn = document.getElementById('submitBtn');
    const messageDiv = document.getElementById('message');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        if (!email) return;
        
        // Disable form
        submitBtn.disabled = true;
        submitBtn.textContent = 'Joining...';
        messageDiv.innerHTML = '';
        
        // Submit via secure server-side proxy
        const result = await submitToWaitlist(email);
        
        if (result.success) {
            messageDiv.innerHTML = '<div class="success">Thanks! You\'re on the waitlist.</div>';
            emailInput.value = '';
        } else {
            if (result.error.includes('already on waitlist')) {
                messageDiv.innerHTML = '<div class="error">You\'re already on the waitlist!</div>';
            } else {
                messageDiv.innerHTML = `<div class="error">${result.error}</div>`;
            }
        }
        
        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Join waitlist';
    });
});