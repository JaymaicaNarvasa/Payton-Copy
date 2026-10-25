# Payton Admin Panel

```bash
npm install
cp .env.example .env.local    # then fill in the two VITE_ values
npm run dev                   # http://localhost:5173
npm run build                 # output in dist/
```
Requires `supabase/migrations/001_admin_foundation.sql` and the `admin-set-status` Edge Function to be applied first.
