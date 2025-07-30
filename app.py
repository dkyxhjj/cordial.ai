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
import stripe
import hmac
import hashlib

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
OPENAI_MODEL = "gpt-4.1-mini"

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

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
            # If no tokens in query params, handle URL fragments directly
            return """
            <!DOCTYPE html>
            <html>
            <head><title>Processing Authentication...</title></head>
            <body>
                <script>
                    // Extract tokens from URL fragments
                    const urlParams = new URLSearchParams(window.location.hash.substring(1));
                    const accessToken = urlParams.get('access_token');
                    const refreshToken = urlParams.get('refresh_token');
                    const error = urlParams.get('error');

                    if (error) {
                        console.error('Authentication error:', error);
                        alert('Authentication failed. Please try again.');
                        window.close();
                    } else if (accessToken) {
                        // Redirect to callback with tokens as query parameters
                        const callbackUrl = new URL(window.location.href);
                        callbackUrl.search = `?access_token=${accessToken}&refresh_token=${refreshToken || ''}`;
                        callbackUrl.hash = '';
                        window.location.href = callbackUrl.toString();
                    } else {
                        alert('Authentication failed. No tokens received.');
                        window.close();
                    }
                </script>
                <div style="text-align: center; padding: 50px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <p>Processing authentication...</p>
                </div>
            </body>
            </html>
            """
        
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
            
            # Store user data and redirect to a special extension URL
            safe_user_info = {
                'email': email,
                'name': name,
                'picture': picture,
                'authenticated': True
            }
            
            # Create a simple HTML page that stores data and closes
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head><title>Authentication Complete</title></head>
            <body>
                <script>
                    try {{
                        // Store auth data in localStorage
                        localStorage.setItem('cordial_auth_success', {json.dumps(json.dumps(safe_user_info))});
                        localStorage.setItem('cordial_auth_timestamp', '{int(datetime.now().timestamp() * 1000)}');
                        
                        // Try to communicate with extension if possible
                        if (window.opener && !window.opener.closed) {{
                            window.opener.postMessage({{
                                type: 'auth_success', 
                                user: {json.dumps(safe_user_info)}
                            }}, '*');
                        }}
                        
                        // Close window after short delay
                        setTimeout(() => window.close(), 500);
                    }} catch(e) {{
                        console.error('Auth completion error:', e);
                        window.close();
                    }}
                </script>
                <div style="text-align: center; padding: 50px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <h2>✅ Authentication Successful</h2>
                    <p>This window will close automatically...</p>
                </div>
            </body>
            </html>
            """
            
            return html_content
            
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

@app.route('/claim-daily-credits', methods=['POST'])
def claim_daily_credits():
    print("=== CLAIM DAILY CREDITS DEBUG ===")
    data = request.json
    print(f"Request data: {data}")
    
    user = data.get('user')
    print(f"User data: {user}")
    
    if not user or not user.get('email'):
        print("ERROR: User data required")
        return jsonify({'error': 'User data required'}), 400
    
    email = user.get('email')
    print(f"User email: {email}")
    
    try:
        # Get current user data
        print("Fetching user from database...")
        response = supabase.table('users').select('*').eq('email', email).execute()
        print(f"Database response: {response.data}")
        
        if not response.data or len(response.data) == 0:
            print("ERROR: User not found in database")
            return jsonify({'error': 'User not found'}), 404
        
        user_data = response.data[0]
        current_credits = user_data.get('credits', 0)
        last_daily_claim = user_data.get('last_daily_claim')
        
        print(f"Current credits: {current_credits}")
        print(f"Last daily claim: {last_daily_claim}")
        
        # Check if user has already claimed today (UTC)
        now = datetime.now(timezone.utc)
        today = now.replace(hour=12, minute=0, second=0, microsecond=0)  # Reset at 12 UTC
        
        print(f"Current time: {now}")
        print(f"Today reset time: {today}")
        
        if last_daily_claim:
            last_claim_date = datetime.fromisoformat(last_daily_claim.replace('Z', '+00:00'))
            print(f"Last claim date: {last_claim_date}")
            # Check if last claim was today (after 12 UTC)
            if last_claim_date >= today:
                print("ERROR: Already claimed today")
                return jsonify({'error': 'Daily credits already claimed today. Try again tomorrow!'}), 400
        
        # Add 3 daily credits
        new_credits = current_credits + 3
        print(f"New credits total: {new_credits}")
        
        # Update user in database
        print("Updating user in database...")
        update_response = supabase.table('users').update({
            'credits': new_credits,
            'last_daily_claim': now.isoformat()
        }).eq('email', email).execute()
        
        print(f"Update response: {update_response.data}")
        
        print("SUCCESS: Daily credits claimed!")
        return jsonify({
            'success': True,
            'credits_added': 3,
            'new_total': new_credits,
            'message': 'Daily credits claimed successfully!'
        })
        
    except Exception as e:
        print(f"EXCEPTION in daily credits: {e}")
        print(f"Exception type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Failed to claim daily credits: {str(e)}'}), 500

@app.route('/stripe-webhook', methods=['POST'])
def stripe_webhook():
    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')
    
    try:
        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        print(f"Invalid payload: {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Invalid signature: {e}")
        return jsonify({'error': 'Invalid signature'}), 400
    
    # Handle the event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        
        # Get customer email and metadata
        customer_email = session.get('customer_details', {}).get('email')
        metadata = session.get('metadata', {})
        credits_to_add = int(metadata.get('credits', 0))
        
        if customer_email and credits_to_add > 0:
            try:
                # Find user and add credits
                response = supabase.table('users').select('*').eq('email', customer_email).execute()
                
                if response.data and len(response.data) > 0:
                    user_data = response.data[0]
                    current_credits = user_data.get('credits', 0)
                    new_credits = current_credits + credits_to_add
                    
                    # Update user credits
                    supabase.table('users').update({
                        'credits': new_credits
                    }).eq('email', customer_email).execute()
                    
                    print(f"Added {credits_to_add} credits to {customer_email}. New total: {new_credits}")
                else:
                    print(f"User not found: {customer_email}")
                    
            except Exception as e:
                print(f"Error processing payment for {customer_email}: {e}")
    
    return jsonify({'status': 'success'})

@app.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    try:
        data = request.json
        email = data.get('email')
        credits = data.get('credits', 10)
        
        if not email:
            return jsonify({'error': 'Email required'}), 400
        
        # Create Stripe checkout session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f'{credits} Cordial AI Credits',
                        'description': f'Credits for Cordial AI email writing assistant',
                    },
                    'unit_amount': credits * 100,  # $1 per credit in cents
                },
                'quantity': 1,
            }],
            metadata={
                'credits': str(credits),
                'email': email
            },
            customer_email=email,
            mode='payment',
            success_url='https://cordial-ai.onrender.com/payment-success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url='https://cordial-ai.onrender.com/payment-cancelled',
        )
        
        return jsonify({'checkout_url': checkout_session.url})
        
    except Exception as e:
        print(f"Checkout session error: {e}")
        return jsonify({'error': 'Failed to create checkout session'}), 500

@app.route('/payment-success')
def payment_success():
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Payment Successful</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px;">
        <h1>🎉 Payment Successful!</h1>
        <p>Your credits have been added to your account.</p>
        <p>You can close this window and return to the extension.</p>
    </body>
    </html>
    """

@app.route('/payment-cancelled')  
def payment_cancelled():
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Payment Cancelled</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px;">
        <h1>Payment Cancelled</h1>
        <p>Your payment was cancelled. No charges were made.</p>
        <p>You can close this window and try again if needed.</p>
    </body>
    </html>
    """


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
    # Check authentication from session first
    user = session.get('user')
    
    # If no session user, check if user info is provided in request
    data = request.json
    if not user or not user.get('authenticated'):
        provided_user = data.get('user')
        if provided_user and provided_user.get('email'):
            user = provided_user
        else:
             return jsonify({'error': 'Authentication required', 'auth_required': True}), 401
    
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
    

    # Check user credits in Supabase
    email = user.get('email')
    credits = 0
    if email:
        response = supabase.table('users').select('credits').eq('email', email).execute()
        if response.data and len(response.data) > 0:
            credits = response.data[0].get('credits', 0)
            if credits <= 0:
                return jsonify({'error': 'Insufficient credits. Please contact support.'}), 402
    
    email_reply = generate_email_reply(client, user_message, tone)
    
    # Deduct credit on successful generation
    if email and email_reply and not email_reply.startswith('Error:'):
        supabase.table('users').update({
            'credits': credits - 1
        }).eq('email', email).execute()
    
    # Return remaining credits in response
    return jsonify({
        'response': email_reply,
        'credits_remaining': credits - 1
    })


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 4999))
    app.run(host="0.0.0.0", port=port, debug=True)
