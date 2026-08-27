/**
 * NEXT_PUBLIC_-prefixed so it's readable from client components (the login
 * form calls the API directly from the browser, credentialed, per the CORS
 * setup in API_IMPLEMENTATION_DETAILS.md: Origin http://localhost:3001,
 * credentials: true). Server Components use the same URL for now too —
 * split this into a separate internal/server URL if Docker networking ever
 * puts the API behind a different hostname than the browser sees.
 */
const raw = process.env.NEXT_PUBLIC_API_URL;
export const API_URL = "http://localhost:3000";
