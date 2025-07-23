import os
from openai import OpenAI
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template

load_dotenv('.env.local')
api_key = os.getenv('OPENAI_API_KEY')
client = OpenAI(api_key=api_key)


def get_openai_response(client, user_message, mode="default"):
    prompts = {
        "default": (
            "You are a humanizer tool. Given a sentence, generate 3 to 5 alternative ways to phrase it, "
            "making them sound natural and human. Only output the alternatives as a numbered list, no explanations. "
            "At the end, always read it again, and hopefully it make logical sense and it was written by a human"
            f"Sentence: {user_message}"
        ),
        "empathy": (
            "Rewrite the following message in a warm, understanding tone. Acknowledge any emotions the reader might feel "
            "(e.g., frustration, confusion, concern), and reassure them that they're being heard and supported. "
            "Aim to show that a real person is behind the message. Generate 3 to 5 alternatives as a numbered list, no explanations. "
            "Reword the following message with compassion. Speak as if you're addressing someone going through something difficult. "
            "Offer kindness, honesty, and clarity — without sounding robotic or overly formal. Avoid sugarcoating but be deeply respectful. "
             "At the end, always read it again, and hopefully it make logical sense and it was written by a human"
            f"Message: {user_message}"
        ),
        "professional": (
            "Rephrase the message to sound constructive, supportive, and professional. Keep the original meaning but shift the tone "
            "to encourage growth, collaboration, or continued effort. Assume the reader is trying their best and deserves dignity. "
            "Generate 3 to 5 alternatives as a numbered list, no explanations. "
             "At the end, always read it again, and hopefully it make logical sense and it was written by a human"
            f"Message: {user_message}"
        ),
        "storytelling": (
            "Turn this factual explanation into a short, relatable story that even a 12-year-old could enjoy. "
            "Use metaphor, analogy, or a mini-narrative to explain the concept in a fun and memorable way. "
            "Generate 3 to 5 alternatives as a numbered list, no explanations. "
             "At the end, always read it again, and hopefully it make logical sense and it was written by a human"
            f"Message: {user_message}"
        ),
    }
    
    prompt = prompts.get(mode, prompts["default"])
    
    try:
        response = client.chat.completions.create(
            model="gpt-4.1",  
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error: {e}"


app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chatbot():
    data = request.json
    user_message = data.get('message')
    mode = data.get('mode', 'default')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    bot_response = get_openai_response(client, user_message, mode)
    return jsonify({'response': bot_response})


if __name__ == '__main__':
    app.run(debug=True)
