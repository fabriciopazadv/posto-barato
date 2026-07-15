# Posto Barato — Mobilidade e Economia

Protótipos de interface (UI) do aplicativo **Posto Barato**, um app de comparação
de preços de combustível e mobilidade, focado em ajudar motoristas a economizar
encontrando os postos mais baratos e pontos de recarga de veículos elétricos (EV)
por perto.

As telas foram geradas com **[Google Stitch](https://stitch.withgoogle.com/)** e
exportadas como páginas HTML autônomas (Tailwind via CDN) acompanhadas de um
_preview_ em PNG. Este repositório organiza esse export em uma estrutura navegável.

## Como visualizar

Cada tela é um `index.html` autocontido — basta abrir no navegador. Para ver todas
as telas em uma galeria única, abra o `index.html` na raiz do projeto:

```bash
# opção simples: abrir direto
open index.html            # macOS
xdg-open index.html        # Linux

# ou servir localmente (recomendado)
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

> As telas usam Tailwind, Google Fonts e Material Symbols via CDN, portanto exigem
> conexão com a internet para renderizar com o estilo completo.

## Estrutura do repositório

```
.
├── index.html              # Galeria com todas as telas
├── README.md
├── assets/
│   └── logo.png            # Logo do app
├── design-system/
│   └── DESIGN.md           # Tokens (cores, tipografia, espaçamento) e diretrizes
└── screens/                # Telas agrupadas por fluxo
    ├── onboarding/         # Splash, apresentação e permissões
    ├── auth/               # Login
    ├── app/                # Telas principais do app
    └── assinatura/         # Planos e assinatura premium
```

Cada pasta de tela contém:

- `index.html` — código da tela (renderizável no navegador)
- `preview.png` — captura estática da tela

## Telas

### Onboarding
| # | Tela | Descrição |
|---|------|-----------|
| 00 | [Splash](screens/onboarding/00-splash/) | Tela de abertura |
| 01 | [Preços](screens/onboarding/01-precos/) | Apresentação: comparação de preços |
| 02 | [Economia real](screens/onboarding/02-economia-real/) | Apresentação: economia comprovada |
| 03 | [Combustível & EV](screens/onboarding/03-combustivel-ev/) | Apresentação: combustível e recarga elétrica |
| 04 | [Preços (refinado)](screens/onboarding/04-precos-refinado/) | Versão refinada da tela de preços |
| 05 | [Permissão de localização](screens/onboarding/05-permissao-localizacao/) | Solicitação de acesso à localização |
| 06 | [Localização (refinado)](screens/onboarding/06-localizacao-refinado/) | Versão refinada da permissão de localização |

### Autenticação
| # | Tela | Descrição |
|---|------|-----------|
| 01 | [Login](screens/auth/01-login/) | Tela de login |
| 02 | [Login (refinado)](screens/auth/02-login-refinado/) | Versão moderna do login |

### App principal
| # | Tela | Descrição |
|---|------|-----------|
| 01 | [Home](screens/app/01-home/) | Tela inicial |
| 02 | [Mapa](screens/app/02-mapa/) | Mapa de postos |
| 03 | [Detalhes do posto](screens/app/03-detalhes-posto/) | Detalhes de um posto |
| 04 | [Comparador](screens/app/04-comparador/) | Comparação de postos/preços |
| 05 | [Perfil e veículos](screens/app/05-perfil-veiculos/) | Perfil do usuário e veículos |
| 06 | [Mapa de recarga](screens/app/06-mapa-recarga/) | Mapa de pontos de recarga EV |

### Assinatura
| # | Tela | Descrição |
|---|------|-----------|
| 01 | [Premium](screens/assinatura/01-premium/) | Plano premium |
| 02 | [Economia total](screens/assinatura/02-economia-total/) | Plano economia total |

## Design System

O arquivo [`design-system/DESIGN.md`](design-system/DESIGN.md) documenta a
identidade visual do produto:

- **Cores** — paleta baseada em Material Design 3 (verde vívido para economia,
  azul petróleo para navegação/confiança, ciano elétrico para recarga EV).
- **Tipografia** — estratégia com duas fontes: **Manrope** (títulos e preços) e
  **Inter** (UI e corpo de texto).
- **Layout** — grid de 8pt, mobile-first, alvos de toque de no mínimo 48px.
- **Componentes** — botões, inputs, cards de posto/EV, chips de seleção,
  marcadores de mapa e estados de feedback.
