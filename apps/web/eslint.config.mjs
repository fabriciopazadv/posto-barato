/**
 * Lint do PWA.
 *
 * O repositório já declarava as dependências de lint do Next, mas nada as
 * carregava: sem config aqui, o `next lint` subia até o flat config da raiz,
 * que não conhece as regras `@next/next/*`. Os `eslint-disable` dessas regras
 * (usados onde o `<img>` cru é proposital — o app é exportado estaticamente,
 * sem o otimizador de imagem do Next) passavam então a apontar para regra
 * inexistente, e ESLint trata isso como erro: o lint do app inteiro quebrava
 * por causa de comentários que deveriam ser inócuos.
 *
 * Registrando o plugin de fato, as regras do Next passam a valer de verdade e
 * as exceções pontuais voltam a ser exceções.
 */
import next from '@next/eslint-plugin-next';

import root from '../../eslint.config.mjs';

export default [
  ...root,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },
];
