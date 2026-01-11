# Google OAuth Setup for AMG Music Platform

This guide walks through setting up Google OAuth for Supabase Auth in the AMG Music Platform.

---

## Overview

AMG uses Supabase Auth with Google as an OAuth provider for user authentication. This allows users to sign in with their Google accounts, providing a seamless and secure authentication experience.

**Required Scopes:**
- `email` - Access the user's email address
- `profile` - Access basic profile information (name, avatar)

---

## Prerequisites

- A Google account with access to [Google Cloud Console](https://console.cloud.google.com)
- A Supabase project (local or hosted)
- Access to the AMG platform environment variables

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown in the top navigation bar
3. Click **New Project**
4. Enter project details:
   - **Project name:** `AMG Music Platform` (or your preferred name)
   - **Organization:** Select your organization (if applicable)
   - **Location:** Choose your folder (if applicable)
5. Click **Create**
6. Wait for the project to be created, then select it from the project dropdown

---

## Step 2: Configure OAuth Consent Screen

1. In the Google Cloud Console, navigate to **APIs & Services** > **OAuth consent screen**
2. Select **User Type**:
   - **Internal** - Only users within your Google Workspace organization (for testing/internal use)
   - **External** - Any user with a Google account (for production)
3. Click **Create**

### Fill in the Consent Screen Details

**App Information:**
| Field | Value |
|-------|-------|
| App name | `AMG Music Platform` |
| User support email | Your support email address |
| App logo | (Optional) Upload your app logo |

**App Domain:**
| Field | Value |
|-------|-------|
| Application home page | `https://your-domain.com` |
| Application privacy policy link | `https://your-domain.com/privacy` |
| Application terms of service link | `https://your-domain.com/terms` |

**Authorized domains:**
- Add your production domain (e.g., `your-domain.com`)
- For local development, you don't need to add `localhost`

**Developer contact information:**
- Add your developer email address(es)

4. Click **Save and Continue**

### Configure Scopes

1. Click **Add or Remove Scopes**
2. Select the following scopes:
   - `.../auth/userinfo.email` - See your primary Google Account email address
   - `.../auth/userinfo.profile` - See your personal info, including any personal info you've made publicly available
   - `openid` - Associate you with your personal info on Google
3. Click **Update**
4. Click **Save and Continue**

### Test Users (External apps only)

If you selected **External** user type and the app is in testing mode:
1. Click **Add Users**
2. Add email addresses of users who can test the app
3. Click **Save and Continue**

### Review and Publish

1. Review all settings
2. Click **Back to Dashboard**
3. For production, click **Publish App** to move from testing to production status

---

## Step 3: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** > **Credentials**
2. Click **+ Create Credentials** > **OAuth client ID**
3. Configure the OAuth client:

| Field | Value |
|-------|-------|
| Application type | `Web application` |
| Name | `AMG Music Platform - Supabase Auth` |

### Authorized JavaScript Origins

Add the following origins based on your environment:

**Local Development:**
```
http://localhost:3000
http://localhost:54321
```

**Production:**
```
https://your-domain.com
https://your-project-id.supabase.co
```

### Authorized Redirect URIs

This is the most critical configuration. Supabase Auth requires specific callback URLs.

**Local Development (Supabase CLI):**
```
http://localhost:54321/auth/v1/callback
```

**Hosted Supabase Project:**
```
https://your-project-id.supabase.co/auth/v1/callback
```

**Production with Custom Domain (if configured):**
```
https://auth.your-domain.com/auth/v1/callback
```

4. Click **Create**
5. A dialog will display your credentials:
   - **Client ID:** Copy this value
   - **Client Secret:** Copy this value (keep this secure!)

6. Click **OK**

> ⚠️ **Security Note:** Never commit your Client Secret to version control. Use environment variables.

---

## Step 4: Configure Supabase Auth

### Option A: Local Development (Supabase CLI)

The Google OAuth provider is already configured in `supabase/config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
redirect_uri = "http://localhost:54321/auth/v1/callback"
```

Set the environment variables before running Supabase:

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
supabase start
```

Or add them to your `.env` file and use a tool like `dotenv-cli`:

```bash
dotenv -- supabase start
```

### Option B: Hosted Supabase Project

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** > **Providers**
3. Find **Google** in the list and click to expand
4. Toggle **Enable Sign in with Google**
5. Enter your credentials:
   - **Client ID:** Your Google OAuth Client ID
   - **Client Secret:** Your Google OAuth Client Secret
6. Click **Save**

---

## Step 5: Implement Sign-In in Your App

### Using Supabase JS Client

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// Sign in with Google
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'email profile',
    },
  })

  if (error) {
    console.error('Error signing in with Google:', error.message)
    return
  }

  // User will be redirected to Google for authentication
}

// Handle the callback in your /auth/callback route
async function handleAuthCallback() {
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error) {
    console.error('Error getting session:', error.message)
    return
  }

  if (session) {
    // User is authenticated
    console.log('User signed in:', session.user.email)
  }
}
```

### Auth Callback Route (React Example)

Create a callback route at `/auth/callback`:

```typescript
// src/pages/auth/callback.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard')
      }
    })
  }, [navigate])

  return <div>Signing you in...</div>
}
```

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Cause:** The redirect URI in your request doesn't match the authorized redirect URIs in Google Cloud Console.

**Solution:**
1. Check the exact redirect URI in the error message
2. Add it to your OAuth client's **Authorized redirect URIs** in Google Cloud Console
3. Ensure there are no trailing slashes or protocol mismatches (http vs https)

### Error: "access_denied"

**Cause:** The user denied access or the app is in testing mode and the user isn't a test user.

**Solution:**
1. If in testing mode, add the user's email to the test users list
2. Or publish the app to production status

### Error: "invalid_client"

**Cause:** The Client ID or Client Secret is incorrect.

**Solution:**
1. Verify the credentials in your environment variables
2. Check for extra whitespace or incorrect copy/paste
3. Regenerate the credentials if needed

### Supabase Local: Google Auth Not Working

**Cause:** Environment variables not properly passed to Supabase CLI.

**Solution:**
1. Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are exported before running `supabase start`
2. Restart Supabase after changing environment variables: `supabase stop && supabase start`

---

## Security Best Practices

1. **Never expose Client Secret** - Use environment variables, not hardcoded values
2. **Restrict authorized domains** - Only add domains you control
3. **Use HTTPS in production** - Google requires HTTPS for redirect URIs (except localhost)
4. **Rotate credentials periodically** - Regenerate OAuth credentials on a schedule
5. **Monitor usage** - Check Google Cloud Console for unusual activity
6. **Limit scopes** - Only request the scopes your app actually needs

---

## Related Documentation

- [Supabase Auth with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com)
- [Supabase CLI Configuration](https://supabase.com/docs/guides/cli/config)

---

## Checklist

- [ ] Created Google Cloud project
- [ ] Configured OAuth consent screen with required scopes
- [ ] Created OAuth 2.0 credentials (Web application)
- [ ] Added authorized redirect URIs for all environments
- [ ] Set environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- [ ] Verified Supabase config.toml has Google provider enabled
- [ ] Tested sign-in flow locally
- [ ] Published OAuth app for production (when ready)
