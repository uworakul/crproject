import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` auto-writes an "AI agent rules" block into CLAUDE.md on every
  // start. Once, a sentence in CLAUDE.md that quoted its marker comment
  // (to explain what it looks like) confused the generator and it deleted
  // an unrelated section. Disabled — CLAUDE.md is actively maintained by
  // hand here and shouldn't be auto-mutated by the dev server.
  agentRules: false,
};

export default nextConfig;
