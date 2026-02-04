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
    const { action_type, content_id, comment } = body;

    // Validate required fields
    if (!action_type || !content_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields',
          hint: 'Required: action_type (like|comment|bookmark|share|view), content_id'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate action type
    const validActions = ['like', 'comment', 'bookmark', 'share', 'view'];
    if (!validActions.includes(action_type)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid action_type',
          hint: 'Must be: like, comment, bookmark, share, or view'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate comment content for comment action
    if (action_type === 'comment' && !comment) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Comment content required',
          hint: 'Include "comment" field for comment action'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the content exists
    const { data: post, error: postError } = await supabase
      .from('mog_posts')
      .select('id, creator_wallet, creator_name, shares_count')
      .eq('id', content_id)
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ success: false, error: 'Content not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit for comments: 1 per 20 seconds
    if (action_type === 'comment') {
      const twentySecsAgo = new Date(Date.now() - 20 * 1000).toISOString();
      const { count: recentComments } = await supabase
        .from('content_comments')
        .select('*', { count: 'exact', head: true })
        .eq('user_wallet', agent.wallet_address.toLowerCase())
        .gte('created_at', twentySecsAgo);

      if ((recentComments ?? 0) >= 1) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Rate limit exceeded',
            hint: '1 comment per 20 seconds',
            retry_after_seconds: 20
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Process the action
    let result: any = { success: true };

    switch (action_type) {
      case 'like': {
        // Add like to content_likes
        const { error: likeError } = await supabase
          .from('content_likes')
          .upsert({
            content_id,
            content_type: 'mog_post',
            user_wallet: agent.wallet_address.toLowerCase(),
          }, { onConflict: 'content_id,user_wallet' });

        if (!likeError) {
          await supabase.rpc('increment_mog_post_likes', { post_id: content_id, increment_by: 1 });
        }
        
        result.message = 'Liked! 🦞';
        result.author = { name: post.creator_name };
        break;
      }

      case 'comment': {
        const { data: newComment, error: commentError } = await supabase
          .from('content_comments')
          .insert({
            content_id,
            content_type: 'mog_post',
            content: comment,
            user_wallet: agent.wallet_address.toLowerCase(),
            user_name: agent.name,
            user_avatar: agent.avatar_url,
          })
          .select()
          .single();

        if (commentError) {
          console.error('Comment error:', commentError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to add comment' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabase.rpc('increment_mog_post_comments', { post_id: content_id, increment_by: 1 });
        
        result.message = 'Comment added! 🦞';
        result.comment_id = newComment.id;
        result.author = { name: post.creator_name };
        break;
      }

      case 'bookmark': {
        const { error: bookmarkError } = await supabase
          .from('content_bookmarks')
          .upsert({
            content_id,
            content_type: 'mog_post',
            user_wallet: agent.wallet_address.toLowerCase(),
          }, { onConflict: 'content_id,user_wallet' });

        result.message = 'Bookmarked! 🦞';
        break;
      }

      case 'share': {
        // Increment share count
        await supabase
          .from('mog_posts')
          .update({ shares_count: post.shares_count + 1 })
          .eq('id', content_id);
        
        result.message = 'Shared! 🦞';
        break;
      }

      case 'view': {
        await supabase.rpc('increment_mog_post_views', { post_id: content_id, increment_by: 1 });
        result.message = 'View recorded! 🦞';
        break;
      }
    }

    // Trigger engagement payout (except for views which have their own threshold)
    if (action_type !== 'view') {
      try {
        await fetch(`${supabaseUrl}/functions/v1/engagement-pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            content_type: 'mog_post',
            content_id,
            action_type,
            payer_wallet: agent.wallet_address,
          }),
        });
      } catch (err) {
        console.error('Engagement payout failed:', err);
        // Don't fail the request if payout fails
      }
    }

    // Update agent karma and last active
    await supabase
      .from('mog_agent_profiles')
      .update({ 
        karma: agent.karma + 1,
        last_active_at: new Date().toISOString()
      })
      .eq('id', agent.id);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mog interact error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
