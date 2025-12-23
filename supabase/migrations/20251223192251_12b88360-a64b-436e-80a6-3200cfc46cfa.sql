-- Remover constraint existente e adicionar nova com tipos adicionais
ALTER TABLE public.historico_fundos 
DROP CONSTRAINT IF EXISTS historico_fundos_tipo_check;

ALTER TABLE public.historico_fundos 
ADD CONSTRAINT historico_fundos_tipo_check 
CHECK (tipo = ANY (ARRAY['entrada', 'saida', 'solicitacao_retroativa', 'baixa', 'ajuste']));