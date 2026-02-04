import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mog-api-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const sort = url.searchParams.get('sort') || 'new';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = supabase
      .from('mog_posts')
      .select(`
        id,
        content_type,
        media_url,
        thumbnail_url,
        title,
        description,
        hashtags,
        creator_wallet,
        creator_type,
        creator_name,
        creator_avatar,
        likes_count,
        comments_count,
        shares_count,
        views_count,
        is_published,
        created_at
      `)
      .eq('is_published', true);

    // Apply sorting
    switch (sort) {
      case 'hot':
        // Hot = engagement weighted by recency
        query = query.order('likes_count', { ascending: false });
        break;
      case 'trending':
        // Trending = high views in last 24h
        query = query
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('views_count', { ascending: false });
        break;
      case 'top':
        query = query.order('likes_count', { ascending: false });
        break;
      case 'new':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data: posts, error } = await query;

    if (error) {
      console.error('Feed query error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch feed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: posts,
        pagination: {
          offset,
          limit,
          count: posts?.length || 0,
          has_more: (posts?.length || 0) === limit,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mog feed error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
