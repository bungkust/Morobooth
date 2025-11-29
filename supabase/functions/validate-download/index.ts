// Supabase Edge Function: Validate Download Request
// This function validates photo download requests with rate limiting and access logging

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  blockDurationMinutes: number;
}

const RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 10,
  maxRequestsPerHour: 50,
  blockDurationMinutes: 5,
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[ValidateDownload] Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract query parameters
    const url = new URL(req.url);
    const photoId = url.searchParams.get('photoId');
    const token = url.searchParams.get('token');

    // Get IP address from headers
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     req.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Validate required parameters
    if (!photoId || !token) {
      await logAccess(supabase, photoId || 'unknown', null, ipAddress, userAgent, false, 'Missing photoId or token');
      return new Response(
        JSON.stringify({ error: 'Invalid download link' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting check
    const rateLimitResult = await checkRateLimit(supabase, ipAddress);
    if (!rateLimitResult.allowed) {
      await logAccess(supabase, photoId, token, ipAddress, userAgent, false, `Rate limit exceeded: ${rateLimitResult.reason}`);
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.retryAfter 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimitResult.retryAfter || 300)
          } 
        }
      );
    }

    // Query photo from database
    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .select('photo_id, access_token, session_code, timestamp, uploaded, storage_path')
      .eq('photo_id', photoId)
      .single();

    // Validate photo exists and token matches
    if (photoError || !photo) {
      await logAccess(supabase, photoId, token, ipAddress, userAgent, false, 'Photo not found');
      return new Response(
        JSON.stringify({ error: 'Invalid download link' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (photo.access_token !== token) {
      await logAccess(supabase, photoId, token, ipAddress, userAgent, false, 'Invalid access token');
      return new Response(
        JSON.stringify({ error: 'Invalid download link' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if photo is uploaded
    if (!photo.uploaded) {
      await logAccess(supabase, photoId, token, ipAddress, userAgent, false, 'Photo not uploaded yet');
      return new Response(
        JSON.stringify({ error: 'Photo not available yet' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration from session settings
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('photo_expired_hours, enable_expired_check, allow_download_after_expired')
      .eq('session_code', photo.session_code)
      .single();

    if (!sessionError && session) {
      const enableExpiredCheck = session.enable_expired_check !== false;
      const expiredHours = session.photo_expired_hours ?? 24;
      const allowDownloadAfterExpired = session.allow_download_after_expired ?? false;

      if (enableExpiredCheck) {
        const photoTime = new Date(photo.timestamp);
        const now = new Date();
        const hoursSincePhoto = (now.getTime() - photoTime.getTime()) / (1000 * 60 * 60);

        if (hoursSincePhoto > expiredHours) {
          if (!allowDownloadAfterExpired) {
            await logAccess(supabase, photoId, token, ipAddress, userAgent, false, 'Photo expired');
            return new Response(
              JSON.stringify({ error: 'Download link has expired' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          // Allow download but will be logged as expired
        }
      }
    }

    // Get storage path
    const storagePath = photo.storage_path || `photos/${photoId}/${photoId}.png`;

    // Generate signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('photos')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('[ValidateDownload] Failed to generate signed URL:', signedUrlError);
      await logAccess(supabase, photoId, token, ipAddress, userAgent, false, 'Failed to generate signed URL');
      return new Response(
        JSON.stringify({ error: 'Failed to generate download link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log successful access
    await logAccess(supabase, photoId, token, ipAddress, userAgent, true, null);

    // Update rate limit counter
    await updateRateLimit(supabase, ipAddress, true);

    // Return signed URL
    return new Response(
      JSON.stringify({ 
        signedUrl: signedUrlData.signedUrl,
        expiresIn: 3600 // 1 hour in seconds
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[ValidateDownload] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Check rate limiting for IP address
 */
async function checkRateLimit(
  supabase: any,
  ipAddress: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  try {
    // Cleanup old rate limit records
    await supabase.rpc('cleanup_old_rate_limits').catch(() => {
      // Non-fatal if function doesn't exist yet
    });

    // Get or create rate limit record
    const { data: rateLimit, error: fetchError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('ip_address', ipAddress)
      .single();

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check if currently blocked
    if (rateLimit?.blocked_until) {
      const blockedUntil = new Date(rateLimit.blocked_until);
      if (blockedUntil > now) {
        const retryAfter = Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000);
        return { 
          allowed: false, 
          reason: 'Currently blocked',
          retryAfter 
        };
      }
    }

    // Check minute window
    if (rateLimit?.window_start) {
      const windowStart = new Date(rateLimit.window_start);
      if (windowStart > oneMinuteAgo) {
        // Within same minute window
        if (rateLimit.request_count >= RATE_LIMIT_CONFIG.maxRequestsPerMinute) {
          // Block for configured duration
          const blockedUntil = new Date(now.getTime() + RATE_LIMIT_CONFIG.blockDurationMinutes * 60 * 1000);
          await supabase
            .from('rate_limits')
            .update({ 
              blocked_until: blockedUntil.toISOString(),
              last_request_at: now.toISOString()
            })
            .eq('ip_address', ipAddress);
          
          return { 
            allowed: false, 
            reason: 'Too many requests per minute',
            retryAfter: RATE_LIMIT_CONFIG.blockDurationMinutes * 60
          };
        }
      } else {
        // New minute window, reset counter
        await supabase
          .from('rate_limits')
          .update({ 
            request_count: 1,
            window_start: now.toISOString(),
            blocked_until: null,
            last_request_at: now.toISOString()
          })
          .eq('ip_address', ipAddress);
      }
    } else {
      // No existing record, create one
      await supabase
        .from('rate_limits')
        .upsert({
          ip_address: ipAddress,
          request_count: 1,
          window_start: now.toISOString(),
          last_request_at: now.toISOString()
        }, {
          onConflict: 'ip_address'
        });
    }

    return { allowed: true };
  } catch (error) {
    console.error('[ValidateDownload] Rate limit check error:', error);
    // On error, allow request (fail open to prevent blocking legitimate users)
    return { allowed: true };
  }
}

/**
 * Update rate limit counter
 */
async function updateRateLimit(supabase: any, ipAddress: string, increment: boolean): Promise<void> {
  try {
    if (increment) {
      await supabase.rpc('increment_rate_limit', { ip_addr: ipAddress }).catch(async () => {
        // Fallback if RPC doesn't exist
        const { data } = await supabase
          .from('rate_limits')
          .select('request_count')
          .eq('ip_address', ipAddress)
          .single();
        
        if (data) {
          await supabase
            .from('rate_limits')
            .update({ request_count: data.request_count + 1 })
            .eq('ip_address', ipAddress);
        }
      });
    }
  } catch (error) {
    console.error('[ValidateDownload] Rate limit update error:', error);
    // Non-fatal
  }
}

/**
 * Log access attempt
 */
async function logAccess(
  supabase: any,
  photoId: string | null,
  token: string | null,
  ipAddress: string,
  userAgent: string,
  granted: boolean,
  failureReason: string | null
): Promise<void> {
  try {
    // Hash token for privacy
    let tokenHash: string | null = null;
    if (token) {
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    await supabase
      .from('photo_access_logs')
      .insert({
        photo_id: photoId,
        access_token_hash: tokenHash,
        ip_address: ipAddress,
        user_agent: userAgent,
        access_granted: granted,
        failure_reason: failureReason
      });
  } catch (error) {
    console.error('[ValidateDownload] Access log error:', error);
    // Non-fatal - logging failures shouldn't block requests
  }
}

