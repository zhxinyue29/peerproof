import type { NextConfig } from "next";

// Every page is a client component reading straight from an RPC, so there is no server to run.
// A static export means this can be hosted anywhere — Cloudflare Pages, GitHub Pages, a plain
// bucket — which also removes the hosting provider from the list of things that must stay up.
//
// Consequence worth knowing: `NEXT_PUBLIC_*` values are inlined into the bundle at build time,
// wherever they are referenced. A runtime `if (isLocalChain)` guard does not keep a key out of
// the JavaScript. So the dev keys must simply be absent from any build that ships.
const DEV_KEY_VARS = [
  "NEXT_PUBLIC_DEV_BEACON_PK",
  "NEXT_PUBLIC_DEV_FUNDER_PK",
  "NEXT_PUBLIC_DEV_PEER_PK",
  "NEXT_PUBLIC_DEV_PEER_PKS",
];

if (process.env.NEXT_PUBLIC_CHAIN !== "local") {
  const leaked = DEV_KEY_VARS.filter((v) => process.env[v]);
  if (leaked.length) {
    throw new Error(
      `Refusing to build: ${leaked.join(", ")} would be inlined into public JavaScript.\n` +
        `These belong to local development only. Unset them, or set NEXT_PUBLIC_CHAIN=local.`,
    );
  }
}

// GitHub Pages serves a project repo under /<repo>/, so assets need a prefix there. Cloudflare
// Pages serves from the root and wants this empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // Static hosts map /floor to /floor/index.html rather than /floor.html.
  trailingSlash: true,
};

export default nextConfig;
