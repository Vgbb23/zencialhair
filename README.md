# zencialhair

## Erro 404 na Vercel (`NOT_FOUND` na raiz do site)

O código do site e da API (`vercel.json`, pasta `api/`, front em `envy-skin-clone/`) **não está na raiz do repositório Git** — está em:

`zencialnovo-main/zencialnovo-main/`

Se o projeto na Vercel usar a raiz do repo como **Root Directory**, não há build nem `index.html` na saída → a URL do deploy mostra **404: NOT_FOUND**.

### O que fazer (uma vez)

1. Abra o projeto no [Vercel Dashboard](https://vercel.com/dashboard).
2. **Settings** → **General** → **Root Directory** → **Edit**.
3. Defina exatamente: `zencialnovo-main/zencialnovo-main` (ou navegue até essa pasta e confirme).
4. Salve e faça **Redeploy** (Deployments → ⋮ → Redeploy).

Depois disso, `https://SEU-PROJETO.vercel.app/` deve carregar o front e `https://SEU-PROJETO.vercel.app/api/health` deve devolver JSON.

Variáveis de ambiente (Fruitfy, etc.) continuam em **Settings → Environment Variables**; veja também o `README.md` dentro de `zencialnovo-main/zencialnovo-main/` para detalhes do PIX.
