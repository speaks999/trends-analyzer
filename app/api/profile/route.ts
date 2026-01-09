// API route for managing entrepreneur profiles

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated Supabase client (uses user's access token from header/cookies)
    const supabase = await getAuthenticatedSupabaseClient(request);

    // Get user from authenticated client
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token: ' + (authError?.message || 'Unknown error') },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from('entrepreneur_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found
        return NextResponse.json({
          success: true,
          profile: null,
        });
      }
      throw error;
    }

    const profile = {
      id: data.id,
      user_id: data.user_id,
      demographic: data.demographic || undefined,
      tech_savviness: data.tech_savviness || undefined,
      business_stage: data.business_stage || undefined,
      industry: data.industry || undefined,
      geographic_region: data.geographic_region || undefined,
      preferences: data.preferences || undefined,
      created_at: data.created_at ? new Date(data.created_at) : undefined,
      updated_at: data.updated_at ? new Date(data.updated_at) : undefined,
    };

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch profile',
      },
      { status: error instanceof Error && error.message.includes('authenticated') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated Supabase client (uses user's access token from header/cookies)
    const supabase = await getAuthenticatedSupabaseClient(request);

    // Get user from authenticated client
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token: ' + (authError?.message || 'Unknown error') },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { demographic, tech_savviness, business_stage, industry, geographic_region, preferences } = body;

    const { data, error } = await supabase
      .from('entrepreneur_profiles')
      .upsert({
        user_id: user.id,
        demographic: demographic || null,
        tech_savviness: tech_savviness || null,
        business_stage: business_stage || null,
        industry: industry || null,
        geographic_region: geographic_region || null,
        preferences: preferences || null,
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const profile = {
      id: data.id,
      user_id: data.user_id,
      demographic: data.demographic || undefined,
      tech_savviness: data.tech_savviness || undefined,
      business_stage: data.business_stage || undefined,
      industry: data.industry || undefined,
      geographic_region: data.geographic_region || undefined,
      preferences: data.preferences || undefined,
      created_at: data.created_at ? new Date(data.created_at) : undefined,
      updated_at: data.updated_at ? new Date(data.updated_at) : undefined,
    };

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error saving profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save profile',
      },
      { status: error instanceof Error && error.message.includes('authenticated') ? 401 : 500 }
    );
  }
}
