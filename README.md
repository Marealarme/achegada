# A Chegada

Check-in online e pré-chegada de hóspedes, integrado à FNRH Digital. Piloto: Lua Chalés (Maresias).

## O que já funciona (Fase 1)
- **Painel da recepção** (`/painel`): login da equipe, próximas chegadas, nova reserva, mensagem pronta com botão **Enviar no WhatsApp**, detalhe da pré-chegada, marcar FNRH concluída.
- **Check-in do hóspede** (`/c/<token>`): 7 passos no celular; cadastra titular e acompanhantes (cadastro permanente por CPF), chegada, placa, pet, late check-out, aceites e consentimento de ofertas; leva à ficha oficial da FNRH.

## Como colocar no ar (uma vez)
1. **Supabase** → SQL Editor → cole `supabase/migrations/0001_inicial.sql` → Run.
2. **Supabase** → Authentication → Users → Add user (seu e-mail e uma senha).
3. **Supabase** → SQL Editor → rode o bloco final do arquivo (comentado) trocando o e-mail pelo seu.
4. **Vercel** → Add New → Project → importe o repositório `chegada` → em Environment Variables cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL` (Supabase → Project Settings → API → Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (mesma tela, chave `anon` / publishable)
   - `SUPABASE_SERVICE_ROLE_KEY` (mesma tela, chave `service_role` / secret — **nunca compartilhe**)
   - `NEXT_PUBLIC_SITE_URL` = `https://achegada.innexperts.com.br`
5. Deploy. Acesse `/entrar` e faça login.

## Rodar no computador
```
npm install
cp .env.example .env.local   # preencha os valores
npm run dev
```

## Próximos passos
- Importar reservas por planilha do Hotel Link.
- Fase 2: integração com a API FNRH v2 (`src/lib/fnrh/`).
- Leitura de documento por foto (OCR), sem guardar a imagem.

## Domínio: achegada.innexperts.com.br (Vercel: projeto achegada)
1. Vercel → projeto → Settings → Domains → adicionar `achegada.innexperts.com.br`. A Vercel mostra o valor do CNAME.
2. Hostinger → Domínios → innexperts.com.br → DNS → adicionar registro:
   - Tipo: `CNAME` · Nome: `achegada` · Aponta para: o valor mostrado pela Vercel · TTL: padrão
3. Supabase → Authentication → URL Configuration: Site URL = endereço novo; Redirect URLs inclui `https://achegada.innexperts.com.br/**`.
4. Vercel → Environment Variables: `NEXT_PUBLIC_SITE_URL` = endereço novo → Redeploy.
5. Stripe → Webhooks: endpoint `https://achegada.innexperts.com.br/api/stripe/webhook`.
6. O endereço antigo `achegada.marealarme.com.br` fica na Vercel como redirecionamento (308) para o novo, para os links já enviados continuarem funcionando.
