export interface Empresa {
  id: string;
  nome_fantasia: string;
  unidade: string | null;
}

export interface Fundo {
  id: string;
  empresa_id: string;
  saldo_atual: number;
}

export interface ExtractedFields {
  data_emissao?: string;
  numero_nota?: string;
  cnpj_emitente?: string;
  nome_emitente?: string;
}

export interface NotaExtraida {
  pagina: number;
  total_value: number | null;
  confidence_label: 'alta' | 'media' | 'baixa';
  evidence_text: string;
  extracted_fields: ExtractedFields;
}

export interface AIMultiResult {
  notas_encontradas: number;
  notas: NotaExtraida[];
  error?: string;
}

export interface DuplicataInfo {
  id: string;
  numero_nota: string | null;
  nome_emitente: string | null;
  created_at: string;
  tipo: 'hash' | 'nota_cnpj';
}

export interface NotaFormData {
  empresa_id: string;
  valor_solicitado: number;
  valorDisplay: string;
  justificativa: string;
  categoria: string;
  descricaoCompra: string;
  dataEmissao: string;
  numeroNota: string;
  nomeEmitente: string;
  cnpjEmitente: string;
}

export const categorias = [
  'Material de Escritório',
  'Material de Limpeza',
  'Transporte',
  'Alimentação',
  'Manutenção',
  'Serviços',
  'Outros',
];

export type ImportStep = 'upload' | 'selecao' | 'form' | 'confirm';
