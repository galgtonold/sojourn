// Runs before each test file's module graph. Provide just enough env so the
// AI/Supabase modules load. `??=` preserves any real values already present, so
// the opt-in live test (which needs a real DEEPSEEK_API_KEY) still works.
process.env.DEEPSEEK_API_KEY ??= "test-key";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
