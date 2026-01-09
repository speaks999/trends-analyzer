// Helper functions for getting authenticated user in API routes

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DatabaseStorage } from './storage-db';

/**
 * Get authenticated Supabase client for server-side API routes
 */
export async function getAuthenticatedSupabaseClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  // During build time (when collecting page data), handle missing env vars gracefully
  // This prevents build failures - the route will error at runtime if actually called
  if (!supabaseUrl || !supabaseKey) {
    // Check if we're in build mode (no request context or during static generation)
    if (typeof request === 'undefined' || !request.url) {
      throw new Error('Supabase configuration is missing - ensure environment variables are set');
    }
    throw new Error('Supabase configuration is missing');
  }

  // Try to get token from Authorization header first
  const authHeader = request.headers.get('authorization');
  let accessToken = authHeader?.replace('Bearer ', '');

  // If no Authorization header, try to get from cookies
  // Supabase stores session in cookies with pattern: sb-{project-ref}-auth-token
  if (!accessToken) {
    const cookies = request.cookies;
    
    // Extract project ref from URL (e.g., https://xyzabc.supabase.co -> xyzabc)
    const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
    const projectRef = urlMatch ? urlMatch[1] : null;
    
    // Try the standard Supabase cookie name
    if (projectRef) {
      const cookieName = `sb-${projectRef}-auth-token`;
      const cookie = cookies.get(cookieName);
      if (cookie) {
        try {
          // Supabase stores the session as JSON string (may be URL encoded)
          let cookieValue = cookie.value;
          // Try URL decoding
          try {
            cookieValue = decodeURIComponent(cookieValue);
          } catch {
            // Already decoded or not URL encoded
          }
          
          const parsed = JSON.parse(cookieValue);
          
          // Session structure: { access_token, refresh_token, expires_at, token_type, user }
          // Or sometimes: [{ access_token, ... }] (array format)
          if (parsed && typeof parsed === 'object') {
            if (parsed.access_token) {
              accessToken = parsed.access_token;
            } else if (Array.isArray(parsed) && parsed[0]?.access_token) {
              accessToken = parsed[0].access_token;
            } else if (parsed.session?.access_token) {
              accessToken = parsed.session.access_token;
            }
          }
        } catch (e) {
          console.error(`Error parsing Supabase auth cookie ${cookieName}:`, e);
          console.error('Cookie value (first 100 chars):', cookie.value.substring(0, 100));
        }
      }
    }
    
    // Fallback: check all cookies for auth-related ones
    if (!accessToken) {
      const allCookies = cookies.getAll();
      console.log('Checking all cookies for auth token. Found cookies:', allCookies.map(c => c.name));
      
      for (const cookie of allCookies) {
        if (cookie.name.includes('auth') || cookie.name.includes('supabase')) {
          try {
            let cookieValue = cookie.value;
            try {
              cookieValue = decodeURIComponent(cookieValue);
            } catch {
              // Already decoded
            }
            
            const parsed = JSON.parse(cookieValue);
            if (parsed?.access_token) {
              accessToken = parsed.access_token;
              console.log(`Found access token in cookie: ${cookie.name}`);
              break;
            } else if (Array.isArray(parsed) && parsed[0]?.access_token) {
              accessToken = parsed[0].access_token;
              console.log(`Found access token in array cookie: ${cookie.name}`);
              break;
            }
          } catch (e) {
            // Not a JSON cookie, skip
            continue;
          }
        }
      }
    }
  }

  if (!accessToken) {
    // Log available cookies for debugging (don't log values, just names)
    const allCookies = request.cookies.getAll();
    const cookieNames = allCookies.map(c => c.name).join(', ');
    console.error('Authentication failed: No access token found');
    console.error('Available cookies:', cookieNames);
    console.error('Supabase URL:', supabaseUrl);
    throw new Error('User must be authenticated - no session token found in cookies or Authorization header');
  }

  // Create a Supabase client with the user's access token in global headers
  // This is the recommended way for server-side usage
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  return supabase;
}

/**
 * Get user ID from request by extracting session from cookies or Authorization header
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string> {
  const supabase = await getAuthenticatedSupabaseClient(request);
  
  // Get the user from the authenticated client
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('Invalid or expired session token');
  }

  return user.id;
}

/**
 * Get a storage instance configured with the authenticated user's Supabase client
 * Use this in API routes to access storage with the user's authentication context
 */
export async function getAuthenticatedStorage(request: NextRequest): Promise<DatabaseStorage> {
  const supabase = await getAuthenticatedSupabaseClient(request);
  return new DatabaseStorage(supabase);
}
