import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, maskCurrency, parseCurrency, maskCNPJ, formatDate } from '@/lib/masks';
import { ArrowLeft, Upload, Loader2, CheckCircle, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number;
  status: string;
  empresa_id: string;
  empresas: { nome_fantasia: string } | null;
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

export default function Baixa() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

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

  useEffect(() => {
    const fetchSolicitacao = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('solicitacoes')
        .select('id, valor_solicitado, valor_entregue, status, empresa_id, empresas(nome_fantasia)')
        .eq('id', id)
        .maybeSingle();

      if (data) {
        setSolicitacao(data as unknown as Solicitacao);
      }
      setLoading(false);
    };
    fetchSolicitacao();
  }, [id]);

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
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `${user?.id}/${id}/${Date.now()}-${selectedFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('notas-fiscais')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('notas-fiscais')
        .getPublicUrl(filePath);

      setFileUrl(filePath);
      setUploading(false);
      setProcessing(true);

      // Process with AI
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  const valorGasto = parseCurrency(valorGastoDisplay);
  const trocoReal = solicitacao ? solicitacao.valor_entregue - valorGasto : 0;

  const handleSubmit = async () => {
    if (!solicitacao || !fileUrl) return;

    setSubmitting(true);
    const newStatus = trocoReal < 0 ? 'pendente_ajuste' : 'baixada';

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
      // Buscar o fundo da empresa
      const { data: fundo } = await supabase
        .from('fundos')
        .select('id, saldo_atual')
        .eq('empresa_id', solicitacao.empresa_id)
        .maybeSingle();

      if (fundo) {
        const novoSaldo = Number(fundo.saldo_atual) + trocoReal;
        
        // Atualizar saldo do fundo
        await supabase.from('fundos').update({
          saldo_atual: novoSaldo,
        }).eq('id', fundo.id);

        // Registrar no histórico
        await supabase.from('historico_fundos').insert({
          fundo_id: fundo.id,
          solicitacao_id: solicitacao.id,
          tipo: 'devolucao_troco',
          valor: trocoReal,
          saldo_anterior: fundo.saldo_atual,
          saldo_posterior: novoSaldo,
          descricao: `Troco devolvido da solicitação`,
        });
      }
    }

    toast({ title: 'Baixa realizada com sucesso!' });
    navigate('/minhas-solicitacoes');
  };

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></AppLayout>;
  }

  if (!solicitacao) {
    return <AppLayout><div className="text-center py-8">Solicitação não encontrada</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Realizar Baixa</CardTitle>
            <CardDescription>
              {solicitacao.empresas?.nome_fantasia} • Valor entregue: {formatCurrency(solicitacao.valor_entregue)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Nota Fiscal (PDF/JPG/PNG) *</Label>
              <div className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                file ? "border-success bg-success/5" : "border-border hover:border-primary/50"
              )}>
                {uploading || processing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {uploading ? 'Enviando arquivo...' : 'Processando nota com IA...'}
                    </p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-success" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <Button variant="ghost" size="sm" onClick={() => document.getElementById('file-input')?.click()}>
                      Trocar arquivo
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="file-input" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para enviar ou arraste o arquivo</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG ou PNG até 5MB</p>
                  </label>
                )}
                <input
                  id="file-input"
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
                  {aiResult.evidence_text && (
                    <p className="text-xs text-muted-foreground mt-1">"{aiResult.evidence_text}"</p>
                  )}
                </div>
              </div>
            )}

            {aiError && (
              <div className="p-4 rounded-lg bg-destructive/10 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-medium">Não foi possível ler a nota automaticamente</p>
                  <p className="text-sm text-muted-foreground">Preencha os campos manualmente abaixo</p>
                </div>
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
                rows={3}
              />
            </div>

            {/* Troco Preview */}
            {valorGasto > 0 && (
              <div className={cn(
                "p-4 rounded-lg",
                trocoReal > 0 ? "bg-success/10" : trocoReal < 0 ? "bg-warning/10" : "bg-muted"
              )}>
                <div className="grid gap-2 sm:grid-cols-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Entregue</p>
                    <p className="font-medium">{formatCurrency(solicitacao.valor_entregue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gasto</p>
                    <p className="font-medium">{formatCurrency(valorGasto)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {trocoReal > 0 ? 'Troco a devolver' : trocoReal < 0 ? 'Diferença a ajustar' : 'Troco'}
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

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => navigate(-1)} className="flex-1">Cancelar</Button>
              <Button 
                onClick={() => setConfirmDialogOpen(true)} 
                disabled={!fileUrl || valorGasto <= 0}
                className="flex-1"
              >
                Confirmar Baixa
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Baixa</DialogTitle>
              <DialogDescription>Revise os dados antes de confirmar</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Solicitado</p>
                  <p className="font-medium">{formatCurrency(solicitacao.valor_solicitado)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor Entregue</p>
                  <p className="font-medium">{formatCurrency(solicitacao.valor_entregue)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor Gasto Real</p>
                  <p className="font-medium">{formatCurrency(valorGasto)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {trocoReal >= 0 ? 'Troco a Devolver' : 'Diferença a Ajustar'}
                  </p>
                  <p className={cn("font-bold", trocoReal < 0 ? "text-warning" : "text-success")}>
                    {formatCurrency(Math.abs(trocoReal))}
                  </p>
                </div>
              </div>
              {trocoReal < 0 && (
                <div className="p-3 rounded bg-warning/10 text-warning text-sm">
                  <AlertTriangle className="inline h-4 w-4 mr-2" />
                  O valor gasto é maior que o entregue. A solicitação ficará pendente de ajuste.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Voltar</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
