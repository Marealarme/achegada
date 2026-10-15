-- A Chegada · migração 0014 — chave da Digisan de cada pousada (para vender a emissão de NFS-e a outras pousadas).
-- Só cria uma coluna nova; nenhum dado existente é alterado.
-- A chave fica CRIPTOGRAFADA (AES-256-GCM com a CRIPTO_CHAVE do servidor), na mesma tabela das credenciais da FNRH,
-- que não tem nenhuma regra de leitura para a equipe: só o servidor (chave de serviço) lê.
alter table public.pousada_segredos add column if not exists digisan_chave_cripto text;
