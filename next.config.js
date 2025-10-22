/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // Remove X-Powered-By header for security

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_APP_NAME: 'Moonlit Claims',
    NEXT_PUBLIC_APP_VERSION: '0.1.0',
  },

  // Webpack configuration to handle native Node modules
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      // Mark packages with native dependencies as externals for server-side
      // This prevents webpack from trying to bundle them
      config.externals = config.externals || [];
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'ssh2-sftp-client': 'commonjs ssh2-sftp-client',
        'cpu-features': 'commonjs cpu-features',
        'node-gyp-build': 'commonjs node-gyp-build',
      });
    } else {
      // Exclude native modules from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        zlib: false,
      };

      // Ignore ssh2 packages completely for client
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^ssh2(-sftp-client)?$/,
        })
      );
    }

    // Handle .node files globally
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    return config;
  },

  // HIPAA Compliance: Ensure secure headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
