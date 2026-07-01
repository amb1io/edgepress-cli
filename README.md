# @edgepress/cli

CLI para desenvolvimento de temas Liquid do EdgePress.

## Instalação

```bash
npm install -D @edgepress/cli
```

## Comandos

```bash
# Scaffold de um tema novo
npx edgepress theme create

# Preview local com hot reload (dados mockados)
npx edgepress theme dev

# Preview com dados reais do CMS (handshake Better Auth)
npx edgepress theme dev --connect https://seu-site.com

# Empacotar para upload no admin
npx edgepress theme build
```

## Estrutura do tema

```
theme.json
templates/
  layouts/base.liquid
  home.liquid
  single.liquid
  page.liquid
  archive.liquid
  taxonomy.liquid
  404.liquid
assets/
  theme.css
  theme.js
```

## Autenticação (--connect)

O CLI faz login via `POST /api/auth/sign-in/email`, armazena o cookie de sessão em `~/.edgepress/credentials.json` e envia `Cookie: better-auth.session_token=...` em todas as requisições à API.

## Rotas públicas

O preview local (`theme dev`) e o modo conectado (`--connect`) suportam as mesmas URLs do tema em produção:

| URL | `route.kind` | Template típico |
|-----|--------------|-----------------|
| `/` | `home` | `home.liquid` |
| `/posts` | `archive` | `archive.liquid` |
| `/category/{slug}` | `taxonomy` | `taxonomy.liquid` → `archive.liquid` |
| `/tag/{slug}` | `taxonomy` | `taxonomy.liquid` → `archive.liquid` |
| `/{slug}` | `single` ou `page` | `single.liquid` / `page.liquid` |

Use `{% get_related_posts post.id as related %}` em singles para listar posts da mesma categoria (cache in-memory no dev).

Exemplos com locale: `/en/category/visum`, `/en/posts`.

No preview mock, termos de exemplo incluem `/category/tecnologia` e `/category/visum`.
