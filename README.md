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
  404.liquid
assets/
  theme.css
  theme.js
```

## Autenticação (--connect)

O CLI faz login via `POST /api/auth/sign-in/email`, armazena o cookie de sessão em `~/.edgepress/credentials.json` e envia `Cookie: better-auth.session_token=...` em todas as requisições à API.
