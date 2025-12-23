import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { maskCurrency, parseCurrency, formatCurrency, maskCNPJ } from '@/lib/masks';
import { LIMITE_MAXIMO_SOLICITACAO } from '@/lib/constants';
import { Loader2, AlertTriangle, Info, FileText, Upload, CheckCircle, XCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Empresa {
  id: string;
  nome_fantasia: string;
  unidade: string | null;
}

interface Fundo {
  id: string;
  empresa_id: string;
  saldo_atual: number;
}

interface AIResult {
  total_value: number | null;
  confidence_label: 'alta' | 'media' | 'baixa';
  evidence_text: string;
  extracted_fields: {
    data_emissao?: string;
    numero_nota?: string;
    cnpj_emitente?: string;
    nome_emitente?: string;
  };
}

const categorias = [
  'Material de Escritório',
  'Material de Limpeza',
  'Transporte',
  'Alimentação',
  'Manutenção',
  'Serviços',
  'Outros',
];

type ImportStep = 'upload' | 'form' | 'confirm';

interface DuplicataInfo {
  id: string;
  numero_nota: string | null;
  nome_emitente: string | null;
  created_at: string;
  tipo: 'hash' | 'nota_cnpj';
}

interface ImportarNotaProps {
  onSuccess?: () => void;
}

export function ImportarNota({ onSuccess }: ImportarNotaProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [fundos, setFundos] = useState<Fundo[]>([]);
  
  const [step, setStep] = useState<ImportStep>('upload');
  const [valorDisplay, setValorDisplay] = useState('');
  
  const [form, setForm] = useState({
    empresa_id: '',
    valor_solicitado: 0,
    justificativa: '',
    categoria: '',
  });

  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState(false);
  const [dataEmissao, setDataEmissao] = useState('');
  const [numeroNota, setNumeroNota] = useState('');
  const [nomeEmitente, setNomeEmitente] = useState('');
  const [cnpjEmitente, setCnpjEmitente] = useState('');
  const [descricaoCompra, setDescricaoCompra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duplicata, setDuplicata] = useState<DuplicataInfo | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
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

  const saldoDisponivel = fundos.find(f => f.empresa_id === form.empresa_id)?.saldo_atual || 0;
  const selectedFundo = fundos.find(f => f.empresa_id === form.empresa_id);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
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

  const consultarCnpjApi = async (cnpj: string): Promise<void> => {
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) return;

    setConsultandoCnpj(true);
    try {
      const { data, error } = await supabase.functions.invoke('consultar-cnpj', {
        body: { cnpj: cnpj.replace(/\D/g, '') }
      });

      if (error) {
        console.error('Erro ao consultar CNPJ:', error);
        return;
      }

      if (data?.data?.razao_social) {
        setNomeEmitente(data.data.razao_social);
        toast({ 
          title: 'Fornecedor identificado', 
          description: `${data.data.razao_social}${data.source === 'cache' ? ' (cache)' : ''}` 
        });
      }
    } catch (error) {
      console.error('Erro ao consultar API de CNPJ:', error);
      // Mantém o nome extraído pela IA em caso de erro
    } finally {
      setConsultandoCnpj(false);
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

    if (selectedFile.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'Arquivo deve ter no máximo 5MB', variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    setCheckingDuplicate(true);
    setDuplicata(null);
    setAiResult(null);
    setAiError(false);

    try {
      // Calcular hash do arquivo
      const hash = await calculateFileHash(selectedFile);
      setFileHash(hash);

      // Verificar duplicata por hash
      const duplicataHash = await checkDuplicateByHash(hash);
      if (duplicataHash) {
        setDuplicata(duplicataHash);
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

      const filePath = `${user?.id}/importados/${Date.now()}-${selectedFile.name}`;
      
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

      if (aiErr || !aiData?.total_value) {
        setAiError(true);
        toast({ title: 'IA não conseguiu ler a nota', description: 'Preencha os campos manualmente', variant: 'destructive' });
      } else {
        const result = aiData as AIResult;
        setAiResult(result);
        setValorDisplay(maskCurrency(String(result.total_value! * 100)));
        setForm({ ...form, valor_solicitado: result.total_value! });
        if (result.extracted_fields?.data_emissao) setDataEmissao(result.extracted_fields.data_emissao);
        if (result.extracted_fields?.numero_nota) setNumeroNota(result.extracted_fields.numero_nota);
        if (result.extracted_fields?.nome_emitente) setNomeEmitente(result.extracted_fields.nome_emitente);
        if (result.extracted_fields?.cnpj_emitente) setCnpjEmitente(maskCNPJ(result.extracted_fields.cnpj_emitente));
        
        // Consultar ReceitaWS para obter nome correto do fornecedor
        if (result.extracted_fields?.cnpj_emitente) {
          // Não aguarda para não bloquear o fluxo
          consultarCnpjApi(result.extracted_fields.cnpj_emitente);
        }
        
        // Verificar duplicata por número da nota + CNPJ
        if (result.extracted_fields?.numero_nota && result.extracted_fields?.cnpj_emitente) {
          const duplicataNota = await checkDuplicateByNotaCnpj(
            result.extracted_fields.numero_nota, 
            result.extracted_fields.cnpj_emitente
          );
          if (duplicataNota) {
            setDuplicata(duplicataNota);
            toast({ 
              title: 'Possível nota duplicada', 
              description: 'Uma nota com mesmo número e CNPJ já existe no sistema', 
              variant: 'default' 
            });
          }
        }
        
        toast({ title: 'Nota fiscal processada!', description: 'Campos preenchidos automaticamente' });
      }
    } catch (error) {
      toast({ title: 'Erro ao processar arquivo', description: 'Tente novamente', variant: 'destructive' });
      setAiError(true);
    } finally {
      setProcessing(false);
      setCheckingDuplicate(false);
    }
  };

  const canProceedUpload = file && fileUrl && !uploading && !processing && !(duplicata?.tipo === 'hash');
  const canProceedForm = form.empresa_id && form.justificativa.trim().length > 0 && form.valor_solicitado > 0;

  const handleSubmit = async () => {
    if (!user || !fileUrl || !form.empresa_id || !selectedFundo) return;

    setSubmitting(true);

    try {
      const now = new Date().toISOString();
      const valor = form.valor_solicitado;

      const { data: solicitacao, error: solError } = await supabase
        .from('solicitacoes')
        .insert({
          solicitante_user_id: user.id,
          empresa_id: form.empresa_id,
          tipo_solicitacao: 'FUNDO_FIXO',
          valor_solicitado: valor,
          valor_entregue: valor,
          valor_gasto_real: valor,
          troco_real: 0,
          justificativa: form.justificativa,
          categoria: form.categoria || null,
          descricao_compra: descricaoCompra || null,
          upload_nota_fiscal_url: fileUrl,
          arquivo_hash: fileHash,
          data_emissao_nota: dataEmissao || null,
          numero_nota: numeroNota || null,
          nome_emitente: nomeEmitente || null,
          cnpj_emitente: cnpjEmitente.replace(/\D/g, '') || null,
          status: 'baixada',
          data_aprovacao: now,
          data_baixa: now,
          ai_valor_extraido: aiResult?.total_value || null,
          ai_confianca: aiResult?.confidence_label || null,
          ai_evidencia: aiResult?.evidence_text || null,
          ai_status: aiResult ? 'ok' : (aiError ? 'falhou' : 'pendente'),
          ai_processed_at: now,
          excedeu_saldo: form.valor_solicitado > saldoDisponivel,
          excedeu_limite_maximo: form.valor_solicitado > LIMITE_MAXIMO_SOLICITACAO,
        })
        .select('id')
        .single();

      if (solError) throw solError;

      const novoSaldo = saldoDisponivel - valor;
      await supabase.from('fundos').update({
        saldo_atual: novoSaldo,
      }).eq('id', selectedFundo.id);

      await supabase.from('historico_fundos').insert({
        fundo_id: selectedFundo.id,
        solicitacao_id: solicitacao.id,
        tipo: 'solicitacao_retroativa',
        valor: -valor,
        saldo_anterior: saldoDisponivel,
        saldo_posterior: novoSaldo,
        descricao: `Importação de nota retroativa - ${nomeEmitente || 'Fornecedor'}`,
      });

      toast({ 
        title: 'Nota importada com sucesso!', 
        description: 'Solicitação criada e baixada automaticamente' 
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate(`/solicitacao/${solicitacao.id}`);
      }
    } catch (error: any) {
      toast({ 
        title: 'Erro ao importar nota', 
        description: error.message || 'Tente novamente', 
        variant: 'destructive' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setFileUrl(null);
    setFileHash(null);
    setAiResult(null);
    setAiError(false);
    setDuplicata(null);
    setDataEmissao('');
    setNumeroNota('');
    setNomeEmitente('');
    setCnpjEmitente('');
    setDescricaoCompra('');
    setValorDisplay('');
    setForm({ empresa_id: '', justificativa: '', valor_solicitado: 0, categoria: '' });
    setStep('upload');
  };

  const handleBack = () => {
    if (step === 'upload') {
      resetImport();
    } else if (step === 'form') {
      setStep('upload');
    } else if (step === 'confirm') {
      setStep('form');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar Nota Fiscal</CardTitle>
        <CardDescription>
          Importe uma nota fiscal para criar automaticamente a solicitação e baixa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            step === 'upload' || step === 'form' || step === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>1</div>
          <div className={cn("w-8 h-0.5", step === 'form' || step === 'confirm' ? "bg-primary" : "bg-muted")} />
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            step === 'form' || step === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>2</div>
          <div className={cn("w-8 h-0.5", step === 'confirm' ? "bg-primary" : "bg-muted")} />
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            step === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>3</div>
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              duplicata?.tipo === 'hash' ? "border-destructive bg-destructive/5" :
              file ? "border-success bg-success/5" : "border-border hover:border-primary/50"
            )}>
              {checkingDuplicate ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Verificando duplicatas...</p>
                </div>
              ) : uploading || processing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {uploading ? 'Enviando arquivo...' : 'Processando nota com IA...'}
                  </p>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className={cn("h-10 w-10", duplicata?.tipo === 'hash' ? "text-destructive" : "text-success")} />
                  <p className="font-medium">{file.name}</p>
                  <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-file-input')?.click()}>
                    Trocar arquivo
                  </Button>
                </div>
              ) : (
                <label htmlFor="import-file-input" className="cursor-pointer">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">Clique para enviar a nota fiscal</p>
                  <p className="text-sm text-muted-foreground mt-1">PDF, JPG ou PNG até 5MB</p>
                </label>
              )}
              <input
                id="import-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Alerta de duplicata por hash (bloqueia) */}
            {duplicata?.tipo === 'hash' && (
              <div className="p-4 rounded-lg bg-destructive/10 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Este arquivo já foi importado!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {duplicata.nome_emitente && `Emitente: ${duplicata.nome_emitente}`}
                    {duplicata.numero_nota && ` • Nota: ${duplicata.numero_nota}`}
                    {duplicata.created_at && ` • Em: ${new Date(duplicata.created_at).toLocaleDateString('pt-BR')}`}
                  </p>
                  <Button 
                    variant="link" 
                    className="p-0 h-auto text-primary" 
                    onClick={() => navigate(`/solicitacao/${duplicata.id}`)}
                  >
                    Ver solicitação existente →
                  </Button>
                </div>
              </div>
            )}

            {/* Alerta de duplicata por nota+cnpj (avisa mas permite) */}
            {duplicata?.tipo === 'nota_cnpj' && (
              <div className="p-4 rounded-lg bg-warning/10 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-warning">Possível nota duplicada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Uma nota com mesmo número e CNPJ já existe no sistema.
                    {duplicata.nome_emitente && ` Emitente: ${duplicata.nome_emitente}`}
                    {duplicata.created_at && ` • Em: ${new Date(duplicata.created_at).toLocaleDateString('pt-BR')}`}
                  </p>
                  <Button 
                    variant="link" 
                    className="p-0 h-auto text-primary" 
                    onClick={() => navigate(`/solicitacao/${duplicata.id}`)}
                  >
                    Ver solicitação existente →
                  </Button>
                </div>
              </div>
            )}

            {aiResult && (
              <div className={cn(
                "p-4 rounded-lg flex items-start gap-3",
                aiResult.confidence_label === 'alta' ? "bg-success/10" :
                aiResult.confidence_label === 'media' ? "bg-warning/10" : "bg-destructive/10"
              )}>
                {aiResult.confidence_label === 'alta' ? (
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                ) : aiResult.confidence_label === 'media' ? (
                  <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                )}
                <div>
                  <p className="font-medium">
                    Confiança {aiResult.confidence_label === 'alta' ? 'Alta' : aiResult.confidence_label === 'media' ? 'Média' : 'Baixa'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Valor encontrado: {formatCurrency(aiResult.total_value || 0)}
                  </p>
                </div>
              </div>
            )}

            {aiError && (
              <div className="p-4 rounded-lg bg-destructive/10 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-medium">Não foi possível ler a nota automaticamente</p>
                  <p className="text-sm text-muted-foreground">Você precisará preencher os campos manualmente</p>
                </div>
              </div>
            )}

            <Button 
              onClick={() => setStep('form')} 
              disabled={!canProceedUpload}
              className="w-full"
            >
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Form */}
        {step === 'form' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa / Fundo Fixo *</Label>
              <Select value={form.empresa_id} onValueChange={(value) => setForm({ ...form, empresa_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((emp) => {
                    const fundo = fundos.find(f => f.empresa_id === emp.id);
                    return (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.nome_fantasia} {emp.unidade ? `(${emp.unidade})` : ''} 
                        {fundo && ` - Saldo: ${formatCurrency(fundo.saldo_atual)}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor da Nota *</Label>
                <Input
                  value={valorDisplay}
                  onChange={(e) => {
                    const masked = maskCurrency(e.target.value);
                    setValorDisplay(masked);
                    setForm({ ...form, valor_solicitado: parseCurrency(masked) });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(value) => setForm({ ...form, categoria: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea
                value={form.justificativa}
                onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                placeholder="Descreva o motivo da compra..."
                rows={3}
              />
            </div>

            {/* Dados do Fornecedor */}
            {(nomeEmitente || cnpjEmitente) && (
              <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Fornecedor</span>
                  {consultandoCnpj && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Consultando CNPJ...
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nome/Razão Social</Label>
                    <Input
                      value={nomeEmitente}
                      onChange={(e) => setNomeEmitente(e.target.value)}
                      placeholder="Nome do fornecedor"
                    />
                  </div>
                  {cnpjEmitente && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>CNPJ:</span>
                      <span className="font-mono">{cnpjEmitente}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Descrição da Compra</Label>
              <Input
                value={descricaoCompra}
                onChange={(e) => setDescricaoCompra(e.target.value)}
                placeholder="O que foi comprado?"
              />
            </div>

            {form.valor_solicitado > saldoDisponivel && form.empresa_id && (
              <div className="p-3 rounded-lg bg-warning/10 text-warning text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Valor excede o saldo disponível ({formatCurrency(saldoDisponivel)})</span>
              </div>
            )}

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button 
                onClick={() => setStep('confirm')} 
                disabled={!canProceedForm}
                className="flex-1"
              >
                Continuar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empresa:</span>
                <span className="font-medium">{empresas.find(e => e.id === form.empresa_id)?.nome_fantasia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor:</span>
                <span className="font-medium">{formatCurrency(form.valor_solicitado)}</span>
              </div>
              {form.categoria && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoria:</span>
                  <span className="font-medium">{form.categoria}</span>
                </div>
              )}
              {nomeEmitente && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Emitente:</span>
                  <span className="font-medium">{nomeEmitente}</span>
                </div>
              )}
              {numeroNota && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nº Nota:</span>
                  <span className="font-medium">{numeroNota}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border">
                <p className="text-sm">{form.justificativa}</p>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Ao confirmar, a solicitação será criada com status <strong>baixada</strong> e o valor será debitado do saldo do fundo fixo.
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar Importação
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
