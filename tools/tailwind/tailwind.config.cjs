/**
 * Configuração do Tailwind do Posto Barato.
 *
 * Gerada a partir dos 17 blocos <script id="tailwind-config"> que o Google
 * Stitch embutia em cada tela (mesclados sem conflito). Substitui o Play CDN
 * (cdn.tailwindcss.com), que não é para produção.
 *
 * Rebuild:  pnpm css:build
 */
module.exports = {
  darkMode: 'class',
  content: ['./public/**/*.html'],
  theme: { extend: {
      "colors": {
          "tertiary-container": "#00b2d0",
          "on-error-container": "#93000a",
          "surface-container-highest": "#d9e3f4",
          "on-error": "#ffffff",
          "secondary": "#545f73",
          "secondary-fixed-dim": "#bcc7de",
          "surface-container": "#e5eeff",
          "tertiary-fixed-dim": "#4cd7f6",
          "on-surface-variant": "#3c4a42",
          "tertiary": "#00687a",
          "on-primary": "#ffffff",
          "secondary-fixed": "#d8e3fb",
          "on-tertiary-fixed": "#001f26",
          "on-surface": "#121c28",
          "surface": "#f8f9ff",
          "on-tertiary": "#ffffff",
          "surface-container-lowest": "#ffffff",
          "on-primary-fixed-variant": "#005236",
          "background": "#f8f9ff",
          "on-secondary-container": "#586377",
          "surface-tint": "#006c49",
          "primary": "#006c49",
          "on-secondary-fixed": "#111c2d",
          "tertiary-fixed": "#acedff",
          "on-background": "#121c28",
          "inverse-surface": "#27313e",
          "inverse-primary": "#4edea3",
          "on-primary-fixed": "#002113",
          "surface-variant": "#d9e3f4",
          "primary-container": "#10b981",
          "outline-variant": "#bbcabf",
          "surface-container-high": "#dfe9fa",
          "primary-fixed-dim": "#4edea3",
          "secondary-container": "#d5e0f8",
          "on-tertiary-container": "#003f4b",
          "inverse-on-surface": "#eaf1ff",
          "error-container": "#ffdad6",
          "surface-bright": "#f8f9ff",
          "on-secondary": "#ffffff",
          "primary-fixed": "#6ffbbe",
          "on-secondary-fixed-variant": "#3c475a",
          "error": "#ba1a1a",
          "surface-dim": "#d1dbec",
          "surface-container-low": "#eef4ff",
          "on-primary-container": "#00422b",
          "on-tertiary-fixed-variant": "#004e5c",
          "outline": "#6c7a71",
          "petrol-blue": "#003d4d",
          "vivid-green": "#10b981"
      },
      "borderRadius": {
          "DEFAULT": "0.25rem",
          "lg": "0.5rem",
          "xl": "0.75rem",
          "full": "9999px",
          "2xl": "1rem"
      },
      "spacing": {
          "lg": "24px",
          "xl": "32px",
          "md": "16px",
          "gutter": "12px",
          "container-margin": "16px",
          "xs": "4px",
          "sm": "8px",
          "safe": "env(safe-area-inset-bottom)"
      },
      "fontFamily": {
          "body-md": [
              "Inter",
              "system-ui",
              "-apple-system",
              "Segoe UI",
              "sans-serif"
          ],
          "headline-lg-mobile": [
              "Manrope",
              "Inter",
              "system-ui",
              "sans-serif"
          ],
          "headline-md": [
              "Manrope",
              "Inter",
              "system-ui",
              "sans-serif"
          ],
          "body-lg": [
              "Inter",
              "system-ui",
              "-apple-system",
              "Segoe UI",
              "sans-serif"
          ],
          "price-display": [
              "Manrope",
              "Inter",
              "system-ui",
              "sans-serif"
          ],
          "label-bold": [
              "Inter",
              "system-ui",
              "-apple-system",
              "Segoe UI",
              "sans-serif"
          ],
          "headline-lg": [
              "Manrope",
              "Inter",
              "system-ui",
              "sans-serif"
          ],
          "sans": [
              "Inter",
              "sans-serif",
              "system-ui",
              "-apple-system",
              "Segoe UI",
              "sans-serif"
          ],
          "heading": [
              "Manrope",
              "sans-serif",
              "Inter",
              "system-ui",
              "sans-serif"
          ]
      },
      "fontSize": {
          "body-md": [
              "14px",
              {
                  "lineHeight": "20px",
                  "fontWeight": "400"
              }
          ],
          "headline-lg-mobile": [
              "24px",
              {
                  "lineHeight": "32px",
                  "letterSpacing": "-0.02em",
                  "fontWeight": "800"
              }
          ],
          "headline-md": [
              "20px",
              {
                  "lineHeight": "28px",
                  "fontWeight": "700"
              }
          ],
          "body-lg": [
              "16px",
              {
                  "lineHeight": "24px",
                  "fontWeight": "400"
              }
          ],
          "price-display": [
              "24px",
              {
                  "lineHeight": "24px",
                  "letterSpacing": "-0.01em",
                  "fontWeight": "800"
              }
          ],
          "label-bold": [
              "12px",
              {
                  "lineHeight": "16px",
                  "fontWeight": "700"
              }
          ],
          "headline-lg": [
              "32px",
              {
                  "lineHeight": "40px",
                  "letterSpacing": "-0.02em",
                  "fontWeight": "800"
              }
          ]
      },
      "animation": {
          "shimmer": "shimmer 2s linear infinite",
          "scale-in": "scale-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
          "fade-in-up": "fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          "gradient-shift": "gradient-shift 8s ease infinite"
      },
      "keyframes": {
          "shimmer": {
              "from": {
                  "backgroundPosition": "0 0"
              },
              "to": {
                  "backgroundPosition": "-200% 0"
              }
          },
          "scale-in": {
              "0%": {
                  "transform": "scale(0)",
                  "opacity": "0"
              },
              "100%": {
                  "transform": "scale(1)",
                  "opacity": "1"
              }
          },
          "fade-in-up": {
              "0%": {
                  "opacity": "0",
                  "transform": "translateY(20px)"
              },
              "100%": {
                  "opacity": "1",
                  "transform": "translateY(0)"
              }
          },
          "gradient-shift": {
              "0%, 100%": {
                  "backgroundPosition": "0% 50%"
              },
              "50%": {
                  "backgroundPosition": "100% 50%"
              }
          }
      }
  } },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
