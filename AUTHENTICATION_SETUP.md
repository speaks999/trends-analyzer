# Authentication Setup Guide

This guide explains how to set up and use Supabase authentication in the Trends Analyzer app.

## Overview

The app now uses Supabase Authentication for user management with the following features:

- ✅ Email/password authentication
- ✅ Session persistence
- ✅ Row Level Security (RLS) for data isolation
- ✅ Protected routes
- ✅ User-specific data filtering

## What Changed

### Database Changes

1. **Added `user_id` columns** to `queries` and `opportunity_clusters` tables
2. **Updated RLS policies** to filter data by authenticated user
3. **Cascading relationships** ensure related data (trend_snapshots, scores, etc.) are scoped to the user's queries

### Application Changes

1. **Auth Context** (`app/lib/auth-context.tsx`) - Manages authentication state
2. **Supabase Client** (`app/lib/supabase-client.tsx`) - Browser-side Supabase client with auth
3. **Auth Components**:
   - `AuthForm.tsx` - Login/signup form
   - `AuthGuard.tsx` - Protected route wrapper
   - `UserMenu.tsx` - User menu with sign-out
4. **Updated Layout** - Wrapped with `AuthProvider`
5. **Updated Storage** - Filters all queries by `user_id`

## Setup Instructions

### 1. Run the Authentication Migration

After running the initial schema migration, run the authentication migration:

1. Go to Supabase Dashboard → SQL Editor
2. Open `supabase/migrations/002_add_authentication.sql`
3. Copy and paste the entire file
4. Click "Run"

This will:
- Add `user_id` columns to tables
- Update RLS policies to filter by user
- Create proper indexes

### 2. Configure Email Settings (Optional)

For production, configure email settings in Supabase:

1. Go to **Authentication** → **Email Templates**
2. Customize the confirmation and password reset emails
3. Go to **Settings** → **Auth** → **Email Auth**
4. Configure your SMTP settings (or use Supabase's default)

### 3. Test the Authentication

1. Start your dev server: `npm run dev`
2. Visit http://localhost:3000
3. You'll see the login/signup form
4. Create an account (check your email for confirmation)
5. Sign in and use the app

## How It Works

### Authentication Flow

```
1. User visits app
   ↓
2. AuthGuard checks if user is authenticated
   ↓
   ├─ No → Show AuthForm (login/signup)
   └─ Yes → Show main app with UserMenu
```

### Data Isolation

All user data is automatically filtered by `user_id`:

```typescript
// When you add a query
await storage.addQuery({ text: 'example' });
// Automatically adds user_id from current session

// When you get queries
await storage.getAllQueries();
// Automatically filters WHERE user_id = auth.uid()
```

This happens at the **database level** via RLS policies, so it's secure even if someone tries to bypass the client code.

## Authentication Features

### Sign Up
- Creates new user account
- Sends confirmation email (if configured)
- Requires email confirmation before sign-in (configurable)

### Sign In
- Validates email/password
- Creates persistent session
- Session auto-refreshes

### Sign Out
- Clears session
- Redirects to login

### Session Persistence
- Sessions persist across browser restarts
- Auto-refresh tokens before expiration
- Secure httpOnly cookies (when using server-side)

## User Data Scope

Each user has their own:
- ✅ Queries
- ✅ Trend snapshots (linked to queries)
- ✅ Trend scores (linked to queries)
- ✅ Intent classifications (linked to queries)
- ✅ Opportunity clusters
- ✅ Cluster-query relationships

Users **cannot**:
- ❌ See other users' data
- ❌ Modify other users' data
- ❌ Access data without authentication

## Security Considerations

### Row Level Security (RLS)

All tables have RLS enabled with policies that enforce:

```sql
-- Example policy for queries
CREATE POLICY "Users can view their own queries" 
  ON queries FOR SELECT 
  USING (auth.uid() = user_id);
```

This means:
- Database enforces access control
- Even direct database access respects policies
- No way to bypass from client code

### API Keys

The app uses **Publishable key** (`sb_publishable_...`) which is safe for client-side use when RLS is enabled.

**Never use** the Secret key in client code.

## Customization

### Disable Email Confirmation

To allow users to sign in immediately without email confirmation:

1. Go to Supabase Dashboard → **Authentication** → **Settings**
2. Under "Email" → Disable "Enable email confirmations"

### Add Social Auth

To add Google, GitHub, etc.:

1. Go to **Authentication** → **Providers**
2. Enable the provider
3. Configure OAuth credentials
4. Update `AuthForm.tsx` to add social login buttons:

```typescript
const signInWithGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
  });
};
```

### Customize Auth UI

Edit `app/components/AuthForm.tsx` to:
- Change styling
- Add password requirements
- Add "forgot password" flow
- Customize error messages

## Troubleshooting

### "User must be authenticated" Error

**Cause**: Trying to access data without being signed in

**Fix**: Make sure `AuthGuard` wraps your components

### RLS Policy Errors

**Cause**: Missing or incorrect RLS policies

**Fix**: 
1. Run the authentication migration again
2. Check policies in Supabase Dashboard → **Authentication** → **Policies**
3. Test policies with SQL Editor: `SELECT auth.uid()`

### Email Confirmation Not Working

**Cause**: Email settings not configured

**Fix**:
1. Check **Authentication** → **Email Templates**
2. Verify SMTP settings
3. Check spam folder
4. For development, disable email confirmation

### Data Not Showing After Migration

**Cause**: Existing data has NULL user_id

**Fix**: If you had test data before adding auth:

```sql
-- Assign orphaned data to your user (replace with your user ID)
UPDATE queries SET user_id = 'your-user-id' WHERE user_id IS NULL;
```

## Migration from In-Memory to Database

If migrating from in-memory storage:

1. Follow `MIGRATION_GUIDE.md` to switch to database storage
2. Run both migration files (001 and 002)
3. Update all API routes to use async storage
4. Test authentication flow

## Next Steps

- Set up password reset flow
- Add user profile page
- Configure email templates
- Set up social auth providers
- Add user settings/preferences
- Implement teams/organizations (multi-tenant)

## API Routes and Authentication

API routes automatically have access to the authenticated user:

```typescript
import { supabase } from '@/app/lib/supabase';

export async function POST(request: NextRequest) {
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Use user.id to filter queries
  // RLS policies will also enforce this at database level
}
```

## Support

- Supabase Auth Docs: https://supabase.com/docs/guides/auth
- RLS Guide: https://supabase.com/docs/guides/auth/row-level-security
- Auth Helpers: https://supabase.com/docs/guides/auth/auth-helpers/nextjs
