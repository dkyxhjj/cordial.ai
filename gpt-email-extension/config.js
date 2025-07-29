// Extension configuration
const CONFIG = {
    API_BASE_URL: 'https://cordial-ai.onrender.com',
    
    // Gmail selectors for finding email editor
    GMAIL_SELECTORS: [
        '[contenteditable="true"]',
        'div[role="textbox"]',
        '.Am.Al.editable',
        '.ii.gt .a3s',
        'div[aria-label*="Message Body"]'
    ],
    
    // Gmail selectors for finding email thread context
    THREAD_SELECTORS: [
        '.ii.gt',
        '.adn.ads', 
        '.h7',
        '.ii.gt .a3s',
        '[data-message-id]',
        '.nH .if',
        '.Ar.Au .h7'
    ],
    
    // Gmail selectors for finding subject line
    SUBJECT_SELECTORS: [
        '.hP',
        '.bog',
        '[name="subjectbox"]',
        '.aoT'
    ],
    
    // Available tones
    VALID_TONES: ['professional', 'friendly', 'formal', 'concise'],
    
    // Default tone
    DEFAULT_TONE: 'professional'
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}