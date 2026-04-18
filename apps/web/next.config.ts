import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ui-avatars.com' },
    ],
  },
  // pptxgenjs (dynamically imported on the Dashboard for "Export to PPT")
  // conditionally references Node builtins like `node:fs` / `node:https` for
  // its Node codepath. In the browser bundle those branches are unreachable,
  // but Webpack 5 handles the `node:` scheme specially and short-circuits our
  // `resolve.alias`, so we:
  //   1) strip the `node:` prefix with NormalModuleReplacementPlugin, then
  //   2) map the bare module names (`fs`, `https`, …) to `false` via
  //      resolve.fallback so they compile out of the browser bundle.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        https: false,
        http: false,
        path: false,
        stream: false,
        zlib: false,
        buffer: false,
        url: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
