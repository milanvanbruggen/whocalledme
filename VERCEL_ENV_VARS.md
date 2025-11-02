# Vercel Environment Variables

Deze environment variabelen moeten worden toegevoegd aan je Vercel project instellingen:

## Verplichte variabelen (vereist voor build en runtime)

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` - Je Supabase project URL (publiek, beschikbaar in client)
- `SUPABASE_SERVICE_ROLE_KEY` - Je Supabase service role key (alleen server-side, nooit in client)

### ElevenLabs
- `ELEVENLABS_API_KEY` - Je ElevenLabs API key voor outbound calls
- `ELEVENLABS_AGENT_ID` - Je ElevenLabs agent ID
- `ELEVENLABS_PHONE_NUMBER_ID` - Je ElevenLabs phone number ID
- `ELEVENLABS_WEBHOOK_SECRET` - Secret voor webhook verificatie (optioneel maar aanbevolen)

## Optionele variabelen (voor development/debugging)

### Debug Mode
- `DEV_DEBUG` - Zet op `true` voor mock calls (geen API kosten), op `false` voor real ElevenLabs calls (server-side)
- `NEXT_PUBLIC_DEV_DEBUG` - Zet op `true` om dev-only UI elementen te tonen (client-side)

**Let op:** 
- `DEV_DEBUG=true` → mock calls (geen kosten)
- `DEV_DEBUG=false` of niet gezet → echte ElevenLabs calls
- In production worden altijd echte calls gebruikt, ongeacht `DEV_DEBUG` setting
- `DEV_DEBUG` controleert ook automatisch de zichtbaarheid van dev tools in de UI

## Waarom deze nodig zijn

1. **NEXT_PUBLIC_SUPABASE_URL** - Gebruikt door `lib/supabase/admin.ts` tijdens build tijd (bijvoorbeeld in `/api/test/reset-db`)
2. **SUPABASE_SERVICE_ROLE_KEY** - Noodzakelijk voor admin operaties zoals database resets en profiel updates
3. **ELEVENLABS_* variabelen** - Vereist voor het maken van outbound calls en webhook verificatie

## Hoe toe te voegen in Vercel

1. Ga naar je Vercel project dashboard
2. Navigeer naar **Settings** → **Environment Variables**
3. Voeg elke variabele toe met de juiste waarde
4. Zorg ervoor dat je de variabelen toevoegt voor alle environments (Production, Preview, Development)
5. Redeploy na het toevoegen van de variabelen

