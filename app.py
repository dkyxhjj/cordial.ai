import os
import json
import requests
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth
from authlib.common.security import generate_token
from flask_session import Session
from supabase import create_client, Client

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
api_key = os.getenv('OPENAI_API_KEY') 
client = OpenAI(api_key=api_key)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)
CORS(app, supports_credentials=True)  # Enable CORS for Chrome extension with credentials
client_id = os.getenv('GOOGLE_CLIENT_ID')
client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
# OAuth configuration
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=client_id,
    client_secret=client_secret,
    access_token_url='https://oauth2.googleapis.com/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v3/',
    client_kwargs={
        'scope': 'openid email profile',
        'token_endpoint_auth_method': 'client_secret_basic',
    },
    jwks_uri='https://www.googleapis.com/oauth2/v3/certs',
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration'
)

def generate_email_reply(client, user_message, tone="professional"):
    """
    Generate an email reply based on the user's input email or message.
    
    Args:
        client: OpenAI client instance
        user_message: The original email or message to reply to
        tone: The tone of the reply (professional, friendly, formal, concise)
        
    Returns:
        A formatted email reply
    """
    tone_instructions = {
        "professional": "Use a balanced professional tone with appropriate formality while being personable.",
        "friendly": "Use a warm, conversational tone while maintaining professionalism.",
        "formal": "Use a highly formal tone appropriate for official business communications.",
        "concise": "Be brief and to the point while addressing all key points.",
    }
    
    selected_tone = tone_instructions.get(tone, tone_instructions["professional"])
    
    # Check if the message contains both original email and reply intent
    reply_intent = ""
    original_email = user_message
    
    if "Original email:" in user_message and "My reply should:" in user_message:
        parts = user_message.split("\n\nMy reply should:")
        original_email = parts[0].replace("Original email:\n", "")
        reply_intent = parts[1].strip()
    
    # Create a prompt that instructs the model to generate a professional email reply
    prompt = f"""
    You are an email assistant that creates professional email replies. 
    Generate a complete, well-structured email reply to the following message using a {tone} tone.
    
    Guidelines:
    - Create a full email with greeting, body paragraphs, and closing/signature
    - Address all points, questions, or requests from the original message
    - Use appropriate email etiquette and professional language
    - Be concise but thorough
    - Do not include meta instructions or code formatting in your response
    - Format as plain text that can be directly copied into an email client
    - Do not use markdown formatting
    - Do not include "Subject:" line
    - If the input doesn't look like a email, just return please enter a valid email, some examples might include "https://cordial-ai.onrender.com/", "hello world"
    
    Original message:
    {original_email}
    """
    
    # Add reply intent if provided
    if reply_intent:
        prompt += f"""
    
    The person wants their reply to: {reply_intent}
    Make sure to incorporate these points in your response while maintaining a natural flow.
    """
    
    prompt += "\n\nReply:"
    
    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",  
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error: {e}"



# OAuth routes
@app.route('/auth/login')
def login():
    # Generate a secure state token
    state = generate_token()
    session['oauth_state'] = state
    
    # Define the redirect URI
    redirect_uri = url_for('auth_callback', _external=True)
    
    # Create the authorization URL with necessary parameters
    return google.authorize_redirect(
        redirect_uri=redirect_uri,
        state=state,
        access_type='offline',
        prompt='select_account',
        include_granted_scopes='true'
    )

@app.route('/auth/callback')
def auth_callback():
    try:
        # Verify state parameter to prevent CSRF
        state = request.args.get('state')
        if not state or state != session.get('oauth_state'):
            return jsonify({'error': 'Invalid state parameter'}), 400
        
        # Get the authorization code
        code = request.args.get('code')
        if not code:
            return jsonify({'error': 'No authorization code provided'}), 400
            
        # Exchange the authorization code for tokens
        token = google.authorize_access_token()
        if not token or 'access_token' not in token:
            return jsonify({'error': 'Failed to get access token'}), 400
        
        try:
            # Fetch user info from Google API
            resp = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {token["access_token"]}'},
                timeout=10
            )
            resp.raise_for_status()
            user_info = resp.json()
            
            if not user_info or 'email' not in user_info:
                return jsonify({'error': 'Failed to get user information'}), 400
            
            # Save user to Supabase
            email = user_info.get('email')
            name = user_info.get('name')
            picture = user_info.get('picture')

            # Check if user exists in Supabase
            response = supabase.table('users').select('*').eq('email', email).execute()

            if response.data and len(response.data) > 0:
                # Update last_login
                supabase.table('users').update({
                    'last_login': datetime.utcnow().isoformat()
                }).eq('email', email).execute()
            else:
                # Create new user with 10 credits
                supabase.table('users').insert({
                    'email': email,
                    'name': name,
                    'picture': picture,
                    'credits': 10,
                    'created_at': datetime.utcnow().isoformat(),
                    'last_login': datetime.utcnow().isoformat()
                }).execute()
                
            # Store user in session
            session['user'] = {
                'email': user_info['email'],
                'name': user_info.get('name', ''),
                'picture': user_info.get('picture', ''),
                'authenticated': True
            }
            
            # For Chrome extension, return a success page that can communicate back
            return f'''
            <html>
            <body>
                <script>
                    try {{
                        const userInfo = {json.dumps(user_info)};
                        window.opener.postMessage({{
                            type: 'auth_success',
                            user: userInfo
                        }}, '*');
                        setTimeout(() => {{
                            window.close();
                        }}, 1000);
                    }} catch (e) {{
                        document.body.innerHTML = '<p>Authentication successful! You can close this window.</p>';
                    }}
                </script>
                <p>Authentication successful! You can close this window.</p>
            </body>
            </html>
            '''
            
        except requests.exceptions.RequestException as e:
            return jsonify({'error': 'Failed to fetch user information'}), 500
            
    except Exception as e:
        return jsonify({'error': f'Authentication failed: {str(e)}'}), 400

@app.route('/auth/logout')
def logout():
    session.pop('user', None)
    return jsonify({'message': 'Logged out successfully'})

@app.route('/auth/user')
def get_user():
    user = session.get('user')
    if user and user.get('authenticated'):
        # Get credits from Supabase
        email = user.get('email')
        if email:
            response = supabase.table('users').select('credits').eq('email', email).execute()
            if response.data and len(response.data) > 0:
                user['credits'] = response.data[0].get('credits', 0)
        return jsonify(user)
    return jsonify({'authenticated': False}), 401

@app.route('/get-credits', methods=['POST'])
def get_credits():
    data = request.json
    user = data.get('user')
    
    if not user or not user.get('email'):
        return jsonify({'error': 'User data required'}), 400
    
    email = user.get('email')
    response = supabase.table('users').select('credits').eq('email', email).execute()
    
    if response.data and len(response.data) > 0:
        credits = response.data[0].get('credits', 0)
        return jsonify({'credits': credits})
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/config', methods=['GET'])
def config():
    return jsonify({
        'SUPABASE_URL': SUPABASE_URL,
        'SUPABASE_KEY': SUPABASE_KEY
    })

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/generate-reply', methods=['POST'])
def generate_reply():
    # COMMENTED OUT FOR TESTING - NO AUTH RESTRICTIONS
    # # Check authentication from session first
    # user = session.get('user')
    # 
    # # If no session user, check if user info is provided in request
    # data = request.json
    # if not user or not user.get('authenticated'):
    #     provided_user = data.get('user')
    #     if provided_user and provided_user.get('email'):
    #         user = provided_user
    #     else:
    #         return jsonify({'error': 'Authentication required', 'auth_required': True}), 401
    
    data = request.json
    user_message = data.get('message')
    tone = data.get('tone', 'professional')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    # COMMENTED OUT FOR TESTING - NO CREDIT RESTRICTIONS
    # # Check user credits in Supabase
    # email = user.get('email')
    # if email:
    #     response = supabase.table('users').select('credits').eq('email', email).execute()
    #     if response.data and len(response.data) > 0:
    #         credits = response.data[0].get('credits', 0)
    #         if credits <= 0:
    #             return jsonify({'error': 'Insufficient credits. Please contact support.'}), 402
    #     else:
    #         return jsonify({'error': 'User not found in database'}), 404
    
    email_reply = generate_email_reply(client, user_message, tone)
    
    # COMMENTED OUT FOR TESTING - NO CREDIT DEDUCTION
    # # Deduct credit on successful generation
    # if email and email_reply and not email_reply.startswith('Error:'):
    #     supabase.table('users').update({
    #         'credits': credits - 1
    #     }).eq('email', email).execute()
    
    return jsonify({'response': email_reply})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
