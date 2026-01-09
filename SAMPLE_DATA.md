# Sample Data Guide

This guide explains how to use the sample data for testing and demonstration purposes.

## Overview

The sample data includes:
- **Query Terms**: Sample search queries with metadata (stage, function, pain points, assets)
- **Opportunity Clusters**: Grouped queries representing business opportunities
- **Blog Articles**: Long-form articles (800-1500 words) with SEO keywords and images
- **X/Twitter Articles**: Short posts (280 chars max) with hashtags and optional threads
- **Instagram Articles**: Captions (2200 chars max) with hashtags and images
- **LinkedIn Articles**: Professional posts (~1300 chars) with hashtags

## Files

- `app/lib/sample-data.ts` - Contains all sample data definitions
- `app/api/cluster/articles/sample/route.ts` - API endpoint to fetch sample articles
- `scripts/seed-sample-data.ts` - Script to seed the database with sample queries and clusters

## Using Sample Data

### 1. Seed Database with Sample Queries and Clusters

Run the seeding script to populate your database:

```bash
# Set your Supabase credentials
export NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the script (you may need to authenticate first)
npx tsx scripts/seed-sample-data.ts
```

This will:
- Create sample queries in the database
- Create sample opportunity clusters
- Link queries to clusters
- Add intent classifications for queries

### 2. Access Sample Articles via API

You can fetch sample articles for testing:

```typescript
// Get all sample articles
const response = await fetch('/api/cluster/articles/sample');
const data = await response.json();

// Get articles for a specific cluster
const response = await fetch('/api/cluster/articles/sample?clusterId=sample-cluster-1');
const data = await response.json();
```

### 3. Use Sample Articles in Components

The sample articles are structured to work directly with the `ArticleGenerator` component:

```typescript
import { getSampleArticlesForCluster } from '@/app/lib/sample-data';

// Get articles for a cluster
const articles = getSampleArticlesForCluster('sample-cluster-1');

// Use in ArticleGenerator
<ArticleGenerator 
  articles={articles}
  clusterId="sample-cluster-1"
  clusterName="Cash Flow Management Solutions"
/>
```

## Sample Data Structure

### Query Terms

Each query includes:
- `text`: The search query text
- `template`: Query template type (e.g., "how to", "best")
- `stage`: Business stage (idea, early-stage, growth, scaling, exit)
- `function`: Business function (sales, marketing, finance, etc.)
- `pain`: Pain point (cash flow, churn, follow-up, etc.)
- `asset`: Asset type (CRM, dashboard, spreadsheet, etc.)

### Clusters

Each cluster includes:
- `name`: Descriptive cluster name
- `intent_type`: pain, tool, transition, or education
- `average_score`: Average TOS score (0-100)
- `queries`: Array of query IDs linked to this cluster

### Articles

All articles include:
- `title`: Article title
- `content`: Article content (platform-specific length)
- `clusterId`: ID of the associated cluster
- `clusterName`: Name of the associated cluster
- `platform`: blog, twitter, instagram, or linkedin
- `createdAt`: Creation timestamp
- `ai_generated`: Boolean flag

Platform-specific fields:
- **Blog**: `wordCount`, `imageUrl`, `seoKeywords`, `metaDescription`
- **Twitter**: `characterCount`, `hashtags`, `thread` (optional)
- **Instagram**: `characterCount`, `hashtags`, `imageUrl`
- **LinkedIn**: `characterCount`, `hashtags`

## Testing Article Display

The sample articles are designed to test all aspects of the `ArticleGenerator` component:

1. **Blog Articles**: Test long-form content display, image previews, SEO keywords
2. **Twitter Articles**: Test character count, thread display, hashtag formatting
3. **Instagram Articles**: Test caption formatting, hashtags, image previews
4. **LinkedIn Articles**: Test professional formatting, hashtags

## Image URLs

Sample articles use Unsplash placeholder images. In production, you would:
- Generate images using DALL-E API
- Store images in Supabase Storage
- Use actual image URLs from your storage

## Updating Sample Data

To add more sample data:

1. Edit `app/lib/sample-data.ts`
2. Add new queries to `sampleQueries` array
3. Add new clusters to `sampleClusters` array
4. Add new articles to the respective article arrays
5. Update cluster-query mappings in the seeding script

## Notes

- Sample cluster IDs use the format `sample-cluster-{n}` for easy identification
- When seeding real data, cluster IDs will be UUIDs from the database
- The `updateSampleArticlesClusterIds` helper can map sample IDs to real database IDs
- All sample data is marked with `ai_generated: false` to distinguish from AI-generated content
