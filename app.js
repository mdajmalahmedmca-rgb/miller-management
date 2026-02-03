console.log("APP JS LOADED");

const SUPABASE_URL = "https://fqvldojgmuwjaepnjziu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdmxkb2pnbXV3amFlcG5qeml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjM0MTYsImV4cCI6MjA4NTU5OTQxNn0.l9UL5l8y065oRWznBXYytZh3AR7PHR9Bfs6jibomELE";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("SUPABASE CLIENT CREATED", supabaseClient);
