import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
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
import { LIMITE_MAXIMO_SOLICITACAO, TIPOS_SOLICITACAO, TIPOS_SOLICITACAO_LABELS, TipoSolicitacao } from '@/lib/constants';
import { Loader2, ArrowLeft, AlertTriangle, Info, Wallet, PlusCircle, FileText, Upload, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { z } from 'zod';
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

const schema = z.object({
  empresa_id: z.string().min(1, 'Selecione uma empresa'),
  tipo_solicitacao: z.enum(['FUNDO_FIXO', 'COMPRA_AVULSA'], { required_error: 'Selecione o tipo de solicitação' }),
  valor_solicitado: z.number().positive('Valor deve ser maior que zero'),
  justificativa: z.string().min(10, 'Justificativa deve ter no mínimo 10 caracteres'),
  categoria: z.string().optional(),
});

type FlowType = 'choice' | 'nova' | 'importar';
type ImportStep = 'upload' | 'form' | 'confirm';

export default function NovaSolicitacao() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [fundos, setFundos] = useState<Fundo[]>([]);
  const [loading, setLoading] = useState(false);
  const [valorDisplay, setValorDisplay] = useState('');
  
  // Flow state
  const [flow, setFlow] = useState<FlowType>('choice');
  const [importStep, setImportStep] = useState<ImportStep>('upload');

  // Nova solicitação form
  const [form, setForm] = useState({
    empresa_id: '',
    tipo_solicitacao: '' as TipoSolicitacao | '',
    valor_solicitado: 0,
    justificativa: '',
    categoria: '',
  });

  // Importar nota states
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
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

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const masked = maskCurrency(value);
    setValorDisplay(masked);
    setForm({ ...form, valor_solicitado: parseCurrency(masked) });
  };

  // Get saldo for selected empresa
  const saldoDisponivel = fundos.find(f => f.empresa_id === form.empresa_id)?.saldo_atual || 0;
  const selectedFundo = fundos.find(f => f.empresa_id === form.empresa_id);
  
  // Validation states
  const excedeLimiteMaximo = form.valor_solicitado > LIMITE_MAXIMO_SOLICITACAO;
  const excedeSaldo = form.tipo_solicitacao === 'FUNDO_FIXO' && form.valor_solicitado > saldoDisponivel;
  const podeEnviar = !excedeLimiteMaximo && !excedeSaldo;

  const handleSubmitNova = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = schema.safeParse(form);
      if (!validation.success) {
        toast({
          title: 'Erro de validação',
          description: validation.error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }

      if (excedeLimiteMaximo) {
        toast({
          title: 'Valor acima do limite',
          description: `O valor máximo permitido por solicitação é de ${formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}.`,
          variant: 'destructive',
        });
        return;
      }

      if (excedeSaldo) {
        toast({
          title: 'Saldo insuficiente',
          description: 'Saldo insuficiente no fundo fixo para esta solicitação.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.from('solicitacoes').insert({
        empresa_id: form.empresa_id,
        solicitante_user_id: user?.id,
        tipo_solicitacao: form.tipo_solicitacao as any,
        valor_solicitado: form.valor_solicitado,
        justificativa: form.justificativa,
        categoria: form.categoria || null,
        status: 'enviada',
        excedeu_saldo: false as any,
        excedeu_limite_maximo: false as any,
      } as any);

      if (error) throw error;

      toast({
        title: 'Solicitação enviada!',
        description: 'Sua solicitação foi enviada para aprovação.',
      });
      navigate('/minhas-solicitacoes');
    } catch (error) {
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar sua solicitação. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Import nota functions
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
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
    setUploading(true);
    setAiResult(null);
    setAiError(false);

    try {
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
        setAiResult(aiData as AIResult);
        setValorDisplay(maskCurrency(String(aiData.total_value * 100)));
        setForm({ ...form, valor_solicitado: aiData.total_value });
        if (aiData.extracted_fields?.data_emissao) setDataEmissao(aiData.extracted_fields.data_emissao);
        if (aiData.extracted_fields?.numero_nota) setNumeroNota(aiData.extracted_fields.numero_nota);
        if (aiData.extracted_fields?.nome_emitente) setNomeEmitente(aiData.extracted_fields.nome_emitente);
        if (aiData.extracted_fields?.cnpj_emitente) setCnpjEmitente(maskCNPJ(aiData.extracted_fields.cnpj_emitente));
        toast({ title: 'Nota fiscal processada!', description: 'Campos preenchidos automaticamente' });
      }
    } catch (error) {
      toast({ title: 'Erro ao processar arquivo', description: 'Tente novamente', variant: 'destructive' });
      setAiError(true);
    } finally {
      setProcessing(false);
    }
  };

  const canProceedUpload = file && fileUrl && !uploading && !processing;
  const canProceedForm = form.empresa_id && form.justificativa.trim().length > 0 && form.valor_solicitado > 0;

  const handleSubmitImport = async () => {
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

      // Deduct from fund balance
      const novoSaldo = saldoDisponivel - valor;
      await supabase.from('fundos').update({
        saldo_atual: novoSaldo,
      }).eq('id', selectedFundo.id);

      // Record in history
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

      navigate(`/solicitacao/${solicitacao.id}`);
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
    setAiResult(null);
    setAiError(false);
    setDataEmissao('');
    setNumeroNota('');
    setNomeEmitente('');
    setCnpjEmitente('');
    setDescricaoCompra('');
    setValorDisplay('');
    setForm({ ...form, empresa_id: '', justificativa: '', valor_solicitado: 0, categoria: '' });
    setImportStep('upload');
  };

  const handleBack = () => {
    if (flow === 'choice') {
      navigate(-1);
    } else if (flow === 'importar') {
      if (importStep === 'upload') {
        setFlow('choice');
        resetImport();
      } else if (importStep === 'form') {
        setImportStep('upload');
      } else if (importStep === 'confirm') {
        setImportStep('form');
      }
    } else {
      setFlow('choice');
      setForm({ empresa_id: '', tipo_solicitacao: '', valor_solicitado: 0, justificativa: '', categoria: '' });
      setValorDisplay('');
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        {/* Step 0: Choice */}
        {flow === 'choice' && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">O que deseja fazer?</h1>
              <p className="text-muted-foreground mt-1">Escolha uma opção para continuar</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card 
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setFlow('nova')}
              >
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <PlusCircle className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Nova Solicitação</h3>
                  <p className="text-sm text-muted-foreground">
                    Preciso solicitar valor para realizar uma compra
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setFlow('importar')}
              >
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-success" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Importar Nota</h3>
                  <p className="text-sm text-muted-foreground">
                    Já fiz a compra e tenho a nota fiscal
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Nova Solicitação Flow */}
        {flow === 'nova' && (
          <Card>
            <CardHeader>
              <CardTitle>Nova Solicitação</CardTitle>
              <CardDescription>
                Preencha os dados abaixo para solicitar retirada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-6">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Valor máximo por solicitação: <strong>{formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}</strong>
                </AlertDescription>
              </Alert>

              <form onSubmit={handleSubmitNova} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Solicitação *</Label>
                  <Select
                    value={form.tipo_solicitacao}
                    onValueChange={(value) => setForm({ ...form, tipo_solicitacao: value as TipoSolicitacao })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPOS_SOLICITACAO).map(([key, value]) => (
                        <SelectItem key={key} value={value}>
                          {TIPOS_SOLICITACAO_LABELS[key as TipoSolicitacao]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.tipo_solicitacao === 'FUNDO_FIXO' && (
                    <p className="text-xs text-muted-foreground">
                      Impacta diretamente o saldo do fundo fixo da empresa
                    </p>
                  )}
                  {form.tipo_solicitacao === 'COMPRA_AVULSA' && (
                    <p className="text-xs text-muted-foreground">
                      Compra pontual fora do controle do caixa fixo
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa / Unidade *</Label>
                  <Select
                    value={form.empresa_id}
                    onValueChange={(value) => setForm({ ...form, empresa_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map((empresa) => (
                        <SelectItem key={empresa.id} value={empresa.id}>
                          {empresa.nome_fantasia}
                          {empresa.unidade && ` - ${empresa.unidade}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.tipo_solicitacao === 'FUNDO_FIXO' && form.empresa_id && (
                  <Alert className={saldoDisponivel <= 0 ? 'border-warning' : ''}>
                    <Wallet className="h-4 w-4" />
                    <AlertDescription className="flex items-center gap-2">
                      Saldo disponível: <strong className={saldoDisponivel <= 0 ? 'text-warning' : 'text-success'}>{formatCurrency(saldoDisponivel)}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="valor">Valor Solicitado *</Label>
                  <Input
                    id="valor"
                    type="text"
                    placeholder="R$ 0,00"
                    value={valorDisplay}
                    onChange={handleValorChange}
                    required
                  />
                  {excedeLimiteMaximo && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      O valor máximo permitido por solicitação é de {formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}.
                    </p>
                  )}
                  {excedeSaldo && !excedeLimiteMaximo && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Saldo insuficiente no fundo fixo para esta solicitação.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria</Label>
                  <Select
                    value={form.categoria}
                    onValueChange={(value) => setForm({ ...form, categoria: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="justificativa">Justificativa *</Label>
                  <Textarea
                    id="justificativa"
                    placeholder="Descreva o motivo da solicitação..."
                    value={form.justificativa}
                    onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                    rows={4}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 10 caracteres
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={loading || !podeEnviar || !form.tipo_solicitacao} 
                    className="flex-1"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar Solicitação
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Importar Nota Flow */}
        {flow === 'importar' && (
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
                  importStep === 'upload' || importStep === 'form' || importStep === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>1</div>
                <div className={cn("w-8 h-0.5", importStep === 'form' || importStep === 'confirm' ? "bg-primary" : "bg-muted")} />
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  importStep === 'form' || importStep === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>2</div>
                <div className={cn("w-8 h-0.5", importStep === 'confirm' ? "bg-primary" : "bg-muted")} />
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  importStep === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>3</div>
              </div>

              {/* Step 1: Upload */}
              {importStep === 'upload' && (
                <div className="space-y-4">
                  <div className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                    file ? "border-success bg-success/5" : "border-border hover:border-primary/50"
                  )}>
                    {uploading || processing ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          {uploading ? 'Enviando arquivo...' : 'Processando nota com IA...'}
                        </p>
                      </div>
                    ) : file ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-10 w-10 text-success" />
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

                  <div className="flex gap-4">
                    <Button variant="outline" onClick={handleBack} className="flex-1">
                      Cancelar
                    </Button>
                    <Button 
                      onClick={() => setImportStep('form')} 
                      disabled={!canProceedUpload}
                      className="flex-1"
                    >
                      Continuar
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Form */}
              {importStep === 'form' && (
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
                      Voltar
                    </Button>
                    <Button 
                      onClick={() => setImportStep('confirm')} 
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
              {importStep === 'confirm' && (
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
                      Voltar
                    </Button>
                    <Button 
                      onClick={handleSubmitImport}
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
        )}
      </div>
    </AppLayout>
  );
}
