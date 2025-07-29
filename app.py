import os
import json
import requests
from datetime import datetime, timezone
from openai import OpenAI
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from flask_session import Session
from supabase import create_client, Client

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
OPENAI_MODEL = "gpt-4.1-mini"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
api_key = os.getenv('OPENAI_API_KEY') 
client = OpenAI(api_key=api_key)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
app.config['SESSION_COOKIE_SECURE'] = True  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PREFERRED_URL_SCHEME'] = 'https'
Session(app)
# Configure CORS with specific origins for security
CORS(app, 
     origins=[
         "chrome-extension://*",  # Allow Chrome extensions
         "https://mail.google.com",  # Gmail domain
         "https://cordial-ai.onrender.com",  # Your production domain
         "http://localhost:5000",  # Local development
         "http://127.0.0.1:5000"   # Local development
     ],
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'OPTIONS'])
# Supabase handles OAuth configuration through its dashboard

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
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Log detailed error server-side, return generic message to user
        print(f"OpenAI API error: {e}")
        return "Error: Unable to generate email response. Please try again."



# Supabase Auth routes
@app.route('/auth/login')
def login():
    # Redirect to Supabase Auth with Google provider
    # Dynamically construct redirect URI based on current request
    # Use production URL for redirect_uri to ensure consistency
    redirect_uri = 'https://cordial-ai.onrender.com/auth/callback'
    auth_url = f"{SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to={redirect_uri}"
    return redirect(auth_url)

@app.route('/auth/callback')
def auth_callback():
    try:
        # Get access token and refresh token from URL fragments (handled by frontend)
        # For server-side callback, we'll get the tokens from the query params
        access_token = request.args.get('access_token')
        refresh_token = request.args.get('refresh_token')
        
        if not access_token:
            # If no tokens in query params, render a page that will handle the URL fragments
            return render_template('auth_callback.html')
        
        # Set the session with Supabase Auth
        try:
            # Use Supabase client to get user info with the access token
            print(f"Step 1: Setting session with tokens")
            session_response = supabase.auth.set_session(access_token, refresh_token)
            print(f"Step 2: Session set, getting user")
            user = supabase.auth.get_user()
            print(f"Step 3: Got user response")
            
            if not user or not user.user:
                print("Step 4: No user data found")
                return jsonify({'error': 'Failed to get user information'}), 400
            
            print("Step 5: User data found, processing...")
            
            user_data = user.user
            email = user_data.email
            name = user_data.user_metadata.get('full_name', '')
            picture = user_data.user_metadata.get('avatar_url', '')
            
            # Check if user exists in custom users table
            response = supabase.table('users').select('*').eq('email', email).execute()

            if response.data and len(response.data) > 0:
                # Update last_login
                supabase.table('users').update({
                    'last_login': datetime.now(timezone.utc).isoformat()
                }).eq('email', email).execute()
            else:
                # Create new user with 15 credits
                supabase.table('users').insert({
                    'email': email,
                    'name': name,
                    'picture': picture,
                    'credits': 15,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'last_login': datetime.now(timezone.utc).isoformat()
                }).execute()
                
            # Store user in session
            session['user'] = {
                'email': email,
                'name': name,
                'picture': picture,
                'authenticated': True,
                'access_token': access_token,
                'refresh_token': refresh_token
            }
            
            # For Chrome extension, return a success page that can communicate back
            safe_user_info = {
                'email': email,
                'name': name,
                'picture': picture,
                'authenticated': True
            }
            return render_template('auth_success.html', user_info=safe_user_info)
            
        except Exception as e:
            print(f"Supabase auth error: {e}")
            print(f"Error type: {type(e)}")
            return jsonify({'error': f'Failed to authenticate with Supabase: {str(e)}'}), 500
            
    except Exception as e:
        print(f"Auth callback error: {e}")
        return jsonify({'error': 'Authentication failed'}), 400

@app.route('/auth/logout')
def logout():
    try:
        # Sign out from Supabase Auth
        supabase.auth.sign_out()
        session.pop('user', None)
        return jsonify({'message': 'Logged out successfully'})
    except Exception as e:
        print(f"Logout error: {e}")
        session.pop('user', None)  # Clear session even if Supabase logout fails
        return jsonify({'message': 'Logged out successfully'})

@app.route('/auth/user')
def get_user():
    user = session.get('user')
    if user and user.get('authenticated'):
        try:
            # Refresh the Supabase session if we have tokens
            access_token = user.get('access_token')
            refresh_token = user.get('refresh_token')
            
            if access_token and refresh_token:
                supabase.auth.set_session(access_token, refresh_token)
                
            # Get credits from Supabase
            email = user.get('email')
            if email:
                response = supabase.table('users').select('credits').eq('email', email).execute()
                if response.data and len(response.data) > 0:
                    user['credits'] = response.data[0].get('credits', 0)
            return jsonify(user)
        except Exception as e:
            print(f"Get user error: {e}")
            # Return user info even if token refresh fails
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


@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/waitlist', methods=['POST'])
def add_to_waitlist():
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        email = data.get('email', '').strip()
        
        # Validate email
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        # Basic email validation
        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Insert into Supabase via server-side (secure)
        result = supabase.table('waitlist').insert({
            'email': email,
            'created_at': datetime.now(timezone.utc).isoformat()
        }).execute()
        
        if result.data:
            return jsonify({'success': True, 'message': 'Added to waitlist successfully'})
        else:
            return jsonify({'error': 'Failed to add to waitlist'}), 500
            
    except Exception as e:
        # Check for duplicate email error
        if 'duplicate key value' in str(e) or '23505' in str(e):
            return jsonify({'error': 'Email already on waitlist'}), 409
        
        return jsonify({'error': 'Server error occurred'}), 500


@app.route('/generate-reply', methods=['POST'])
def generate_reply():
    # COMMENTED OUT FOR DEVELOPMENT - NO AUTH OR CREDIT RESTRICTIONS
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
    
    # Input validation
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    if not isinstance(user_message, str):
        return jsonify({'error': 'Message must be a string'}), 400
    
    user_message = user_message.strip()
    if len(user_message) < 3:
        return jsonify({'error': 'Message too short. Please provide at least 3 characters.'}), 400
    
    if len(user_message) > 5000:
        return jsonify({'error': 'Message too long. Please keep it under 5000 characters.'}), 400
    
    # Validate tone parameter
    valid_tones = ['professional', 'friendly', 'formal', 'concise']
    if tone not in valid_tones:
        tone = 'professional'  # Default to professional if invalid tone provided
    
    # COMMENTED OUT FOR DEVELOPMENT - NO CREDIT RESTRICTIONS
    # # Check user credits in Supabase
    # email = user.get('email')
    # credits = 0
    # if email:
    #     response = supabase.table('users').select('credits').eq('email', email).execute()
    #     if response.data and len(response.data) > 0:
    #         credits = response.data[0].get('credits', 0)
    #         if credits <= 0:
    #             return jsonify({'error': 'Insufficient credits. Please contact support.'}), 402
    #     else:
    #         return jsonify({'error': 'User not found in database'}), 404
    
    email_reply = generate_email_reply(client, user_message, tone)
    
    # COMMENTED OUT FOR DEVELOPMENT - NO CREDIT DEDUCTION
    # # Deduct credit on successful generation
    # if email and email_reply and not email_reply.startswith('Error:'):
    #     supabase.table('users').update({
    #         'credits': credits - 1
    #     }).eq('email', email).execute()
    #     
    #     # Return remaining credits in response
    #     return jsonify({
    #         'response': email_reply,
    #         'credits_remaining': credits - 1
    #     })
    
    return jsonify({'response': email_reply})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 4999))
    app.run(host="0.0.0.0", port=port, debug=True)
