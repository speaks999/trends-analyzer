// Helper functions for getting authenticated user in API routes

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DatabaseStorage } from './storage-db';

/**
 * Get authenticated Supabase client for server-side API routes
 */
export async function getAuthenticatedSupabaseClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  // IMPORTANT: Use the anon/publishable key (not service role) so RLS policies are enforced
  // The service role key bypasses RLS, which we don't want for user-authenticated requests
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

  if (!supabaseKey) {
    throw new Error('Supabase publishable/anon key is required for RLS to work');
  }

  // Create a custom fetch function that ALWAYS includes the JWT in headers
  // This ensures PostgREST receives the JWT for RLS evaluation on every request
  // The Supabase client may make internal requests that bypass global.headers, so we intercept at the fetch level
  const customFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Convert input to URL string if needed
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    // Ensure Authorization and apikey headers are always present
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('apikey', supabaseKey);
    // Add cache-busting headers to prevent any HTTP-level caching
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('X-Request-Id', `${Date.now()}-${Math.random().toString(36).substring(7)}`);
    
    // Always log to confirm custom fetch is being called
    console.log(`[Custom Fetch] ${init?.method || 'GET'} ${url.substring(0, 100)}...`);
    
    // Log if this is a PostgREST query (for debugging)
    if (url.includes('/rest/v1/')) {
      const endpoint = url.split('/rest/v1/')[1]?.split('?')[0] || 'unknown';
      const hasAuth = headers.get('Authorization')?.startsWith('Bearer ');
      console.log(`[Custom Fetch] PostgREST: ${endpoint}, JWT present: ${hasAuth}`);
    }
    
    // Create new init with merged headers
    const newInit: RequestInit = {
      ...init,
      headers,
    };
    
    // Use the global fetch with our modified headers
    return fetch(url, newInit);
  };

  // Create a Supabase client with custom fetch to ensure JWT is always sent
  // For server-side RLS, PostgREST needs the JWT in the Authorization header
  // Using a custom fetch ensures the JWT is sent with EVERY request, not just initial ones
  // NOTE: The fetch option MUST be inside 'global', not at the top level!
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: undefined, // Disable any storage to prevent session caching
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey, // PostgREST also needs the anon key
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      fetch: customFetch, // IMPORTANT: Must be inside global, not at top level!
    },
    db: {
      schema: 'public',
    },
  });

  // Decode JWT to get user ID for logging
  try {
    const parts = accessToken.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const userId = payload.sub;
      console.log(`[Auth] Authenticated as user: ${userId} for RLS policies (JWT in headers + custom fetch)`);
    }
  } catch (e) {
    console.log(`[Auth] Using access token for RLS (JWT in headers + custom fetch)`);
  }

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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  // Get the access token from the request
  const authHeader = request.headers.get('authorization');
  let accessToken = authHeader?.replace('Bearer ', '');
  
  if (!accessToken) {
    // Try to get from cookie
    const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
    const projectRef = urlMatch ? urlMatch[1] : null;
    if (projectRef) {
      const cookieName = `sb-${projectRef}-auth-token`;
      const cookie = request.cookies.get(cookieName);
      if (cookie) {
        try {
          let cookieValue = decodeURIComponent(cookie.value);
          const parsed = JSON.parse(cookieValue);
          if (parsed?.access_token) {
            accessToken = parsed.access_token;
          } else if (Array.isArray(parsed) && parsed[0]?.access_token) {
            accessToken = parsed[0].access_token;
          }
        } catch {
          // Continue
        }
      }
    }
  }
  
  const supabase = await getAuthenticatedSupabaseClient(request);
  
  // Pass directConfig for fallback direct PostgREST queries
  // This helps when the Supabase client's RLS enforcement is inconsistent
  const directConfig = accessToken ? {
    supabaseUrl,
    apiKey: supabaseKey,
    accessToken,
  } : undefined;
  
  return new DatabaseStorage(supabase, directConfig);
}
