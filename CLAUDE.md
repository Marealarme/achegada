# Projeto Chegada — pré-chegada de hóspedes + FNRH

## Quem sou
Dono de pousada (Lua Chalés, Maresias), não sou programador. Explique em português simples o que fez e como testar.

## Regras
- A bíblia do projeto (produto, fases, LGPD) está no documento "Bíblia do Projeto – App de Check-in FNRH". Leia antes de tarefas novas.
- Passos pequenos: uma funcionalidade por vez; ao terminar, diga como eu testo.
- Stack: Next.js (App Router) + TypeScript + Supabase (região São Paulo) + Vercel. CSS em src/app/globals.css (tokens de cor no :root).
- Toda tabela tem pousada_id e regra de segurança (RLS). Mudanças de banco vão em supabase/migrations/ como novo arquivo numerado.
- O hóspede nunca acessa o banco direto: a página /c/[token] usa ações de servidor com a chave de serviço, sempre validando o token antes.
- Nunca coloque senhas ou chaves no código; use variáveis de ambiente (.env.local e Vercel).
- Foto de documento (quando existir): ler, mostrar para conferência e apagar na hora; nunca salvar. Número de RG/passaporte não fica no banco.
- Marketing só para quem marcou o consentimento (hospedes.consentimento_marketing_em).
- Tudo da API FNRH (Fase 2) fica em src/lib/fnrh/ e roda só no servidor.
- Telas do hóspede: celular primeiro, carregamento rápido.
- Antes de mudar o banco ou apagar arquivos, me pergunte.
- Ao final de cada tarefa: rode `npm run build` e faça commit com mensagem clara em português.
