// supabase/functions/stripe-webhook/index.ts
// Public endpoint registered in the Stripe Dashboard. Verifies the Stripe
// signature, then — and ONLY then — writes the paid boost into
// venue_boosts using the service_role key. This is the one and only place
// a venue_boosts row may be created (see supabase_venue_boosts_schema.sql —
// anon/authenticated have no insert grant on that table).
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? '', webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const venueId = session.metadata?.venue_id;
    const boostHours = Number(session.metadata?.boost_hours ?? '24');

    if (venueId) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + boostHours * 60 * 60 * 1000);

      // stripe_session_id has a unique constraint — a Stripe webhook retry
      // for the same event won't create a second boost.
      const { error } = await supabaseAdmin.from('venue_boosts').insert({
        venue_id: venueId,
        stripe_session_id: session.id,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      });

      if (error && error.code !== '23505') { // 23505 = unique_violation, i.e. a harmless retry
        console.error('Failed to insert boost:', error);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
