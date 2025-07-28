## 🛠️ Setting Up Environment Variables

To run this project, you need to create a `.env` file in the root directory and populate it with your credentials.

### 📄 Example: `.env.example`

Create a file called `.env` in the root of your project and copy the following content into it:

<pre>

OPENAI_API_KEY=xxxxxx
GOOGLE_CLIENT_ID=xxxxxx
GOOGLE_CLIENT_SECRET=xxxxxx
SECRET_KEY=xxxxxx
SUPABASE_URL=xxxxxx
SUPABASE_KEY=xxxxxx

</pre>

> ⚠️ **Replace each `xxxxxx` with your actual credentials**:
> - Get your **OpenAI API key** from [OpenAI Dashboard](https://platform.openai.com/account/api-keys)
> - Set up **Google OAuth credentials** at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
> - Get your **Supabase URL and anon key** from [Supabase Project Settings](https://app.supabase.com)

Once the file is created and filled in, your environment will be ready to run the extension locally.
