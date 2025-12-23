-- Adicionar campo para armazenar hash do arquivo
ALTER TABLE solicitacoes 
ADD COLUMN arquivo_hash TEXT;

-- Índice para buscas rápidas por hash
CREATE INDEX idx_solicitacoes_arquivo_hash ON solicitacoes(arquivo_hash) WHERE arquivo_hash IS NOT NULL;

-- Índice composto para verificação por nota + CNPJ
CREATE INDEX idx_solicitacoes_nota_cnpj ON solicitacoes(numero_nota, cnpj_emitente) 
WHERE numero_nota IS NOT NULL AND cnpj_emitente IS NOT NULL;