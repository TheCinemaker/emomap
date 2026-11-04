// supabase/functions/create-boost-checkout/index.ts
// Creates a Stripe Checkout Session for boosting one venue. Called from the
// frontend with the signed-in user's JWT (supabase.functions.invoke sets
// this automatically). Only the venue's own owner may buy a boost for it —
// enforced here, not just trusted from the client.
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const BOOST_PRICE_ID = Deno.env.get('STRIPE_BOOST_PRICE_ID')!; // a Stripe Price id, not a product id
const BOOST_HOURS = 24;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://emomap.pages.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders });
  }

  let venue_id: string | undefined;
  try {
    ({ venue_id } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders });
  }
  if (!venue_id) {
    return new Response(JSON.stringify({ error: 'venue_id required' }), { status: 400, headers: corsHeaders });
  }

  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .select('id, owner_id, name')
    .eq('id', venue_id)
    .single();

  if (venueError || !venue || venue.owner_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: 'Venue not found or not yours' }), { status: 403, headers: corsHeaders });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: BOOST_PRICE_ID, quantity: 1 }],
    success_url: `${APP_URL}/?boost=success`,
    cancel_url: `${APP_URL}/?boost=cancelled`,
    metadata: { venue_id, boost_hours: String(BOOST_HOURS) },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
