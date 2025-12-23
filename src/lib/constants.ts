// Limite máximo de valor por solicitação
export const LIMITE_MAXIMO_SOLICITACAO = 300;

// Tipos de solicitação
export const TIPOS_SOLICITACAO = {
  FUNDO_FIXO: 'FUNDO_FIXO',
  COMPRA_AVULSA: 'COMPRA_AVULSA',
} as const;

export type TipoSolicitacao = keyof typeof TIPOS_SOLICITACAO;

export const TIPOS_SOLICITACAO_LABELS: Record<TipoSolicitacao, string> = {
  FUNDO_FIXO: 'Fundo Fixo',
  COMPRA_AVULSA: 'Compra Avulsa',
};
