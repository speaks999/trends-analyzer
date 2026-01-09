import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[API] GET /api/query/${params.id}/related-topics`);
    
    const storage = await getAuthenticatedStorage(request);
    const queryId = params.id;

    const topics = await storage.getRelatedTopics(queryId);
    console.log(`[API] Returned ${topics.length} topics for query ${queryId}`);

    return NextResponse.json({
      success: true,
      topics,
    });
  } catch (error) {
    console.error('Error fetching related topics:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch related topics',
      },
      { status: 500 }
    );
  }
}
