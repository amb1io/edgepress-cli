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

## Estrutura do tema (roteamento estilo Astro)

```
theme.json
templates/
  index.liquid              → /
  [slug].liquid             → /{slug}
  search.liquid             → /search
  404.liquid                → fallback
  archive.liquid            → fallback de archive
  portfolio/
    index.liquid            → /portfolio
    [category].liquid       → /portfolio/{termo}
  category/
    [slug].liquid           → /category/{termo}
  layouts/base.liquid
  parts/header.liquid
assets/
  theme.css
  theme.js
```

Pastas e colchetes definem a URL. Segmentos dinâmicos ficam em `route.params` (ex.: `route.params.category`).

## Autenticação (--connect)

O CLI faz login via `POST /api/auth/sign-in/email`, armazena o cookie de sessão em `~/.edgepress/credentials.json` e envia `Cookie: better-auth.session_token=...` em todas as requisições à API.

## Rotas públicas

O roteador usa **arquivos em `templates/`** (estilo Astro). A fase 1 casa o path com o template; a fase 2 define `route.kind` consultando post types, taxonomias e posts no CMS.

| URL | `route.kind` | Template típico |
|-----|--------------|-----------------|
| `/` | `home` | `index.liquid` |
| `/posts` | `archive` | `posts/index.liquid` |
| `/category/{slug}` | `taxonomy` | `category/[slug].liquid` |
| `/portfolio` | `page` | `portfolio/index.liquid` |
| `/portfolio/{term}` | `page` | `portfolio/[category].liquid` + `route.params.category` |
| `/{slug}` | `single` ou `page` | `[slug].liquid` |
| `/search?q=` | `search` | `search.liquid` |

Use `{% get_taxonomy_posts 'category', route.params.category as posts %}` quando o template precisar filtrar por termo.

Use `{% get_related_posts post.id as related %}` em singles para listar posts da mesma categoria (cache in-memory no dev).

Exemplos com locale: `/en/category/sample-term`, `/en/posts`.

No preview mock, termos de exemplo incluem `/category/tecnologia` e `/category/sample-term`. Com locale EN, `sample-term` usa slug traduzido `sample-en` (`/en/category/sample-en`).

## Taxonomias e slugs traduzidos

Alinhado ao CMS EdgePress:

- `{% get_taxonomies %}` retorna `name` e `slug` **localizados** para o locale da rota.
- `{% get_taxonomies_locale 'post', 'category', 'pt-br' as categories %}` lista termos num **locale explícito**, independente da URL. O retorno é um objeto com `taxonomy` (nome/slug do tipo) e `values` (array de termos):

```json
{
  "taxonomy": {
    "name": "Categorias",
    "slug": "category",
    "original_name": "Category",
    "original_slug": "category"
  },
  "values": [{ "id": 12, "name": "Tecnologia", "slug": "tecnologia", "locale": "pt-br" }]
}
```

```liquid
{% get_taxonomies_locale 'post', 'category', 'pt-br' as categories %}
<h2>{{ categories.taxonomy.name }}</h2>
{% for term in categories.values %}
  <a href="/{{ categories.taxonomy.slug }}/{{ term.slug }}">{{ term.name }}</a>
{% endfor %}
```

- `{% get_taxonomy_posts 'category', 'slug' %}` aceita slug **canônico ou traduzido**.
- `{% get_posts 'post' as posts %}` lista posts por CPT (sem custom fields).
- `{% get_posts_details 'post', 500 as posts %}` inclui `custom_fields` (use quando o template precisar de blocos customizados).
- Arquivos `/category/{slug}` resolvem slug traduzido do locale da URL.
- O **locale switcher** em páginas de taxonomia usa o slug traduzido de cada idioma.

**Modo mock:** traduções de exemplo em `taxonomy-translation-client.ts` (`sample-term` → `sample-en` em EN).

**Modo `--connect`:** o CLI consulta `/api/i18n/{locale}` (namespaces `taxonomy.type.*` e `taxonomy.slug.*`) e lista de taxonomias para resolver slugs.

Documentação completa das tags Liquid: repositório EdgePress → `docs/themes/templates-liquid.md`.

## Menus (`{% nav_menu %}`)

No CMS, cada menu é um post do tipo `menus` (slug = location, ex.: `primary`, `footer`). Os itens são **posts filhos** do mesmo CPT, com `meta_values.link_type`:

| `link_type` | Destino |
|-------------|---------|
| `post` | Página/post/CPT (`target_slug`, `target_locale_code`, `target_post_id`) |
| `custom` | URL livre no `body` do item |
| `taxonomy` | Termo de taxonomia (`target_taxonomy_type`, `target_slug`) |

### Submenus

Itens podem ser aninhados via `parent_menu_item_id` no `meta_values`. O contexto `menus.{location}` expõe uma **árvore** — filhos ficam em `item.children`.

Cada `MenuItem`:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | number | ID do post do item |
| `label` | string | Rótulo |
| `url` | string | URL resolvida |
| `slug` | string | Slug do post |
| `target_post_id` | number \| null | Post vinculado |
| `active` | boolean | URL coincide com a rota atual |
| `children` | MenuItem[] | Subitens |
| `submenu_sort` | `"alphabetical"` \| `"creation"` | Ordenação dos filhos (no pai) |
| `submenu_display` | `("title" \| "thumbnail" \| "excerpt")[]` | Campos de visualização |

```liquid
{% nav_menu 'primary' %}

{% for parent in menus.primary | menu_parents %}
  <span>{{ parent.label }}</span>
{% endfor %}

{% for child in menus.primary | menu_children %}
  <a href="{{ child.url }}">{{ child.label }}</a>
{% endfor %}
```

Filtros: `menu_parents`, `menu_children`, `menu_items`.

Com `--connect`, o CLI carrega menus publicados via `/api/content/posts?filter_post_type=menus`, monta a árvore com `buildMenuItemTree` e resolve URLs com `buildMenuItemUrl`.

## BlockNote no front (`{% blocknote_content %}`)

Para conteúdo BlockNote (colunas, blocos custom), adicione `"blocknote"` em `theme.json` → `supports` e use `{% blocknote_content %}` no template. A tag renderiza HTML sanitizado imediatamente e hidrata BlockNote readonly quando `body_blocks` existe.

`{% scripts_footer %}` injeta `/edgepress-assets/blocknote-readonly.js` (bundle gerado por `npm run build:blocknote` no install).
