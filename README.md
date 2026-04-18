# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Persistência (Vercel Postgres / Neon)

Este app salva o estado (personagens + magias adicionadas) em um banco Postgres via uma função serverless em `/api/state`.

- Em produção na Vercel: conecte um banco (Vercel Postgres / Neon). A integração normalmente injeta `POSTGRES_URL` nas variáveis de ambiente.
- Localmente: para testar o `/api`, use `vercel dev` (o `vite dev` não executa a pasta `api/`).

### Passo a passo (Vercel)

1. Crie/Conecte um banco Postgres no projeto (Vercel Storage → Postgres / Neon).
2. Faça deploy do projeto.
3. Abra o app e defina uma **Chave de sincronização** (mínimo 12 caracteres). Essa chave é o “segredo” do seu grupo.

### Como compartilhar com o grupo (sem login)

Você pode compartilhar um link com a chave, por exemplo:

`https://SEU-APP.vercel.app/?k=SUA-CHAVE-SECRETA-AQUI`

Na primeira abertura, o app salva a chave no navegador e remove `k` da URL.

### Observações de segurança

- Não há autenticação: quem souber a chave consegue ler/escrever o estado do grupo.
- Use uma chave longa e não óbvia (ex: 20+ caracteres aleatórios).

### Desenvolvimento local com API

1. Instale a CLI da Vercel: `npm i -g vercel`
2. Crie um arquivo `.env.local` com `POSTGRES_URL=...` (string de conexão do Neon/Postgres)
3. Rode: `npm run dev:vercel`

Observação: `npm run dev` (ou `npm run dev:vite`) roda só o Vite (sem a pasta `/api`).

## Tradução (descrição oficial)

O botão **“Traduzir PT-BR”** usa o endpoint serverless `/api/translate`, que por padrão chama o LibreTranslate.

O endpoint suporta dois provedores:

- **Google Cloud Translation API v2** (recomendado): mais estável, mas normalmente exige billing.
- **LibreTranslate**: útil para self-host/alternativas compatíveis.

### Variáveis de ambiente

- `TRANSLATE_PROVIDER` (opcional): `google` ou `libre`. Se não for definido, o app prefere `google` quando `GOOGLE_TRANSLATE_API_KEY` estiver presente.

**Google**

- `GOOGLE_TRANSLATE_API_KEY` (obrigatório para `google`): API key do Google Cloud com a **Cloud Translation API** habilitada.

**LibreTranslate**

- `TRANSLATE_API_URL` (opcional): URL do endpoint de tradução. Padrão: `https://de.libretranslate.com/translate`
- `TRANSLATE_API_KEY` (opcional): chave da API, se o seu provedor exigir.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
