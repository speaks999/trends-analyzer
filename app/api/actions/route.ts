// API route for triggering actions

import { NextRequest, NextResponse } from 'next/server';
import { generateActions, getActionsByType, getTopActions, ActionType } from '@/app/lib/actions';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const body = await request.json();
    const { type, limit = 20 } = body;

    let actions;
    if (type && ['content', 'product', 'alert'].includes(type)) {
      actions = await getActionsByType(type as ActionType, storage);
    } else {
      actions = await getTopActions(limit, storage);
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
    const storage = await getAuthenticatedStorage(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ActionType | null;
    const limit = searchParams.get('limit');

    let actions;
    if (type && ['content', 'product', 'alert'].includes(type)) {
      actions = await getActionsByType(type, storage);
    } else {
      actions = await getTopActions(limit ? Number(limit) : 20, storage);
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

