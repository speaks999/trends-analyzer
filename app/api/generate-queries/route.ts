// API route for OpenAI query generation with templates

import { NextRequest, NextResponse } from 'next/server';
import { generateQueries, QueryGenerationOptions } from '@/app/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const options: QueryGenerationOptions = {
      count: body.count || 10,
      focus: body.focus || 'all',
      context: body.context,
    };

    const queries = await generateQueries(options);

    return NextResponse.json({
      success: true,
      queries,
      count: queries.length,
    });
  } catch (error) {
    console.error('Error generating queries:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate queries',
      },
      { status: 500 }
    );
  }
}

