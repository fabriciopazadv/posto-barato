# Posto Barato Coletor

Sistema privado da primeira fase do Posto Barato para pesquisa de mercado, coleta de preços visíveis na página Menor Preço do Nota MT, normalização e armazenamento no **Banco de Dados Posto Barato**.

## Arquitetura
Página de pesquisa → navegador Playwright com sessão legítima → extração DOM visível → normalização/validação → PostgreSQL/Prisma → futura API própria.

## Limites
Não automatiza senha, não armazena credenciais, não contorna captcha/bloqueios, não acessa notas fiscais/endpoints privados e não expõe sessão ou evidências ao app futuro.

## Instalação
`pnpm install`; copie `.env.example` para `.env`; suba `docker compose up -d`; rode `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`.

## Comandos
`pnpm auth`, `pnpm diagnose`, `pnpm collect`, `pnpm collect -- --municipality="Rondonópolis" --product="etanol"`, `pnpm collect:all`, `pnpm report:last`, `pnpm report:daily`, `pnpm scheduler`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Login manual e perfil
`pnpm auth` abre Chromium com `launchPersistentContext` usando `BROWSER_PROFILE_DIR`. Faça login manualmente e pressione ENTER. Exclua o perfil removendo `storage/browser-profile/`.

## Evidências, logs e segurança
Evidências ficam em `storage/evidence` e snapshots em `storage/html-snapshots`, ambos ignorados no Git. Screenshots são tentados apenas na área de resultados. Logs Pino usam redaction para cookies, tokens, senha e headers.

## Windows
Use PowerShell, Docker Desktop e caminhos relativos do `.env.example`. Os scripts são Node/tsx, sem dependência de Bash.

## Problemas
Captcha, logout, 2FA, bloqueio ou alteração crítica de layout interrompem a execução e exigem intervenção manual. Use `pnpm diagnose` para revisar seletores.
