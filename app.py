import os
from openai import OpenAI
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template

load_dotenv('.env.local')
api_key = os.getenv('OPENAI_API_KEY') 
client = OpenAI(api_key=api_key)


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
        "concise": "Be brief and to the point while addressing all key points."
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
            model="gpt-4.1",  
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error: {e}"


app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/generate-reply', methods=['POST'])
def generate_reply():
    data = request.json
    user_message = data.get('message')
    tone = data.get('tone', 'professional')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    email_reply = generate_email_reply(client, user_message, tone)
    return jsonify({'response': email_reply})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
