import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { generateQueryArticle, ArticlePlatform } from '@/app/lib/article-generator';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const queryId = params.id;
    
    // Get platform from request body
    const body = await request.json().catch(() => ({}));
    const platform: ArticlePlatform = body.platform || 'blog';

    // Get the query
    const query = await storage.getQuery(queryId);
    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Query not found' },
        { status: 404 }
      );
    }

    // Get related questions for context
    const relatedQuestions = await storage.getRelatedQuestions(queryId);

    // Generate the article for the specified platform
    const article = await generateQueryArticle(query.text, relatedQuestions, platform);

    return NextResponse.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error('Error generating article:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate article',
      },
      { status: 500 }
    );
  }
}
