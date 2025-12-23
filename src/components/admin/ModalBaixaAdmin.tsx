import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, maskCurrency, parseCurrency, maskCNPJ } from '@/lib/masks';
import { Upload, Loader2, CheckCircle, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number;
  status: string;
  empresa_id: string;
  empresas: { nome_fantasia: string } | null;
  profiles: { nome: string } | null;
  justificativa: string;
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

interface ModalBaixaAdminProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  solicitacao: Solicitacao | null;
  onSuccess: () => void;
}

export function ModalBaixaAdmin({ open, onOpenChange, solicitacao, onSuccess }: ModalBaixaAdminProps) {
  const { toast } = useToast();

  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState(false);

  const [valorGastoDisplay, setValorGastoDisplay] = useState('');
  const [descricaoCompra, setDescricaoCompra] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [numeroNota, setNumeroNota] = useState('');
  const [nomeEmitente, setNomeEmitente] = useState('');
  const [cnpjEmitente, setCnpjEmitente] = useState('');

  const resetForm = () => {
    setFile(null);
    setFileUrl(null);
    setAiResult(null);
    setAiError(false);
    setValorGastoDisplay('');
    setDescricaoCompra('');
    setDataEmissao('');
    setNumeroNota('');
    setNomeEmitente('');
    setCnpjEmitente('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
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
    if (!selectedFile || !solicitacao) return;

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
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `admin/${user?.id}/${solicitacao.id}/${Date.now()}-${selectedFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('notas-fiscais')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      setFileUrl(filePath);
      setUploading(false);
      setProcessing(true);

      const base64 = await fileToBase64(selectedFile);
      const { data: aiData, error: aiError } = await supabase.functions.invoke('leitor-notas', {
        body: { 
          file_base64: base64,
          file_type: selectedFile.type 
        },
      });

      if (aiError || !aiData?.total_value) {
        setAiError(true);
        toast({ title: 'IA não conseguiu ler a nota', description: 'Preencha os campos manualmente', variant: 'destructive' });
      } else {
        setAiResult(aiData as AIResult);
        setValorGastoDisplay(maskCurrency(String(aiData.total_value * 100)));
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

  const valorGasto = parseCurrency(valorGastoDisplay);
  const trocoReal = solicitacao ? (solicitacao.valor_entregue || 0) - valorGasto : 0;

  const handleSubmit = async () => {
    if (!solicitacao || !fileUrl) return;

    setSubmitting(true);
    const newStatus = trocoReal < 0 ? 'pendente_ajuste' : 'baixada';

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('solicitacoes').update({
      status: newStatus,
      valor_gasto_real: valorGasto,
      descricao_compra: descricaoCompra || null,
      upload_nota_fiscal_url: fileUrl,
      troco_real: trocoReal,
      data_baixa: new Date().toISOString(),
      data_emissao_nota: dataEmissao || null,
      numero_nota: numeroNota || null,
      nome_emitente: nomeEmitente || null,
      cnpj_emitente: cnpjEmitente.replace(/\D/g, '') || null,
      ai_valor_extraido: aiResult?.total_value || null,
      ai_confianca: aiResult?.confidence_label || null,
      ai_evidencia: aiResult?.evidence_text || null,
      ai_status: aiResult ? 'ok' : (aiError ? 'falhou' : 'pendente'),
      ai_processed_at: new Date().toISOString(),
    }).eq('id', solicitacao.id);

    if (error) {
      toast({ title: 'Erro ao salvar baixa', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Se houve troco positivo e a baixa foi concluída, devolver ao saldo do fundo
    if (trocoReal > 0 && newStatus === 'baixada') {
      const { data: fundo } = await supabase
        .from('fundos')
        .select('id, saldo_atual')
        .eq('empresa_id', solicitacao.empresa_id)
        .maybeSingle();

      if (fundo) {
        const novoSaldo = Number(fundo.saldo_atual) + trocoReal;
        
        await supabase.from('fundos').update({
          saldo_atual: novoSaldo,
        }).eq('id', fundo.id);

        await supabase.from('historico_fundos').insert({
          fundo_id: fundo.id,
          solicitacao_id: solicitacao.id,
          tipo: 'devolucao_troco',
          valor: trocoReal,
          saldo_anterior: fundo.saldo_atual,
          saldo_posterior: novoSaldo,
          descricao: `Troco devolvido pelo admin - solicitação de ${solicitacao.profiles?.nome}`,
          admin_id: user?.id,
        });
      }
    }

    toast({ title: 'Baixa realizada com sucesso!' });
    setSubmitting(false);
    resetForm();
    onSuccess();
  };

  if (!solicitacao) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Realizar Baixa</DialogTitle>
          <DialogDescription>
            {solicitacao.profiles?.nome} • {solicitacao.empresas?.nome_fantasia} • Valor entregue: {formatCurrency(solicitacao.valor_entregue || 0)}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Nota Fiscal (PDF/JPG/PNG) *</Label>
              <div className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
                file ? "border-success bg-success/5" : "border-border hover:border-primary/50"
              )}>
                {uploading || processing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {uploading ? 'Enviando arquivo...' : 'Processando nota com IA...'}
                    </p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-6 w-6 text-success" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <Button variant="ghost" size="sm" onClick={() => document.getElementById('admin-file-input')?.click()}>
                      Trocar arquivo
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="admin-file-input" className="cursor-pointer">
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para enviar</p>
                  </label>
                )}
                <input
                  id="admin-file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* AI Result Feedback */}
            {aiResult && (
              <div className={cn(
                "p-3 rounded-lg flex items-start gap-3",
                aiResult.confidence_label === 'alta' ? "bg-success/10" :
                aiResult.confidence_label === 'media' ? "bg-warning/10" : "bg-destructive/10"
              )}>
                {aiResult.confidence_label === 'alta' ? (
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                ) : aiResult.confidence_label === 'media' ? (
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    Confiança {aiResult.confidence_label === 'alta' ? 'Alta' : aiResult.confidence_label === 'media' ? 'Média' : 'Baixa'}
                  </p>
                  <p className="text-muted-foreground">
                    Valor: {formatCurrency(aiResult.total_value || 0)}
                  </p>
                </div>
              </div>
            )}

            {aiError && (
              <div className="p-3 rounded-lg bg-destructive/10 flex items-start gap-3">
                <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm">Preencha os campos manualmente</p>
              </div>
            )}

            {/* Form Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor Gasto Real *</Label>
                <Input
                  value={valorGastoDisplay}
                  onChange={(e) => setValorGastoDisplay(maskCurrency(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Emissão</Label>
                <Input
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Número da Nota</Label>
                <Input
                  value={numeroNota}
                  onChange={(e) => setNumeroNota(e.target.value)}
                  placeholder="Ex: 12345"
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ Emitente</Label>
                <Input
                  value={cnpjEmitente}
                  onChange={(e) => setCnpjEmitente(maskCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nome do Emitente</Label>
              <Input
                value={nomeEmitente}
                onChange={(e) => setNomeEmitente(e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição da Compra</Label>
              <Textarea
                value={descricaoCompra}
                onChange={(e) => setDescricaoCompra(e.target.value)}
                placeholder="Descreva o que foi comprado..."
                rows={2}
              />
            </div>

            {/* Troco Preview */}
            {valorGasto > 0 && (
              <div className={cn(
                "p-3 rounded-lg",
                trocoReal > 0 ? "bg-success/10" : trocoReal < 0 ? "bg-warning/10" : "bg-muted"
              )}>
                <div className="grid gap-2 grid-cols-3 text-center text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Entregue</p>
                    <p className="font-medium">{formatCurrency(solicitacao.valor_entregue || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gasto</p>
                    <p className="font-medium">{formatCurrency(valorGasto)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {trocoReal > 0 ? 'Troco' : trocoReal < 0 ? 'Diferença' : 'Troco'}
                    </p>
                    <p className={cn(
                      "font-bold",
                      trocoReal > 0 ? "text-success" : trocoReal < 0 ? "text-warning" : ""
                    )}>
                      {formatCurrency(Math.abs(trocoReal))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!fileUrl || valorGasto <= 0 || submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirmar Baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
