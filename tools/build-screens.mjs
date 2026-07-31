/**
 * Normaliza as telas exportadas do Google Stitch para produção.
 *
 * O export original dependia de CDNs de terceiros (Tailwind Play, Google Fonts)
 * e de URLs efêmeras de imagem do Stitch, além de trazer links mortos e
 * problemas de acessibilidade. Este script é idempotente: rodar de novo em um
 * arquivo já processado não muda nada.
 *
 * Uso:  node tools/build-screens.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = path.join(ROOT, 'public/screens');
const CHECK = process.argv.includes('--check');

const CODEPOINTS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools/icon-codepoints.json'), 'utf8'),
);

/** Rótulos pt-BR para ícones que aparecem sozinhos dentro de botões/links. */
const ICON_LABELS = {
  arrow_back: 'Voltar', arrow_forward: 'Avançar', search: 'Buscar', menu: 'Menu',
  more_vert: 'Mais opções', mic: 'Busca por voz', share: 'Compartilhar',
  favorite: 'Favoritar', star: 'Avaliar', settings: 'Configurações',
  my_location: 'Minha localização', filter_list: 'Filtrar', tune: 'Ajustar filtros',
  add: 'Adicionar', remove: 'Remover', edit_note: 'Editar', person: 'Perfil',
  home: 'Início', explore: 'Explorar', navigation: 'Navegar', directions: 'Rotas',
  visibility_off: 'Mostrar senha', chevron_right: 'Abrir', account_circle: 'Conta',
  notifications_active: 'Alertas', history: 'Histórico', lock: 'Senha', mail: 'E-mail',
  bookmark_add: 'Salvar', compare_arrows: 'Comparar', calculate: 'Calcular',
  local_gas_station: 'Postos', sell: 'Preços', card_membership: 'Assinatura',
  manage_accounts: 'Configurações da conta', help_outline: 'Ajuda',
  workspace_premium: 'Premium', format_list_bulleted: 'Lista', schedule: 'Horário',
  ev_charger: 'Recarga', electric_bolt: 'Elétrico', electric_car: 'Carro elétrico',
  directions_car: 'Veículo', location_on: 'Local', check_circle: 'Confirmado',
  verified: 'Verificado', timer: 'Tempo', avg_time: 'Tempo médio',
  trending_down: 'Em queda', trending_up: 'Em alta', database: 'Fonte de dados',
  horizontal_rule: 'Estável', arrow_drop_down: 'Abrir seleção',
};

/**
 * Barra de navegação inferior → telas reais da galeria.
 * Chaveado pelo ícone, que é estável entre as telas.
 */
const NAV_TARGETS = {
  home: '/screens/app/01-home/',
  explore: '/screens/app/02-mapa/',
  compare_arrows: '/screens/app/04-comparador/',
  person: '/screens/app/05-perfil-veiculos/',
  local_gas_station: '/screens/app/02-mapa/',
  sell: '/screens/app/04-comparador/',
  card_membership: '/screens/assinatura/01-premium/',
};

/** Rótulos da nav que vieram em inglês no export (produto é pt-BR). */
const NAV_LABEL_PT = {
  Home: 'Início', Explore: 'Explorar', Compare: 'Comparar',
  Favorites: 'Favoritos', Profile: 'Perfil',
  'Fuel Rewards': 'Programa de Pontos', 'Station Services': 'Serviços do Posto',
  Settings: 'Configurações', Help: 'Ajuda',
};

/** Imagens do Stitch (URLs efêmeras) → assets locais. */
function localImage(tag) {
  const t = tag.toLowerCase();
  if (t.includes('posto barato logo')) {
    return t.includes('rounded-full')
      ? { src: '/assets/img/logo-mark.svg', alt: 'Posto Barato' }
      : { src: '/assets/img/logo.webp', alt: 'Posto Barato' };
  }
  if (t.includes('headshot') || t.includes('profile') || t.includes('professional'))
    return { src: '/assets/img/avatar.svg', alt: 'Foto de perfil' };
  if (t.includes('fuel pump') || t.includes('ev charger'))
    return { src: '/assets/img/illus-combustivel-ev.svg', alt: 'Bomba de combustível e carregador elétrico' };
  return { src: '/assets/img/illus-economia-rota.svg', alt: 'Rota com economia no abastecimento' };
}

const HEAD_ASSETS = `<link rel="preload" href="/assets/fonts/inter-latin-f11d729b.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/app.css"/>
<link rel="icon" href="/assets/img/logo-mark.svg" type="image/svg+xml"/>
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png"/>
<meta name="theme-color" content="#006c49"/>
<meta name="robots" content="noindex, nofollow"/>`;

const BACK_LINK = `<a href="/" class="pb-back-galeria" title="Voltar para a galeria de telas">
<span aria-hidden="true">&#x2190;</span> Galeria
</a>`;

// Aba na borda esquerda, à meia altura: é a única região livre de controles em
// todas as 17 telas (o topo tem cabeçalho e o rodapé tem a barra de navegação).
const BACK_LINK_CSS = `<style>
.pb-back-galeria{position:fixed;left:0;top:50%;transform:translateY(-50%);
z-index:2147483647;display:inline-flex;align-items:center;gap:.3rem;
padding:.5rem .6rem .5rem .45rem;border-radius:0 9999px 9999px 0;
background:rgba(18,28,40,.8);color:#fff;font:600 11px/1 Inter,system-ui,sans-serif;
text-decoration:none;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
opacity:.45;transition:opacity .15s ease}
.pb-back-galeria:hover,.pb-back-galeria:focus-visible{opacity:1}
.pb-back-galeria:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media print{.pb-back-galeria{display:none}}
</style>`;

/** Títulos por tela: o export vinha com duplicados e alguns em inglês. */
const TITLES = {
  'onboarding/00-splash': 'Splash — Posto Barato',
  'onboarding/01-precos': 'Preços — Posto Barato',
  'onboarding/02-economia-real': 'Economia real — Posto Barato',
  'onboarding/03-combustivel-ev': 'Combustível e recarga elétrica — Posto Barato',
  'onboarding/04-precos-refinado': 'Preços (refinado) — Posto Barato',
  'onboarding/05-permissao-localizacao': 'Permissão de localização — Posto Barato',
  'onboarding/06-localizacao-refinado': 'Localização (refinado) — Posto Barato',
  'auth/01-login': 'Entrar — Posto Barato',
  'auth/02-login-refinado': 'Entrar (refinado) — Posto Barato',
  'app/01-home': 'Início — Posto Barato',
  'app/02-mapa': 'Mapa de postos — Posto Barato',
  'app/03-detalhes-posto': 'Detalhes do posto — Posto Barato',
  'app/04-comparador': 'Comparador de preços — Posto Barato',
  'app/05-perfil-veiculos': 'Perfil e veículos — Posto Barato',
  'app/06-mapa-recarga': 'Pontos de recarga elétrica — Posto Barato',
  'assinatura/01-premium': 'Premium — Posto Barato',
  'assinatura/02-economia-total': 'Economia total — Posto Barato',
};

/** Textos que ficaram em inglês no export (o produto é pt-BR). */
const TEXT_PT = {
  'Premium Member': 'Membro Premium',
  '120 Points Earned': '120 pontos acumulados',
  'Vivid Green Status': 'Status Verde',
  'Available Now': 'Disponível agora',
  // Tela de recarga elétrica
  'Filters': 'Filtros',
  'Fast Charge (&gt;50kW)': 'Carga rápida (&gt;50 kW)',
  'Operated by GreenGrid Network': 'Operado pela rede GreenGrid',
  '2.4 km away': 'a 2,4 km',
  'Available Connectors': 'Conectores disponíveis',
  'Up to 150kW': 'Até 150 kW',
  'Up to 22kW': 'Até 22 kW',
  'Available (2)': 'Disponíveis (2)',
  'In Use (1)': 'Em uso (1)',
  'Navigate': 'Navegar',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function transform(html, file) {
  const rel = path.relative(ROOT, file);
  const notes = [];
  let out = html;

  // 1. Remove dependências de terceiros -------------------------------------
  out = out.replace(/\s*<script src="https:\/\/cdn\.tailwindcss\.com[^"]*"><\/script>/g, () => {
    notes.push('tailwind-cdn'); return '';
  });
  out = out.replace(/\s*<script id="tailwind-config">[\s\S]*?<\/script>/g, '');
  out = out.replace(/\s*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, () => {
    notes.push('google-fonts'); return '';
  });
  // Scripts inline do Stitch: apenas console.log / setTimeout vazio. Removidos
  // para que a CSP possa usar script-src 'self' sem 'unsafe-inline'.
  out = out.replace(/\s*<script>\s*(?:\/\/[^\n]*\n\s*)?document\.addEventListener[\s\S]*?<\/script>/g, () => {
    notes.push('script-inline'); return '';
  });

  // 2. Injeta CSS/ícone locais no <head> ------------------------------------
  if (!out.includes('/assets/css/app.css')) {
    out = out.replace(/<\/head>/, `${HEAD_ASSETS}\n${BACK_LINK_CSS}\n</head>`);
  } else {
    // Já processado antes: mantém o bloco do link da galeria em dia.
    out = out.replace(/<style>\s*\.pb-back-galeria[\s\S]*?<\/style>/, BACK_LINK_CSS);
  }

  // 3. Imagens efêmeras do Stitch → assets locais ---------------------------
  out = out.replace(/<img\b[^>]*>/g, (tag) => {
    if (!tag.includes('lh3.googleusercontent.com')) return tag;
    notes.push('img-stitch');
    const { src, alt } = localImage(tag);
    let t = tag
      .replace(/\s*data-alt="[^"]*"/g, '')
      .replace(/src="https:\/\/lh3\.googleusercontent\.com[^"]*"/, `src="${src}"`)
      .replace(/\s*alt="[^"]*"/g, '');
    return t.replace(/<img\b/, `<img alt="${alt}" loading="lazy" decoding="async"`);
  });
  out = out.replace(
    /background-image:\s*url\('https:\/\/lh3\.googleusercontent\.com[^']*'\)/g,
    () => { notes.push('bg-stitch'); return "background-image: url('/assets/img/map-abstract.svg')"; },
  );
  // data-alt remanescente (prompt de IA) nos contêineres de background.
  out = out.replace(/\s*data-alt="[^"]*"/g, '');

  // 4. Ícones: ligadura → codepoint (a fonte foi subsetada por codepoint) ----
  out = out.replace(
    /(<span\b[^>]*material-symbols-outlined[^>]*>)\s*([a-z0-9_]+)\s*(<\/span>)/g,
    (m, open, name, close) => {
      const cp = CODEPOINTS[name];
      if (!cp) { notes.push(`icone-desconhecido:${name}`); return m; }
      const tagged = open.includes('aria-hidden')
        ? open
        : open.replace(/<span\b/, '<span aria-hidden="true" data-icon="' + name + '"');
      return `${tagged}&#x${cp.toString(16)};${close}`;
    },
  );

  // 5. Nome acessível para botões/links que só contêm ícone -----------------
  out = out.replace(
    /<(button|a)\b([^>]*)>(\s*<span\b[^>]*data-icon="([a-z0-9_]+)"[^>]*>&#x[0-9a-f]+;<\/span>\s*)<\/\1>/g,
    (m, tag, attrs, inner, icon) => {
      if (/aria-label=|title=/.test(attrs)) return m;
      const label = ICON_LABELS[icon];
      if (!label) { notes.push(`sem-rotulo:${icon}`); return m; }
      return `<${tag}${attrs} aria-label="${label}">${inner}</${tag}>`;
    },
  );

  // 6. Links mortos da navegação → telas reais ------------------------------
  out = out.replace(/<a\b([^>]*)href="#"([^>]*)>([\s\S]*?)<\/a>/g, (m, pre, post, inner) => {
    const icon = inner.match(/data-icon="([a-z0-9_]+)"/)?.[1];
    const target = icon && NAV_TARGETS[icon];
    if (!target) return m;
    // Não transforma o item que já representa a tela atual.
    if (file.includes(target.replace('/screens/', 'screens/'))) {
      notes.push('nav-atual');
      return `<a${pre}aria-current="page"${post}>${inner}</a>`;
    }
    notes.push('nav-ligada');
    return `<a${pre}href="${target}"${post}>${inner}</a>`;
  });

  // 7. Textos em inglês → pt-BR ---------------------------------------------
  for (const [en, pt] of Object.entries({ ...NAV_LABEL_PT, ...TEXT_PT })) {
    const re = new RegExp(`(>)\\s*${escapeRe(en)}\\s*(<)`, 'g');
    out = out.replace(re, (m, a, b) => { notes.push('label-pt'); return `${a}${pt}${b}`; });
  }

  // Título único e em pt-BR por tela (o export tinha duplicados e inglês).
  const key = rel.replace(/^public\/screens\//, '').replace(/\/index\.html$/, '');
  if (TITLES[key]) {
    out = out.replace(/<title>[^<]*<\/title>/, () => {
      notes.push('titulo'); return `<title>${TITLES[key]}</title>`;
    });
  } else {
    notes.push(`sem-titulo:${key}`);
  }

  // 8. <button> sem type dispara submit dentro de <form> --------------------
  out = out.replace(/<button\b([^>]*)>/g, (m, attrs) => {
    if (/\btype=/.test(attrs)) return m;
    notes.push('button-type');
    return `<button type="button"${attrs}>`;
  });

  // 9. Link de volta para a galeria -----------------------------------------
  if (!out.includes('pb-back-galeria"')) {
    out = out.replace(/<\/body>/, `${BACK_LINK}\n</body>`);
  }

  // 10. Meta description derivada do título ---------------------------------
  const nome = (out.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Posto Barato')
    .replace(/\s*—\s*Posto Barato$/, '');
  const desc = `<meta name="description" content="${nome} — protótipo de interface do aplicativo Posto Barato."/>`;
  out = /<meta name="description"[^>]*>/.test(out)
    ? out.replace(/<meta name="description"[^>]*>/, desc)
    : out.replace(/<\/head>/, `${desc}\n</head>`);

  return { out, notes, rel };
}

let changed = 0;
const summary = {};
for (const dir of fs.readdirSync(SCREENS)) {
  for (const screen of fs.readdirSync(path.join(SCREENS, dir))) {
    const file = path.join(SCREENS, dir, screen, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const { out, notes, rel } = transform(html, file);
    for (const n of notes) summary[n.split(':')[0]] = (summary[n.split(':')[0]] ?? 0) + 1;
    const unknown = notes.filter((n) => n.startsWith('icone-desconhecido') || n.startsWith('sem-rotulo'));
    if (unknown.length) console.warn(`  ! ${rel}: ${[...new Set(unknown)].join(', ')}`);
    if (out !== html) {
      changed++;
      if (!CHECK) fs.writeFileSync(file, out);
    }
  }
}

console.log(CHECK ? `${changed} telas mudariam` : `${changed} telas atualizadas`);
console.log('operações:', summary);
if (CHECK && changed) process.exit(1);
