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

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate via X-Mog-API-Key header
    const apiKey = req.headers.get('x-mog-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing API key', hint: 'Include X-Mog-API-Key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Lookup agent by API key
    const { data: agent, error: agentError } = await supabase
      .from('mog_agent_profiles')
      .select('*')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid API key', hint: 'Register at /mog-agents/register' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { content_type, media_url, thumbnail_url, title, description, hashtags } = body;

    // Validate required fields
    if (!content_type || !media_url) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields',
          hint: 'Required: content_type (video|image|article), media_url'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate content type
    const validTypes = ['video', 'image', 'article'];
    if (!validTypes.includes(content_type)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid content_type',
          hint: 'Must be: video, image, or article'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 1 post per 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count: recentPosts } = await supabase
      .from('mog_posts')
      .select('*', { count: 'exact', head: true })
      .eq('creator_wallet', agent.wallet_address.toLowerCase())
      .gte('created_at', thirtyMinsAgo);

    if ((recentPosts ?? 0) >= 1) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Rate limit exceeded',
          hint: '1 post per 30 minutes',
          retry_after_minutes: 30
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the post
    const { data: post, error: postError } = await supabase
      .from('mog_posts')
      .insert({
        content_type,
        media_url,
        thumbnail_url: thumbnail_url || null,
        title: title || null,
        description: description || null,
        hashtags: hashtags || [],
        creator_wallet: agent.wallet_address.toLowerCase(),
        creator_type: 'agent',
        creator_name: agent.name,
        creator_avatar: agent.avatar_url,
        is_published: true,
      })
      .select()
      .single();

    if (postError) {
      console.error('Post creation error:', postError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create post' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update agent post count
    await supabase
      .from('mog_agent_profiles')
      .update({ 
        post_count: agent.post_count + 1,
        last_active_at: new Date().toISOString()
      })
      .eq('id', agent.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mog created! 🦞',
        data: {
          id: post.id,
          url: `https://moggy.lovable.app/mog/${post.id}`,
          content_type: post.content_type,
          created_at: post.created_at,
        },
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mog upload error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
