# Smart Email Rewriter Chrome Extension

A Chrome extension that integrates with your Flask email generator to rewrite emails directly in Gmail.

## Features

- **Multiple Tone Options**: Professional, Friendly, Formal, Concise, and Very Concise
- **Floating Action Button**: Easy access with a floating button in Gmail
- **Keyboard Shortcut**: Quick rewrite with `Ctrl+Shift+R`
- **Popup Interface**: Choose specific tones from the extension popup
- **Real-time Integration**: Works seamlessly with Gmail's compose window

## Installation

1. **Prepare the Flask Backend**:
   - Make sure your Flask app is running with CORS enabled
   - Update the `API_BASE_URL` in `content.js` and `popup.js` if deploying to a different URL

2. **Add Icons** (Optional):
   - Add `icon16.png`, `icon48.png`, and `icon128.png` to the extension folder
   - Or remove the icon references from `manifest.json`

3. **Load the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the `gpt-email-extension` folder
   - The extension should now appear in your extensions list

## Usage

### Method 1: Floating Action Button
1. Go to Gmail and compose a new email
2. Write your draft email content
3. Click the floating ✨ button in the bottom right
4. Your email will be rewritten with a professional tone

### Method 2: Keyboard Shortcut
1. Write your email content in Gmail
2. Press `Ctrl+Shift+R`
3. Your email will be rewritten instantly

### Method 3: Extension Popup
1. Write your email content in Gmail
2. Click the extension icon in the Chrome toolbar
3. Choose your preferred tone (Professional, Friendly, Formal, Concise, Very Concise)
4. Your email will be rewritten with the selected tone

## Configuration

### Changing the API URL
If you deploy your Flask app to a different URL (like Render, Heroku, etc.), update these files:

**content.js** (line 6):
```javascript
const API_BASE_URL = 'https://your-app-url.com';
```

**popup.js** (line 44):
```javascript
const API_BASE_URL = 'https://your-app-url.com';
```

### Customizing Tones
The extension uses the same tone options as your Flask backend:
- `professional`: Balanced professional tone
- `friendly`: Warm, conversational tone
- `formal`: Highly formal business communications
- `concise`: Brief and to the point
- `very_concise`: Extremely brief with bullet points

## Troubleshooting

### Extension Not Working
1. Make sure you're on `mail.google.com`
2. Check that your Flask backend is running
3. Verify CORS is enabled in your Flask app
4. Check the browser console for any error messages

### Email Not Being Rewritten
1. Make sure you have content in the email compose area
2. Click in the email text area first to ensure it's selected
3. Try refreshing Gmail and trying again

### API Connection Issues
1. Verify your Flask app is accessible at the configured URL
2. Check that CORS is properly configured
3. Ensure your OpenAI API key is valid

## Development

### File Structure
```
gpt-email-extension/
├── manifest.json          # Extension configuration
├── content.js            # Gmail integration script
├── popup.html           # Extension popup interface
├── popup.js             # Popup functionality
└── README.md           # This file
```

### Permissions
The extension requires:
- `scripting`: To inject scripts into Gmail
- `activeTab`: To access the current tab
- `<all_urls>`: To make API requests to your Flask backend

## Security Notes

- The extension communicates with your Flask backend via HTTP/HTTPS
- Make sure to use HTTPS in production
- Consider implementing API authentication for production use
- The extension only runs on Gmail pages for security
