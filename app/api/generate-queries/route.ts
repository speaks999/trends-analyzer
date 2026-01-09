// API route for OpenAI query generation with templates

import { NextRequest, NextResponse } from 'next/server';
import { generateQueries, QueryGenerationOptions } from '@/app/lib/openai';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const options: QueryGenerationOptions = {
      count: body.count || 3,
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

