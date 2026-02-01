/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile Ant Design packages
  transpilePackages: ['antd', '@ant-design/icons', '@ant-design/nextjs-registry'],

  // Optimize for production
  compress: true,

  // Disable production source maps
  productionBrowserSourceMaps: false,

  // Enable React Compiler for automatic memoization (Next.js 16 feature)
  // Note: Moved from experimental in Next.js 16+
  reactCompiler: true,
};

module.exports = nextConfig;
