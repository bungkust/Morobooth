# Validate Download Edge Function

This Supabase Edge Function validates photo download requests with:
- Access token validation
- Rate limiting (10 requests/minute per IP)
- Expiration checking
- Access logging
- Signed URL generation

## Deployment

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link project: `supabase link --project-ref your-project-ref`
4. Deploy: `supabase functions deploy validate-download`

## Environment Variables

Set these in Supabase Dashboard > Project Settings > Edge Functions:
- `SUPABASE_URL`: Your Supabase project URL (automatically available)
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (for database access)

Note: These are usually set automatically by Supabase, but you can verify them in the dashboard.

## Usage

```
GET /functions/v1/validate-download?photoId={uuid}&token={accessToken}
```

## Response

Success (200):
```json
{
  "signedUrl": "https://...",
  "expiresIn": 3600
}
```

Error (401/403/404/429/500):
```json
{
  "error": "Error message"
}
```
