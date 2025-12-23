import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { maskCurrency, parseCurrency, maskCNPJ } from '@/lib/masks';
import type { 
  Empresa, 
  Fundo, 
  NotaExtraida, 
  AIMultiResult, 
  DuplicataInfo, 
  NotaFormData,
  ImportStep 
} from './types';

export function useImportarNota() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [fundos, setFundos] = useState<Fundo[]>([]);
  const [step, setStep] = useState<ImportStep>('upload');
  
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  
  // Multi-nota state
  const [notasExtraidas, setNotasExtraidas] = useState<NotaExtraida[]>([]);
  const [notasSelecionadas, setNotasSelecionadas] = useState<number[]>([]);
  const [duplicatasPorNota, setDuplicatasPorNota] = useState<Map<number, DuplicataInfo>>(new Map());
  const [aiError, setAiError] = useState(false);
  
  // Form state for batch (shared fields)
  const [sharedForm, setSharedForm] = useState({
    empresa_id: '',
    justificativa: '',
  });
  
  // Form data per nota
  const [notasFormData, setNotasFormData] = useState<Map<number, NotaFormData>>(new Map());
  
  const [submitting, setSubmitting] = useState(false);
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [empresasRes, fundosRes] = await Promise.all([
        supabase
          .from('empresas')
          .select('id, nome_fantasia, unidade')
          .eq('status', true)
          .order('nome_fantasia'),
        supabase
          .from('fundos')
          .select('id, empresa_id, saldo_atual'),
      ]);
      
      if (empresasRes.data) setEmpresas(empresasRes.data);
      if (fundosRes.data) setFundos(fundosRes.data);
    };

    fetchData();
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  const sanitizeFileName = (fileName: string): string => {
    return fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
      .replace(/[^a-zA-Z0-9._-]/g, '-') // Substitui caracteres especiais por hífen
      .replace(/-+/g, '-') // Remove hífens duplicados
      .replace(/^-|-$/g, ''); // Remove hífens no início/fim
  };

  const calculateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const checkDuplicateByHash = async (hash: string): Promise<DuplicataInfo | null> => {
    const { data } = await supabase
      .from('solicitacoes')
      .select('id, numero_nota, nome_emitente, created_at')
      .eq('arquivo_hash', hash)
      .limit(1);
    
    if (data && data.length > 0) {
      return { ...data[0], tipo: 'hash' };
    }
    return null;
  };

  const checkDuplicateByNotaCnpj = async (numNota: string, cnpj: string): Promise<DuplicataInfo | null> => {
    if (!numNota || !cnpj) return null;
    
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const { data } = await supabase
      .from('solicitacoes')
      .select('id, numero_nota, nome_emitente, created_at')
      .eq('numero_nota', numNota)
      .eq('cnpj_emitente', cnpjLimpo)
      .limit(1);
    
    if (data && data.length > 0) {
      return { ...data[0], tipo: 'nota_cnpj' };
    }
    return null;
  };

  const consultarCnpjApi = async (cnpj: string): Promise<string | null> => {
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) return null;

    try {
      const { data, error } = await supabase.functions.invoke('consultar-cnpj', {
        body: { cnpj: cnpj.replace(/\D/g, '') }
      });

      if (error) {
        console.error('Erro ao consultar CNPJ:', error);
        return null;
      }

      return data?.data?.razao_social || null;
    } catch (error) {
      console.error('Erro ao consultar API de CNPJ:', error);
      return null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(selectedFile.type)) {
      toast({ title: 'Erro', description: 'Apenas PDF, JPG ou PNG são permitidos', variant: 'destructive' });
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'Arquivo deve ter no máximo 10MB', variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    setCheckingDuplicate(true);
    setNotasExtraidas([]);
    setNotasSelecionadas([]);
    setDuplicatasPorNota(new Map());
    setAiError(false);

    try {
      // Calcular hash do arquivo
      const hash = await calculateFileHash(selectedFile);
      setFileHash(hash);

      // Verificar duplicata por hash (arquivo inteiro)
      const duplicataHash = await checkDuplicateByHash(hash);
      if (duplicataHash) {
        // Se o arquivo inteiro já foi importado, bloquear
        const map = new Map<number, DuplicataInfo>();
        map.set(0, duplicataHash);
        setDuplicatasPorNota(map);
        setCheckingDuplicate(false);
        toast({ 
          title: 'Arquivo já importado!', 
          description: 'Este arquivo já foi utilizado em outra solicitação', 
          variant: 'destructive' 
        });
        return;
      }

      setCheckingDuplicate(false);
      setUploading(true);

      const sanitizedName = sanitizeFileName(selectedFile.name);
      const filePath = `${user?.id}/importados/${Date.now()}-${sanitizedName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('notas-fiscais')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      setFileUrl(filePath);
      setUploading(false);
      setProcessing(true);

      const base64 = await fileToBase64(selectedFile);
      const { data: aiData, error: aiErr } = await supabase.functions.invoke('leitor-notas', {
        body: { 
          file_base64: base64,
          file_type: selectedFile.type 
        },
      });

      if (aiErr || !aiData) {
        setAiError(true);
        toast({ title: 'IA não conseguiu ler o documento', description: 'Tente novamente ou use outro arquivo', variant: 'destructive' });
        setProcessing(false);
        return;
      }

      const result = aiData as AIMultiResult;
      
      if (result.notas_encontradas === 0 || !result.notas?.length) {
        setAiError(true);
        toast({ title: 'Nenhuma nota fiscal encontrada', description: 'O documento não contém notas fiscais válidas', variant: 'destructive' });
        setProcessing(false);
        return;
      }

      setNotasExtraidas(result.notas);
      
      // Check duplicates for each nota
      const duplicatas = new Map<number, DuplicataInfo>();
      for (let i = 0; i < result.notas.length; i++) {
        const nota = result.notas[i];
        if (nota.extracted_fields?.numero_nota && nota.extracted_fields?.cnpj_emitente) {
          const dup = await checkDuplicateByNotaCnpj(
            nota.extracted_fields.numero_nota,
            nota.extracted_fields.cnpj_emitente
          );
          if (dup) {
            duplicatas.set(i, dup);
          }
        }
      }
      setDuplicatasPorNota(duplicatas);
      
      // Initialize form data for each nota
      const formDataMap = new Map<number, NotaFormData>();
      for (let i = 0; i < result.notas.length; i++) {
        const nota = result.notas[i];
        formDataMap.set(i, {
          empresa_id: '',
          valor_solicitado: nota.total_value || 0,
          valorDisplay: nota.total_value ? maskCurrency(String(nota.total_value * 100)) : '',
          justificativa: '',
          categoria: '',
          descricaoCompra: '',
          dataEmissao: nota.extracted_fields?.data_emissao || '',
          numeroNota: nota.extracted_fields?.numero_nota || '',
          nomeEmitente: nota.extracted_fields?.nome_emitente || '',
          cnpjEmitente: nota.extracted_fields?.cnpj_emitente ? maskCNPJ(nota.extracted_fields.cnpj_emitente) : '',
        });
      }
      setNotasFormData(formDataMap);
      
      // Auto-select notas that are not duplicates (hash type)
      const selectedIndices = result.notas
        .map((_, i) => i)
        .filter(i => duplicatas.get(i)?.tipo !== 'hash');
      setNotasSelecionadas(selectedIndices);
      
      toast({ 
        title: `${result.notas_encontradas} nota(s) encontrada(s)!`, 
        description: result.notas_encontradas > 1 ? 'Selecione quais deseja importar' : 'Confira os dados extraídos'
      });
      
    } catch (error) {
      toast({ title: 'Erro ao processar arquivo', description: 'Tente novamente', variant: 'destructive' });
      setAiError(true);
    } finally {
      setProcessing(false);
      setCheckingDuplicate(false);
    }
  };

  const toggleNotaSelecionada = (index: number) => {
    const dup = duplicatasPorNota.get(index);
    if (dup?.tipo === 'hash') return; // Can't toggle blocked notas
    
    setNotasSelecionadas(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const updateNotaFormData = (index: number, updates: Partial<NotaFormData>) => {
    setNotasFormData(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(index);
      if (current) {
        newMap.set(index, { ...current, ...updates });
      }
      return newMap;
    });
  };

  const consultarCnpjsParaNotas = async () => {
    setConsultandoCnpj(true);
    const cnpjsConsultados = new Set<string>();
    
    for (const index of notasSelecionadas) {
      const formData = notasFormData.get(index);
      if (!formData?.cnpjEmitente) continue;
      
      const cnpjLimpo = formData.cnpjEmitente.replace(/\D/g, '');
      if (cnpjsConsultados.has(cnpjLimpo)) continue;
      
      const razaoSocial = await consultarCnpjApi(cnpjLimpo);
      if (razaoSocial) {
        // Update all notas with same CNPJ
        for (const [i, fd] of notasFormData.entries()) {
          if (fd.cnpjEmitente.replace(/\D/g, '') === cnpjLimpo) {
            updateNotaFormData(i, { nomeEmitente: razaoSocial });
          }
        }
      }
      cnpjsConsultados.add(cnpjLimpo);
    }
    
    setConsultandoCnpj(false);
    toast({ title: 'Fornecedores consultados', description: 'Nomes atualizados via ReceitaWS' });
  };

  const resetImport = () => {
    setFile(null);
    setFileUrl(null);
    setFileHash(null);
    setNotasExtraidas([]);
    setNotasSelecionadas([]);
    setDuplicatasPorNota(new Map());
    setNotasFormData(new Map());
    setAiError(false);
    setSharedForm({ empresa_id: '', justificativa: '' });
    setStep('upload');
  };

  const getSaldoDisponivel = (empresaId: string) => {
    return fundos.find(f => f.empresa_id === empresaId)?.saldo_atual || 0;
  };

  const getFundo = (empresaId: string) => {
    return fundos.find(f => f.empresa_id === empresaId);
  };

  const valorTotalSelecionado = notasSelecionadas.reduce((sum, i) => {
    return sum + (notasFormData.get(i)?.valor_solicitado || 0);
  }, 0);

  return {
    // Data
    empresas,
    fundos,
    file,
    fileUrl,
    fileHash,
    step,
    uploading,
    processing,
    checkingDuplicate,
    notasExtraidas,
    notasSelecionadas,
    duplicatasPorNota,
    aiError,
    sharedForm,
    notasFormData,
    submitting,
    consultandoCnpj,
    valorTotalSelecionado,
    
    // Actions
    setStep,
    setFile,
    setSharedForm,
    setSubmitting,
    handleFileChange,
    toggleNotaSelecionada,
    updateNotaFormData,
    consultarCnpjsParaNotas,
    resetImport,
    getSaldoDisponivel,
    getFundo,
  };
}
