// functions/api/moderate.js
// Cloudflare Pages Function — Free Multi-Modal Vision AI Image Moderation ("Kép-kukázó")
//
// Uses Cloudflare Workers AI (`env.AI` binding — 10,000 free Neurons/day, no credit card
// required) running Meta Llama 3.2 11B Vision (`@cf/meta/llama-3.2-11b-vision-instruct`)
// with fallback to LLaVA 1.5 7B (`@cf/llava-hf/llava-1.5-7b-hf`) or optional Gemini/Groq API.
//
// Strictly enforces EmoMap's safety policy:
//   ALLOWED:
//     - Everyday objects, doors, furniture, hands, palms, faces, selfies, food, streets, pets.
//     - Women in bikinis, swimsuits, thongs/tangas at the beach/pool (as long as female nipples/areola and genitals are covered).
//     - Shirtless men (male chest at beach, pool, gym, outdoors).
//   BLOCKED:
//     - Female breasts with visible nipples/areola, topless women (`nudity_explicit`).
//     - Male or female genitalia (penis, vulva/vagina), exposed anus, sexual acts (`nudity_explicit`).
//     - Child abuse, crying/distressed/beaten children, any minor in a sexualized or unsafe context (`child_safety`).
//     - Blood, open wounds, bleeding humans, mutilated bodies, corpses, dead humans, self-harm/suicide (`gore_violence`).
//     - Mutilated, bleeding, abused, or dead/roadkill animals (`animal_cruelty`).
//     - Hate symbols, terrorist propaganda, gun threats, hard drugs (`illegal_other`).

const MODERATION_PROMPT = `You are a strict, accurate content safety moderator for a social photo app.
Inspect this image carefully and classify whether it is ALLOWED or BLOCKED according to these exact rules:

ALLOWED (safe=true):
1. Normal everyday photos: doors, wood, walls, rooms, landscapes, food, drinks, cars, streets, parties.
2. Normal body parts: hands, palms, fingers, feet, faces, selfies.
3. Swimwear & beachwear: Women in bikinis, tangas/thongs, swimsuits, or underwear ARE ALLOWED as long as female nipples/areolas and genitals are covered.
4. Shirtless men: Bare male chests (at the beach, pool, gym, or outdoors) ARE ALLOWED.

BLOCKED (safe=false):
1. "nudity_explicit": Exposed female breasts with visible nipples/areolas (topless women), exposed male or female genitals (penis, vulva, vagina), exposed anus, or sexual acts.
2. "child_safety": Any child abuse, crying or distressed or injured child, or any minor in an undressed/unsafe context.
3. "gore_violence": Blood, open wounds, bleeding person, mutilated human body parts, dead human body/corpse, self-harm/cutting, suicide.
4. "animal_cruelty": Dead animal, animal corpse/carcass, mutilated or bleeding or abused animal.
5. "illegal_other": Extremist/hate symbols (swastika), gun pointed at camera, hard drug injection/snorting.

Respond ONLY with a single valid JSON object in this exact format, nothing else:
{"safe": true, "category": "clean", "shirtless_male": false}
or if blocked:
{"safe": false, "category": "nudity_explicit", "shirtless_male": false}`;

function parseVerdictJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const match = rawText.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.safe === 'boolean') {
      return {
        safe: parsed.safe,
        category: parsed.category || (parsed.safe ? 'clean' : 'nsfw_detected'),
        shirtless_male: Boolean(parsed.shirtless_male),
      };
    }
  } catch {
    // fallback keyword check if model replied in plain text
  }
  const lower = rawText.toLowerCase();
  if (
    lower.includes('"safe": false') ||
    lower.includes('"safe":false') ||
    lower.includes('nudity_explicit') ||
    lower.includes('child_safety') ||
    lower.includes('gore_violence') ||
    lower.includes('animal_cruelty') ||
    lower.includes('blocked')
  ) {
    let category = 'nsfw_detected';
    if (lower.includes('child_safety')) category = 'child_safety';
    else if (lower.includes('gore_violence')) category = 'gore_violence';
    else if (lower.includes('animal_cruelty')) category = 'animal_cruelty';
    else if (lower.includes('nudity_explicit')) category = 'nudity_explicit';
    return { safe: false, category, shirtless_male: false };
  }
  if (lower.includes('"safe": true') || lower.includes('"safe":true')) {
    return { safe: true, category: 'clean', shirtless_male: lower.includes('"shirtless_male": true') };
  }
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'missing_image' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Strip data URL prefix if present
    const cleanB64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryStr = atob(cleanB64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // 1. Primary: Cloudflare Workers AI binding (`env.AI`)
    if (env?.AI) {
      try {
        // Try Llama 3.2 11B Vision first
        const llamaRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: MODERATION_PROMPT },
                { type: 'image', image: Array.from(bytes) },
              ],
            },
          ],
          max_tokens: 90,
          temperature: 0.0,
        });

        const textOut = llamaRes?.response || llamaRes?.result?.response || JSON.stringify(llamaRes);
        const verdict = parseVerdictJson(textOut);
        if (verdict) {
          return new Response(
            JSON.stringify({ ok: true, engine: 'cf-llama-3.2-vision', ...verdict }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (llamaErr) {
        // Fallback to LLaVA 1.5 7B on Workers AI (doesn't require prior license agreement)
        try {
          const llavaRes = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
            image: Array.from(bytes),
            prompt: MODERATION_PROMPT,
            max_tokens: 90,
            temperature: 0.0,
          });
          const textOut = llavaRes?.description || llavaRes?.response || JSON.stringify(llavaRes);
          const verdict = parseVerdictJson(textOut);
          if (verdict) {
            return new Response(
              JSON.stringify({ ok: true, engine: 'cf-llava-1.5-7b', ...verdict }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } catch (llavaErr) {
          console.warn('[CF AI Moderation] LLaVA error:', llavaErr?.message);
        }
      }
    }

    // 2. Secondary: Optional free Gemini Flash Vision key (`env.GEMINI_API_KEY`)
    if (env?.GEMINI_API_KEY) {
      const gemUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;
      const gemRes = await fetch(gemUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: MODERATION_PROMPT },
                { inline_data: { mime_type: 'image/jpeg', data: cleanB64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0.0, maxOutputTokens: 90 },
        }),
      });
      if (gemRes.ok) {
        const gemJson = await gemRes.json();
        const textOut = gemJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const verdict = parseVerdictJson(textOut);
        if (verdict) {
          return new Response(
            JSON.stringify({ ok: true, engine: 'gemini-flash-vision', ...verdict }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: false, reason: 'no_cloud_binding' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'internal_error' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

