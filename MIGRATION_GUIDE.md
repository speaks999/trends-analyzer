# Migration Guide: In-Memory to Supabase Database

This guide explains how to migrate from in-memory storage to Supabase database storage.

## Overview

The app currently uses in-memory storage (`app/lib/storage.ts`). We've created a database-backed storage implementation (`app/lib/storage-db.ts`) that uses Supabase.

## Important: Async vs Sync

The main difference is that database operations are **async** (use `await`), while in-memory operations are **synchronous**.

## Migration Steps

### Step 1: Update API Routes

All API routes that use storage need to be updated to use async/await.

#### Example: `app/api/trends/route.ts`

**Before:**
```typescript
import { storage } from '@/app/lib/storage';

// In the route handler:
const allQueries = storage.getAllQueries(); // Synchronous
storage.addTrendSnapshot({...}); // Synchronous
```

**After:**
```typescript
import { dbStorage as storage } from '@/app/lib/storage-db';

// In the route handler:
const allQueries = await storage.getAllQueries(); // Async
await storage.addTrendSnapshot({...}); // Async
```

#### Example: `app/api/score/route.ts`

**Before:**
```typescript
storage.setTrendScore({...});
```

**After:**
```typescript
await storage.setTrendScore({...});
```

### Step 2: Update Server-Side Code

All server-side code that uses storage needs `await`:

- `app/api/actions/route.ts`
- `app/api/cluster/route.ts`
- `app/api/generate-queries/route.ts`
- `app/lib/actions.ts`
- `app/lib/clustering.ts`
- `app/lib/recommendations.ts`
- `app/lib/scoring.ts`

### Step 3: Client-Side Code

Client-side code in `app/page.tsx` uses storage via API routes, so no direct changes needed there. However, if you add any direct storage calls, they need to be async.

**Note:** For client-side code, you might want to create a client-safe Supabase instance that works in the browser. The current `supabase.ts` is configured for server-side use.

### Step 4: Update Imports

Replace imports in all files:

```typescript
// Change from:
import { storage } from '@/app/lib/storage';

// To:
import { dbStorage as storage } from '@/app/lib/storage-db';
```

## Files That Need Updates

### API Routes (All async route handlers)
- [ ] `app/api/trends/route.ts`
- [ ] `app/api/score/route.ts`
- [ ] `app/api/actions/route.ts`
- [ ] `app/api/cluster/route.ts`
- [ ] `app/api/generate-queries/route.ts`

### Library Files (Functions that use storage)
- [ ] `app/lib/actions.ts`
- [ ] `app/lib/clustering.ts`
- [ ] `app/lib/recommendations.ts`
- [ ] `app/lib/scoring.ts`

### Client Files
- [ ] `app/page.tsx` (only if it directly uses storage - currently it uses API routes)

## Testing After Migration

1. **Add a query**: Verify it's saved in Supabase Table Editor
2. **Fetch trends**: Check `trend_snapshots` table for new data
3. **Calculate scores**: Verify scores appear in `trend_scores` table
4. **Create clusters**: Check `opportunity_clusters` and `cluster_queries` tables
5. **Classify intents**: Verify `intent_classifications` table

## Rollback Plan

If you need to rollback:
1. Change imports back to `@/app/lib/storage`
2. Remove `await` keywords from storage calls
3. Data in Supabase will remain but won't be used

## Gradual Migration (Recommended)

You can migrate gradually:

1. **Phase 1**: Migrate only queries and trend snapshots
2. **Phase 2**: Migrate scores and classifications  
3. **Phase 3**: Migrate clusters

Use feature flags or environment variables to switch between storage backends during testing.

## Helper Script

You can create a simple script to verify the database connection:

```typescript
// scripts/test-db.ts
import { dbStorage } from '../app/lib/storage-db';

async function test() {
  try {
    const queries = await dbStorage.getAllQueries();
    console.log('✅ Database connection successful!');
    console.log(`Found ${queries.length} queries`);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
}

test();
```

Run with: `npx tsx scripts/test-db.ts`

## Performance Considerations

- Database queries are slower than in-memory (network latency)
- Consider adding caching for frequently accessed data
- Use database indexes (already created in migration) for fast queries
- Batch operations when possible

## Error Handling

All database operations should have error handling:

```typescript
try {
  const query = await storage.addQuery({ text: 'example' });
} catch (error) {
  console.error('Failed to add query:', error);
  // Handle error appropriately
}
```
