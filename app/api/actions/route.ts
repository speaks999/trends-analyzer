// API route for triggering actions

import { NextRequest, NextResponse } from 'next/server';
import { generateActions, getActionsByType, getTopActions, ActionType } from '@/app/lib/actions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, limit = 20 } = body;

    let actions;
    if (type && ['content', 'product', 'alert'].includes(type)) {
      actions = getActionsByType(type as ActionType);
    } else {
      actions = getTopActions(limit);
    }

    return NextResponse.json({
      success: true,
      actions,
      count: actions.length,
    });
  } catch (error) {
    console.error('Error generating actions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate actions',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ActionType | null;
    const limit = searchParams.get('limit');

    let actions;
    if (type && ['content', 'product', 'alert'].includes(type)) {
      actions = getActionsByType(type);
    } else {
      actions = getTopActions(limit ? Number(limit) : 20);
    }

    return NextResponse.json({
      success: true,
      actions,
      count: actions.length,
    });
  } catch (error) {
    console.error('Error getting actions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get actions',
      },
      { status: 500 }
    );
  }
}

