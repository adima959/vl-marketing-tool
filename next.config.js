/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker production builds
  output: 'standalone',

  // Transpile Ant Design packages
  transpilePackages: ['antd', '@ant-design/icons', '@ant-design/nextjs-registry'],

  // Optimize for production
  compress: true,

  // Disable production source maps
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
