import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const queryId = params.id;

    const questions = await storage.getRelatedQuestions(queryId);

    return NextResponse.json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error('Error fetching Related Questions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch Related Questions',
      },
      { status: 500 }
    );
  }
}
