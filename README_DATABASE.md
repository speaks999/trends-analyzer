# Database Backend Setup

The Trends Analyzer now supports Supabase as a persistent database backend. This allows you to:

- ✅ Persist queries and trend data across application restarts
- ✅ Store historical trend snapshots over time
- ✅ Maintain trend scores (TOS) calculations
- ✅ Keep intent classifications and opportunity clusters

## Quick Start

1. **Follow the setup guide**: See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed instructions
2. **Install dependencies**: Run `npm install` (Supabase client is already in package.json)
3. **Configure environment**: Add your Supabase credentials to `.env.local`
4. **Run migration**: Execute the SQL migration in Supabase SQL Editor
5. **Switch to database storage**: Follow [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) to migrate your code

## Current Status

- ✅ Database schema created (`supabase/migrations/001_initial_schema.sql`)
- ✅ Supabase client configured (`app/lib/supabase.ts`)
- ✅ Database storage implementation ready (`app/lib/storage-db.ts`)
- ⚠️ Application still uses in-memory storage by default

## Files Created

- `supabase/migrations/001_initial_schema.sql` - Database schema
- `app/lib/supabase.ts` - Supabase client configuration
- `app/lib/storage-db.ts` - Database-backed storage implementation
- `SUPABASE_SETUP.md` - Setup instructions
- `MIGRATION_GUIDE.md` - Code migration guide

## Next Steps

1. Complete Supabase setup (see SUPABASE_SETUP.md)
2. Test database connection
3. Migrate application code to use database storage (see MIGRATION_GUIDE.md)

## Database Schema

The database includes 6 main tables:

1. **queries** - Search queries added by users
2. **trend_snapshots** - Historical Google Trends data points
3. **trend_scores** - Calculated TOS (Trend Opportunity Scores)
4. **intent_classifications** - AI-classified intent types
5. **opportunity_clusters** - Grouped related queries
6. **cluster_queries** - Junction table for cluster-query relationships

All tables have proper indexes, foreign keys, and Row Level Security (RLS) policies.
