# Development Setup

## Ngrok Tunnel

Start the Next.js development server tunnel with ngrok using the fixed domain that is already whitelisted for the project:

```
ngrok http --domain=sharp-unlikely-hornet.ngrok-free.app 3000
```

This ensures external services can reliably reach your local instance at the expected hostname.

## Environment Variables

### `DEV_DEBUG`

Set to `true` to enable debug mode features:
- **Mock calls**: When `DEV_DEBUG=true`, the app will use mock calls instead of real ElevenLabs API calls (useful for testing without incurring API costs)
- **Dev-only UI elements**: Shows "Gegevens opschonen" and "Test Webhook Simulatie" blocks in the UI

Set to `false` or leave unset to:
- Use real ElevenLabs API calls (same as production behavior)
- Hide dev-only UI elements

```bash
# Server-side (for API calls)
DEV_DEBUG=true

# Client-side (for UI elements)
NEXT_PUBLIC_DEV_DEBUG=true
```

**Note:** 
- `DEV_DEBUG=true` → uses mock calls (no API costs)
- `DEV_DEBUG=false` or unset → uses real ElevenLabs API calls
- In production, real calls are always used regardless of `DEV_DEBUG` setting
- Both `DEV_DEBUG` (server-side) and `NEXT_PUBLIC_DEV_DEBUG` (client-side) can be set independently, but `DEV_DEBUG` also controls the visibility of dev tools in the UI

## Development Testing Endpoints

### Database Reset

`POST /api/test/reset-db`

Resets all test data in the database (development only). Deletes all records from:
- `call_attempts`
- `phone_lookups`
- `phone_profiles`

**Warning:** Only available in development mode. Returns 403 in production.

### Webhook Replay

`POST /api/test/replay-elevenlabs-webhook`

Simulates an ElevenLabs webhook for testing purposes. Can be used in two ways:

1. **Auto-generate payload**: Provide query parameters:
   ```
   POST /api/test/replay-elevenlabs-webhook?lookupId=<id>&callerName=<name>&status=<status>
   ```

2. **Custom payload**: POST raw JSON identical to ElevenLabs webhook format

The endpoint will:
- Generate a valid HMAC signature
- Forward the request to `/api/webhooks/elevenlabs`
- Return the response with debugging information

**Warning:** Only available in development mode. Returns 403 in production.

## Architecture Features

### Status Caching

The application uses an in-memory cache (`lib/cache/status-cache.ts`) for lookup status responses:

- **Active lookups**: 5 second TTL
- **Completed lookups**: 60 second TTL
- **ETag support**: Clients can use `If-None-Match` header for conditional requests (304 Not Modified)
- **Cache invalidation**: Automatically invalidated when data changes via `invalidateCache()` calls

The status endpoint (`/api/lookups/[id]/status`) implements:
- ETag generation based on `updated_at` timestamps
- 304 Not Modified responses for unchanged data
- Cache-Control headers for proper browser caching

### Database Consistency Retry Logic

The status endpoint includes retry logic to handle Supabase read-after-write consistency:

- Initial 500ms delay after lookup creation
- Up to 10 retries (1 second intervals) if data appears stale
- Detects stale data scenarios:
  - Lookup status changed but call attempt hasn't updated
  - Lookup marked as "cached" but call attempt still "scheduled"
  - Post-call transcription received but summary/transcript missing

### Call Progress Component

The `CallProgress` component (`components/call-progress.tsx`) displays real-time call status:

- **Three stages**:
  1. Call ingepland (scheduled)
  2. Analyse & transcript (analyzing)
  3. Resultaat beschikbaar (completed)

- **Status detection**: Analyzes multiple status sources:
  - `call_attempt.status`
  - `call_attempt.elevenlabs_status`
  - `call_attempt.payload.event`
  - `call_attempt.payload.type`
  - `lookup.status`

- **Progress calculation**: Based on completed stages and active stage index

### Webhook Processing

The ElevenLabs webhook handler (`app/api/webhooks/elevenlabs/route.ts`) includes:

- **HMAC signature verification**: Validates webhook authenticity
- **Multiple event types**: Handles initiation, conversation, and post-call events
- **Lookup ID resolution**: Tries multiple sources:
  - Metadata `lookupId`
  - Dynamic variables from conversation initiation
  - Conversation ID lookup from existing call attempts
  - Latest lookup by normalized phone number
- **Initiation event handling**: Updates call attempt status when call starts
- **Post-call processing**: Extracts caller name, entity type, transcript, and summary
- **Profile creation**: Automatically creates/updates phone profiles with:
  - Caller name (from ElevenLabs agent output or fallback heuristics)
  - Entity type (Bedrijf/Particulier)
  - Transcript and summary
  - Confidence score
  - Tags and aliases

