/**
 * O app é 100% cliente: fala apenas com a API pública `/api/v1` e nunca tem
 * segredo do lado servidor. Por isso `output: 'export'` — estático puro, sem
 * funções serverless, servido direto do CDN do Netlify.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  // Export estático não roda o otimizador de imagem do Next.
  images: { unoptimized: true },
  // URLs com barra final casam com o `publish` estático do Netlify e evitam
  // redirects extras (`/inicio` → `/inicio/`).
  trailingSlash: true,
  transpilePackages: [
    '@posto-barato/design-system',
    '@posto-barato/domain',
    '@posto-barato/shared-types',
  ],
  eslint: { ignoreDuringBuilds: true },

  webpack: (config) => {
    // `packages/domain` e `packages/shared-types` são compilados pela API com
    // module NodeNext, que exige extensão `.js` nos imports relativos mesmo em
    // arquivos `.ts`. O bundler resolve por caminho real e não acha o `.js`,
    // então mapeamos a extensão de volta para os fontes TypeScript.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
