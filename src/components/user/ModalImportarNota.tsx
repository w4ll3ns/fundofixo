import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, maskCurrency, parseCurrency, maskCNPJ } from '@/lib/masks';
import { LIMITE_MAXIMO_SOLICITACAO } from '@/lib/constants';
import { Upload, Loader2, CheckCircle, AlertTriangle, XCircle, FileText, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalImportarNotaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

const CATEGORIAS = [
  'Material de Escritório',
  'Alimentação',
  'Transporte',
  'Limpeza',
  'Manutenção',
  'Outros',
];

export function ModalImportarNota({ open, onOpenChange }: ModalImportarNotaProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [fundos, setFundos] = useState<Fundo[]>([]);
  const [loading, setLoading] = useState(false);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState(false);

  // Form state
  const [empresaId, setEmpresaId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [valorDisplay, setValorDisplay] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [numeroNota, setNumeroNota] = useState('');
  const [nomeEmitente, setNomeEmitente] = useState('');
  const [cnpjEmitente, setCnpjEmitente] = useState('');
  const [descricaoCompra, setDescricaoCompra] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Fetch empresas and fundos
  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    const [empresasRes, fundosRes] = await Promise.all([
      supabase.from('empresas').select('id, nome_fantasia, unidade').eq('status', true).order('nome_fantasia'),
      supabase.from('fundos').select('id, empresa_id, saldo_atual'),
    ]);

    if (empresasRes.data) setEmpresas(empresasRes.data);
    if (fundosRes.data) setFundos(fundosRes.data);
    setLoading(false);
  };

  const resetForm = () => {
    setStep(1);
    setFile(null);
    setFileUrl(null);
    setAiResult(null);
    setAiError(false);
    setEmpresaId('');
    setCategoria('');
    setJustificativa('');
    setValorDisplay('');
    setDataEmissao('');
    setNumeroNota('');
    setNomeEmitente('');
    setCnpjEmitente('');
    setDescricaoCompra('');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

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
      // Upload file
      const filePath = `${user?.id}/importados/${Date.now()}-${selectedFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('notas-fiscais')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      setFileUrl(filePath);
      setUploading(false);
      setProcessing(true);

      // Process with AI
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

  const valor = parseCurrency(valorDisplay);
  const selectedFundo = fundos.find(f => f.empresa_id === empresaId);
  const saldoDisponivel = selectedFundo?.saldo_atual || 0;
  const excedeSaldo = valor > saldoDisponivel;
  const excedeLimite = valor > LIMITE_MAXIMO_SOLICITACAO;

  const canProceedStep1 = file && fileUrl && !uploading && !processing;
  const canProceedStep2 = empresaId && justificativa.trim().length > 0 && valor > 0;

  const handleSubmit = async () => {
    if (!user || !fileUrl || !empresaId || !selectedFundo) return;

    setSubmitting(true);

    try {
      const now = new Date().toISOString();

      // Create solicitacao with status 'baixada'
      const { data: solicitacao, error: solError } = await supabase
        .from('solicitacoes')
        .insert({
          solicitante_user_id: user.id,
          empresa_id: empresaId,
          tipo_solicitacao: 'FUNDO_FIXO',
          valor_solicitado: valor,
          valor_entregue: valor,
          valor_gasto_real: valor,
          troco_real: 0,
          justificativa,
          categoria: categoria || null,
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
          excedeu_saldo: excedeSaldo,
          excedeu_limite_maximo: excedeLimite,
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

      handleClose();
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Nota Fiscal</DialogTitle>
          <DialogDescription>
            Importe uma nota fiscal para criar automaticamente a solicitação e baixa
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>1</div>
          <div className={cn("w-8 h-0.5", step >= 2 ? "bg-primary" : "bg-muted")} />
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>2</div>
          <div className={cn("w-8 h-0.5", step >= 3 ? "bg-primary" : "bg-muted")} />
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>3</div>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
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

            {/* AI Result Feedback */}
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
          </div>
        )}

        {/* Step 2: Form */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa / Fundo Fixo *</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
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
                  onChange={(e) => setValorDisplay(maskCurrency(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
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

            {/* Warnings */}
            {excedeSaldo && (
              <div className="p-3 rounded-lg bg-warning/10 text-warning text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Valor excede o saldo disponível ({formatCurrency(saldoDisponivel)})</span>
              </div>
            )}

            {excedeLimite && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Valor excede o limite máximo ({formatCurrency(LIMITE_MAXIMO_SOLICITACAO)})</span>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Empresa</span>
                <span className="font-medium">{empresas.find(e => e.id === empresaId)?.nome_fantasia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Valor</span>
                <span className="font-medium">{formatCurrency(valor)}</span>
              </div>
              {categoria && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Categoria</span>
                  <span className="font-medium">{categoria}</span>
                </div>
              )}
              {dataEmissao && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data da Nota</span>
                  <span className="font-medium">{new Date(dataEmissao + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
              )}
              {numeroNota && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Número da Nota</span>
                  <span className="font-medium">{numeroNota}</span>
                </div>
              )}
              {nomeEmitente && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Emitente</span>
                  <span className="font-medium text-right truncate max-w-[200px]">{nomeEmitente}</span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-primary/10 text-center">
              <p className="text-sm text-muted-foreground">Novo saldo após importação</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(saldoDisponivel - valor)}</p>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Ao confirmar, a solicitação será criada com status <strong>Baixada</strong> e o valor será debitado do fundo.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
              Revisar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Confirmar Importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
