import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Payout rates in $5DEE tokens
const PAYOUT_RATES: Record<string, number> = {
  view: 1,
  like: 5,
  comment: 10,
  share: 3,
  bookmark: 2,
};

const FIVE_DEE_CONTRACT = "0x954fA8cfb797a26D4878ee212004889a2C9D7624";

function generateMockTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // --- JWT Authentication ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await authClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      console.error('Auth failed:', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;
    // --- End Authentication ---

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { content_type, content_id, action_type, payer_wallet } = await req.json();

    if (!content_type || !content_id || !action_type || !payer_wallet) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!PAYOUT_RATES[action_type]) {
      return new Response(
        JSON.stringify({ error: 'Invalid action type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the payer_wallet belongs to the authenticated user
    const { data: walletUser } = await supabase
      .from('wallet_users')
      .select('wallet_address')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', userId)
      .maybeSingle();

    const userWallet = walletUser?.wallet_address || profile?.wallet_address;
    if (!userWallet || userWallet.toLowerCase() !== payer_wallet.toLowerCase()) {
      console.error('Wallet mismatch: authenticated user wallet does not match payer_wallet');
      return new Response(
        JSON.stringify({ error: 'Wallet address does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payout config
    const { data: configData } = await supabase
      .from('token_config')
      .select('payout_amount, is_enabled, daily_cap_per_user')
      .eq('action_type', action_type)
      .single();

    const payoutAmount = configData?.payout_amount ?? PAYOUT_RATES[action_type];
    const isEnabled = configData?.is_enabled ?? true;
    const dailyCap = configData?.daily_cap_per_user ?? 100;

    if (!isEnabled) {
      return new Response(
        JSON.stringify({ error: 'Payouts disabled for this action type' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get creator wallet from content
    let tableName: string;
    let walletField: string;
    
    if (content_type === 'track') {
      tableName = 'music_tracks';
      walletField = 'artist_wallet';
    } else if (content_type === 'video') {
      tableName = 'music_videos';
      walletField = 'artist_wallet';
    } else if (content_type === 'mog_post') {
      tableName = 'mog_posts';
      walletField = 'creator_wallet';
    } else {
      tableName = 'articles';
      walletField = 'author_wallet';
    }
    
    const { data: content, error: contentError } = await supabase
      .from(tableName)
      .select(`id, ${walletField}`)
      .eq('id', content_id)
      .single();

    if (contentError || !content) {
      console.error('Content not found:', contentError);
      return new Response(
        JSON.stringify({ error: 'Content not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const creatorWallet = (content as any)[walletField];
    
    if (!creatorWallet) {
      return new Response(
        JSON.stringify({ error: 'Creator wallet not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Anti-abuse: no self-pay
    if (payer_wallet.toLowerCase() === creatorWallet.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Cannot earn from own content', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: daily cap
    const today = new Date().toISOString().split('T')[0];
    const { count: dailyCount } = await supabase
      .from('engagement_payouts')
      .select('*', { count: 'exact', head: true })
      .eq('payer_wallet', payer_wallet.toLowerCase())
      .gte('created_at', `${today}T00:00:00Z`);

    if ((dailyCount ?? 0) >= dailyCap) {
      return new Response(
        JSON.stringify({ error: 'Daily payout limit reached', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Duplicate check
    const { data: existingPayout } = await supabase
      .from('engagement_payouts')
      .select('id')
      .eq('content_type', content_type)
      .eq('content_id', content_id)
      .eq('action_type', action_type)
      .eq('payer_wallet', payer_wallet.toLowerCase())
      .maybeSingle();

    if (existingPayout) {
      return new Response(
        JSON.stringify({ error: 'Already rewarded for this action', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simulation mode
    const mockTxHash = generateMockTxHash();
    
    console.log(`[SIMULATION] Payout: ${action_type} ${payoutAmount} $5DEE | ${payer_wallet} -> ${creatorWallet} | user: ${userId}`);

    const { data: payout, error: payoutError } = await supabase
      .from('engagement_payouts')
      .insert({
        content_type,
        content_id,
        action_type,
        payer_wallet: payer_wallet.toLowerCase(),
        creator_wallet: creatorWallet.toLowerCase(),
        amount: payoutAmount,
        tx_hash: mockTxHash,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payoutError) {
      console.error('Error logging payout:', payoutError);
      return new Response(
        JSON.stringify({ error: 'Failed to log payout' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        simulation: true,
        tx_hash: mockTxHash,
        amount: payoutAmount,
        creator_wallet: creatorWallet,
        payout_id: payout.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Engagement pay error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
