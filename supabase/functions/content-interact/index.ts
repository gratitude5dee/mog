import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
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

    // Get wallet from header
    const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase();
    if (!walletAddress) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing wallet address', hint: 'Include x-wallet-address header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action_type, content_type, content_id, comment, user_name } = body;

    // Validate required fields
    if (!action_type || !content_type || !content_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields', hint: 'Required: action_type, content_type, content_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validActions = ['like', 'unlike', 'bookmark', 'unbookmark', 'comment', 'follow', 'unfollow'];
    if (!validActions.includes(action_type)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: any = { success: true };

    switch (action_type) {
      case 'like': {
        const { error } = await supabase
          .from(content_type === 'mog_post' ? 'mog_likes' : 'content_likes')
          .upsert(
            content_type === 'mog_post'
              ? { post_id: content_id, user_wallet: walletAddress }
              : { content_id, content_type, user_wallet: walletAddress },
            { onConflict: content_type === 'mog_post' ? 'post_id,user_wallet' : 'content_id,user_wallet' }
          );
        if (error) throw error;
        result.message = 'Liked!';
        break;
      }

      case 'unlike': {
        const table = content_type === 'mog_post' ? 'mog_likes' : 'content_likes';
        const query = supabase.from(table).delete().eq('user_wallet', walletAddress);
        if (content_type === 'mog_post') {
          query.eq('post_id', content_id);
        } else {
          query.eq('content_id', content_id).eq('content_type', content_type);
        }
        const { error } = await query;
        if (error) throw error;
        result.message = 'Unliked';
        break;
      }

      case 'bookmark': {
        const { error } = await supabase
          .from(content_type === 'mog_post' ? 'mog_bookmarks' : 'content_bookmarks')
          .upsert(
            content_type === 'mog_post'
              ? { post_id: content_id, user_wallet: walletAddress }
              : { content_id, content_type, user_wallet: walletAddress },
            { onConflict: content_type === 'mog_post' ? 'post_id,user_wallet' : 'content_id,user_wallet' }
          );
        if (error) throw error;
        result.message = 'Bookmarked!';
        break;
      }

      case 'unbookmark': {
        const table = content_type === 'mog_post' ? 'mog_bookmarks' : 'content_bookmarks';
        const query = supabase.from(table).delete().eq('user_wallet', walletAddress);
        if (content_type === 'mog_post') {
          query.eq('post_id', content_id);
        } else {
          query.eq('content_id', content_id).eq('content_type', content_type);
        }
        const { error } = await query;
        if (error) throw error;
        result.message = 'Unbookmarked';
        break;
      }

      case 'comment': {
        if (!comment) {
          return new Response(
            JSON.stringify({ success: false, error: 'Comment content required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: newComment, error } = await supabase
          .from('content_comments')
          .insert({
            content_id,
            content_type,
            content: comment,
            user_wallet: walletAddress,
            user_name: user_name || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
          })
          .select()
          .single();

        if (error) throw error;
        result.message = 'Comment added!';
        result.comment_id = newComment.id;
        break;
      }

      case 'follow': {
        const { error } = await supabase
          .from('mog_follows')
          .upsert({
            follower_wallet: walletAddress,
            following_wallet: content_id, // content_id is the wallet to follow
          }, { onConflict: 'follower_wallet,following_wallet' });
        if (error) throw error;
        result.message = 'Following!';
        break;
      }

      case 'unfollow': {
        const { error } = await supabase
          .from('mog_follows')
          .delete()
          .eq('follower_wallet', walletAddress)
          .eq('following_wallet', content_id);
        if (error) throw error;
        result.message = 'Unfollowed';
        break;
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Content interact error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
