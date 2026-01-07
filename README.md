# Entrepreneur Demand & Trend Intelligence System

A comprehensive Next.js application that continuously discovers what entrepreneurs are searching for, detects rising demand through momentum-based scoring, classifies intent, clusters opportunities, and triggers downstream actions.

## Features

- **AI-Powered Query Generation**: Uses OpenAI to generate entrepreneurial search queries with template-based expansion
- **Multi-Window Trend Collection**: Fetches Google Trends data for 30 days, 90 days, and 12 months
- **Momentum-Based Scoring**: Calculates Trend Opportunity Score (TOS) based on slope, acceleration, consistency, and breadth
- **Intent Classification**: Classifies queries as pain-driven, tool-driven, transition-driven, or education-driven
- **Opportunity Clustering**: Groups queries into problem clusters representing single entrepreneur problems
- **Actions Engine**: Automatically triggers content, product, and alerting actions based on scores and intent
- **Real-time Visualization**: Interactive charts using Recharts to compare multiple trends

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```
OPENAI_API_KEY=your_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Add Queries**: Manually add queries or use AI to generate suggestions
2. **Fetch Trends**: Select queries and fetch Google Trends data
3. **View Scores**: See TOS scores and classifications for each query
4. **Explore Clusters**: View opportunity clusters grouped by intent
5. **Review Actions**: See automatically generated content, product, and alert recommendations

## Technology Stack

- Next.js 14+ (App Router) with TypeScript
- React 19+ with Tailwind CSS
- Google Trends API (via `google-trends-api`)
- OpenAI API (via `openai`)
- Recharts for data visualization

## Project Structure

- `app/lib/` - Core business logic modules
- `app/api/` - API routes for backend operations
- `app/components/` - React UI components
- `app/page.tsx` - Main dashboard

