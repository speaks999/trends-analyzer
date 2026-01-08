# Supabase Setup Instructions

This guide will walk you through setting up Supabase as the database backend for the Trends Analyzer application.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Node.js and npm installed
- Basic knowledge of SQL and database concepts

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account)
2. Click "New Project"
3. Fill in the project details:
   - **Name**: trends-analyzer (or your preferred name)
   - **Database Password**: Create a strong password (save this securely)
   - **Region**: Choose the region closest to you
   - **Pricing Plan**: Select the free tier for development
4. Click "Create new project"
5. Wait for the project to be provisioned (this takes a few minutes)

## Step 2: Get Your Supabase Credentials

1. Once your project is ready, go to **Settings** → **API**
2. You'll need three values:
   - **Project URL**: Found under "Project URL" (looks like `https://xxxxx.supabase.co`)
     - Example: `https://fbgyufmyqwivhhzcrbcn.supabase.co`
   - **Publishable key**: Found under "Publishable key" section → "default" key (starts with `sb_publishable_...`)
     - This replaces the legacy "anon public" key
     - Safe for client-side code (browser), respects RLS
     - Click the copy icon to copy the full key
   - **Secret key**: Found under "Secret keys" section → "default" key (starts with `sb_secret_...`)
     - Click the eye icon to reveal, then copy
     - **Server-side only** - NEVER expose in client-side code
     - Bypasses RLS for admin operations
     - More powerful than publishable key

Save these values securely - you'll need them in the next step.

## Step 3: Run Database Migration

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Open the file `supabase/migrations/001_initial_schema.sql` from this project
4. Copy the entire contents of that file
5. Paste it into the SQL Editor
6. Click "Run" (or press Ctrl/Cmd + Enter)
7. You should see "Success. No rows returned" if the migration was successful

This creates all the necessary tables:
- `queries` - Stores search queries
- `trend_snapshots` - Stores historical trend data points
- `trend_scores` - Stores calculated TOS scores
- `intent_classifications` - Stores AI-classified intent types
- `opportunity_clusters` - Stores grouped queries
- `cluster_queries` - Junction table for cluster-query relationships

## Step 4: Install Dependencies

In your project directory, run:

```bash
npm install @supabase/supabase-js
```

## Step 5: Configure Environment Variables

1. Create a `.env.local` file in the root of your project (if it doesn't exist)

2. Add the following environment variables:

```env
# Project URL (shared for client and server)
NEXT_PUBLIC_SUPABASE_URL=your-project-url-here

# Publishable key (for client-side use, safe in browser, respects RLS)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here

# Secret key (for server-side use only, NOT exposed to client, bypasses RLS)
SUPABASE_SECRET_KEY=your-secret-key-here
```

Replace:
- `your-project-url-here` with your Project URL from Step 2
- `your-publishable-key-here` with your **Publishable key** (starts with `sb_publishable_...`)
- `your-secret-key-here` with your **Secret key** (starts with `sb_secret_...`)

Example:
```env
NEXT_PUBLIC_SUPABASE_URL=https://fbgyufmyqwivhhzcrbcn.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mJUPMjmhRs0TneFUpc1SSw_YAv4B...
SUPABASE_SECRET_KEY=sb_secret_m-IxL...
```

**Important Notes**: 
- **Publishable key** (starts with `sb_publishable_`) - Safe for client-side, respects Row Level Security (RLS)
- **Secret key** (starts with `sb_secret_`) - Server-side only, bypasses RLS, more powerful
- The `NEXT_PUBLIC_` prefix makes variables available to client-side code
- **Never** put `SUPABASE_SECRET_KEY` with `NEXT_PUBLIC_` prefix - it must stay server-side only

**Important**: 
- The `NEXT_PUBLIC_` prefix makes these variables available to client-side code
- Never commit `.env.local` to version control (it should already be in `.gitignore`)
- For production, set these as environment variables in your hosting platform

## Step 6: Update Storage Module

The application currently uses in-memory storage. To switch to Supabase:

1. Update `app/lib/storage.ts` to use the database storage:

You have two options:

### Option A: Complete Migration (Recommended for Production)

Replace the storage import in files that use it:

```typescript
// In files that import storage, change from:
import { storage } from '@/app/lib/storage';

// To:
import { dbStorage as storage } from '@/app/lib/storage-db';
```

Then update all synchronous storage calls to be async:

```typescript
// Before:
const query = storage.addQuery({ text: 'example' });

// After:
const query = await storage.addQuery({ text: 'example' });
```

### Option B: Hybrid Approach (Easier Transition)

Keep using the in-memory storage for now and gradually migrate. The database tables are ready, and you can switch when convenient.

## Step 7: Test the Connection

1. Start your development server:
   ```bash
   npm run dev
   ```

2. The app should connect to Supabase automatically. Check the browser console for any connection errors.

3. Try adding a query - it should be saved to the database.

## Step 8: Verify Data in Supabase

1. Go to your Supabase dashboard
2. Navigate to **Table Editor**
3. You should see all the tables we created:
   - `queries`
   - `trend_snapshots`
   - `trend_scores`
   - `intent_classifications`
   - `opportunity_clusters`
   - `cluster_queries`

4. When you add queries or fetch trends, check these tables to see the data being stored.

## Troubleshooting

### Connection Errors

- **"Supabase URL or Key is missing"**: 
  - Check that your `.env.local` file exists and has the correct variable names
  - Restart your development server after adding environment variables
  - Verify the values are correct (no extra spaces or quotes)
  - Client-side needs: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - Server-side needs: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or falls back to publishable key)

### Migration Errors

- **"relation already exists"**: 
  - The tables already exist. This is fine - the migration is idempotent
- **Permission denied**: 
  - Check that RLS policies were created correctly
  - Verify you're using the **Publishable key** (for client-side) or **Secret key** (for server-side only, never expose in client code)

### Data Not Persisting

- Check the browser console for errors
- Verify in Supabase dashboard that data is actually being written
- Make sure you're using the database storage (`storage-db`) not in-memory storage

## Security Notes

1. **Row Level Security (RLS)**: The migration creates permissive RLS policies that allow all operations. For production:
   - Add authentication to your app
   - Update RLS policies to restrict access based on user authentication
   - Consider using service role key only on the server side

2. **API Keys**: 
   - **Publishable key** (`sb_publishable_...`) - Safe for client-side code, respects RLS policies
   - **Secret key** (`sb_secret_...`) - Server-side only, bypasses RLS, more powerful operations
   - Use `NEXT_PUBLIC_` prefix ONLY for publishable key (makes it available to client)
   - **Never** use `NEXT_PUBLIC_` prefix for secret key - keep it server-side only
   - Use environment variables to manage secrets
   - The secret key allows admin operations that bypass Row Level Security

## Next Steps

- Set up proper authentication if you want multi-user support
- Configure RLS policies for production security
- Set up database backups in Supabase dashboard
- Monitor usage in Supabase dashboard to stay within free tier limits

## Support

- Supabase Documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- SQL Editor in Supabase Dashboard: For running custom queries and debugging
