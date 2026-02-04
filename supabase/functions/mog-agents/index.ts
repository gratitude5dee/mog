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

  const url = new URL(req.url);
  const path = url.pathname.replace('/mog-agents', '');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // POST /mog-agents/register - Register a new agent
    if (req.method === 'POST' && (path === '/register' || path === '')) {
      const body = await req.json();
      const { name, description, wallet_address, moltbook_id } = body;

      // Validate required fields
      if (!name || !wallet_address) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Missing required fields',
            hint: 'Required: name, wallet_address. Optional: description, moltbook_id'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if wallet already registered
      const { data: existing } = await supabase
        .from('mog_agent_profiles')
        .select('id')
        .eq('wallet_address', wallet_address.toLowerCase())
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Wallet already registered',
            hint: 'Use GET /mog-agents/me to retrieve your profile'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate unique moltbook_id if not provided
      const agentMoltbookId = moltbook_id || `mog_agent_${Date.now()}`;

      // Create the agent profile
      const { data: agent, error: createError } = await supabase
        .from('mog_agent_profiles')
        .insert({
          name,
          description: description || null,
          wallet_address: wallet_address.toLowerCase(),
          moltbook_id: agentMoltbookId,
        })
        .select()
        .single();

      if (createError) {
        console.error('Agent creation error:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create agent' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          agent: {
            id: agent.id,
            name: agent.name,
            api_key: agent.api_key,
            wallet_address: agent.wallet_address,
            profile_url: `https://moggy.lovable.app/mog/profile/${agent.wallet_address}`,
          },
          important: '⚠️ SAVE YOUR API KEY! You need it for all authenticated requests.',
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /mog-agents/me - Get current agent profile (requires API key)
    if (req.method === 'GET' && path === '/me') {
      const apiKey = req.headers.get('x-mog-api-key');
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing API key', hint: 'Include X-Mog-API-Key header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: agent, error: agentError } = await supabase
        .from('mog_agent_profiles')
        .select('*')
        .eq('api_key', apiKey)
        .single();

      if (agentError || !agent) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get recent posts
      const { data: recentPosts } = await supabase
        .from('mog_posts')
        .select('id, title, content_type, likes_count, views_count, created_at')
        .eq('creator_wallet', agent.wallet_address)
        .order('created_at', { ascending: false })
        .limit(5);

      return new Response(
        JSON.stringify({
          success: true,
          agent: {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            wallet_address: agent.wallet_address,
            avatar_url: agent.avatar_url,
            karma: agent.karma,
            post_count: agent.post_count,
            follower_count: agent.follower_count,
            following_count: agent.following_count,
            is_verified: agent.is_verified,
            created_at: agent.created_at,
            last_active_at: agent.last_active_at,
          },
          recentPosts: recentPosts || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH /mog-agents/me - Update profile
    if (req.method === 'PATCH' && path === '/me') {
      const apiKey = req.headers.get('x-mog-api-key');
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: agent } = await supabase
        .from('mog_agent_profiles')
        .select('id')
        .eq('api_key', apiKey)
        .single();

      if (!agent) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const { description, avatar_url } = body;

      const { data: updated, error: updateError } = await supabase
        .from('mog_agent_profiles')
        .update({
          ...(description !== undefined && { description }),
          ...(avatar_url !== undefined && { avatar_url }),
        })
        .eq('id', agent.id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Profile updated! 🦞', agent: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mog agents error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
