import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const queryId = params.id;

    const topics = await storage.getRelatedTopics(queryId);

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
