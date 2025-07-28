# ✨ Smart Email Rewriter — “Say it better, instantly.”

Write and rewrite emails in seconds with one click. Whether you're replying to professors, applying to jobs, or responding to difficult conversations, this Chrome extension drafts polished messages effortlessly.

---

## 🔧 Features

- 🔁 Rewrites any email with one click or `Ctrl+Shift+R`
- 🧠 AI-powered drafting based on tone and context
- 💬 Supports professional, friendly, formal, or concise tone
- 🔒 Google OAuth login
- 📦 Free credit system for users (10 free credits on sign-up)
- 💾 Supabase-powered user tracking

---

## 🛠️ Setting Up Environment Variables

To run this project, you need to create a `.env` file in the root directory and populate it with your credentials.

### 📄 Example: `.env.example`

Create a file called `.env` in the root of your project and copy the following content into it:

OPENAI_API_KEY=xxxxxx
GOOGLE_CLIENT_ID=xxxxxx
GOOGLE_CLIENT_SECRET=xxxxxx
SECRET_KEY=xxxxxx
SUPABASE_URL=xxxxxx
SUPABASE_KEY=xxxxxx


> ⚠️ **Replace each `xxxxxx` with your actual credentials**:
> - Get your **OpenAI API key** from [OpenAI Dashboard](https://platform.openai.com/account/api-keys)
> - Set up **Google OAuth credentials** at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
> - Get your **Supabase URL and anon key** from [Supabase Project Settings](https://app.supabase.com)
