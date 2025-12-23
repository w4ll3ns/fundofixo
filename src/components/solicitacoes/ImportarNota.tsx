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
import { maskCurrency, parseCurrency, formatCurrency } from '@/lib/masks';
import { LIMITE_MAXIMO_SOLICITACAO } from '@/lib/constants';
import { 
  Loader2, AlertTriangle, Info, FileText, Upload, CheckCircle, XCircle, 
  ArrowRight, ArrowLeft, Files 
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { StepIndicator } from './importar-nota/StepIndicator';
import { NotaSelectionCard } from './importar-nota/NotaSelectionCard';
import { useImportarNota } from './importar-nota/useImportarNota';
import { categorias } from './importar-nota/types';

interface ImportarNotaProps {
  onSuccess?: () => void;
}

export function ImportarNota({ onSuccess }: ImportarNotaProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const {
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
    setStep,
    setSharedForm,
    setSubmitting,
    handleFileChange,
    toggleNotaSelecionada,
    updateNotaFormData,
    consultarCnpjsParaNotas,
    resetImport,
    getSaldoDisponivel,
    getFundo,
  } = useImportarNota();

  const hasMultipleNotas = notasExtraidas.length > 1;
  const saldoDisponivel = getSaldoDisponivel(sharedForm.empresa_id);
  const selectedFundo = getFundo(sharedForm.empresa_id);

  // Validations
  const canProceedUpload = file && fileUrl && !uploading && !processing && 
    !(duplicatasPorNota.get(0)?.tipo === 'hash' && notasExtraidas.length === 0);
  const canProceedSelecao = notasSelecionadas.length > 0;
  const canProceedForm = sharedForm.empresa_id && sharedForm.justificativa.trim().length > 0 &&
    notasSelecionadas.every(i => {
      const fd = notasFormData.get(i);
      return fd && fd.valor_solicitado > 0;
    });

  const handleProceedFromUpload = () => {
    if (notasExtraidas.length > 1) {
      setStep('selecao');
    } else if (notasExtraidas.length === 1) {
      // Single nota - skip selection
      setStep('form');
    }
  };

  const handleSubmit = async () => {
    if (!user || !fileUrl || !sharedForm.empresa_id || !selectedFundo) return;

    setSubmitting(true);

    try {
      const now = new Date().toISOString();
      let saldoAtual = saldoDisponivel;
      const createdIds: string[] = [];

      for (const index of notasSelecionadas) {
        const formData = notasFormData.get(index);
        const nota = notasExtraidas[index];
        if (!formData) continue;

        const valor = formData.valor_solicitado;

        const { data: solicitacao, error: solError } = await supabase
          .from('solicitacoes')
          .insert({
            solicitante_user_id: user.id,
            empresa_id: sharedForm.empresa_id,
            tipo_solicitacao: 'FUNDO_FIXO',
            valor_solicitado: valor,
            valor_entregue: valor,
            valor_gasto_real: valor,
            troco_real: 0,
            justificativa: sharedForm.justificativa,
            categoria: formData.categoria || null,
            descricao_compra: formData.descricaoCompra || null,
            upload_nota_fiscal_url: fileUrl,
            arquivo_hash: fileHash,
            data_emissao_nota: formData.dataEmissao || null,
            numero_nota: formData.numeroNota || null,
            nome_emitente: formData.nomeEmitente || null,
            cnpj_emitente: formData.cnpjEmitente.replace(/\D/g, '') || null,
            status: 'baixada',
            data_aprovacao: now,
            data_baixa: now,
            ai_valor_extraido: nota?.total_value || null,
            ai_confianca: nota?.confidence_label || null,
            ai_evidencia: nota?.evidence_text || null,
            ai_status: nota ? 'ok' : 'pendente',
            ai_processed_at: now,
            excedeu_saldo: valor > saldoAtual,
            excedeu_limite_maximo: valor > LIMITE_MAXIMO_SOLICITACAO,
          })
          .select('id')
          .single();

        if (solError) throw solError;

        const novoSaldo = saldoAtual - valor;
        
        await supabase.from('historico_fundos').insert({
          fundo_id: selectedFundo.id,
          solicitacao_id: solicitacao.id,
          tipo: 'solicitacao_retroativa',
          valor: -valor,
          saldo_anterior: saldoAtual,
          saldo_posterior: novoSaldo,
          descricao: `Importação de nota retroativa - ${formData.nomeEmitente || 'Fornecedor'} (Pág ${nota?.pagina || index + 1})`,
        });

        saldoAtual = novoSaldo;
        createdIds.push(solicitacao.id);
      }

      // Update fundo with final balance
      await supabase.from('fundos').update({
        saldo_atual: saldoAtual,
      }).eq('id', selectedFundo.id);

      toast({ 
        title: `${createdIds.length} nota(s) importada(s) com sucesso!`, 
        description: 'Solicitações criadas e baixadas automaticamente' 
      });

      if (onSuccess) {
        onSuccess();
      } else if (createdIds.length === 1) {
        navigate(`/solicitacao/${createdIds[0]}`);
      } else {
        navigate('/minhas-solicitacoes?tab=lista');
      }
    } catch (error: any) {
      toast({ 
        title: 'Erro ao importar notas', 
        description: error.message || 'Tente novamente', 
        variant: 'destructive' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'upload') {
      resetImport();
    } else if (step === 'selecao') {
      setStep('upload');
    } else if (step === 'form') {
      setStep(hasMultipleNotas ? 'selecao' : 'upload');
    } else if (step === 'confirm') {
      setStep('form');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar Nota Fiscal</CardTitle>
        <CardDescription>
          Importe notas fiscais para criar automaticamente as solicitações e baixas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <StepIndicator currentStep={step} hasMultipleNotas={hasMultipleNotas} />

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              duplicatasPorNota.get(0)?.tipo === 'hash' && notasExtraidas.length === 0 
                ? "border-destructive bg-destructive/5" :
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
                    {uploading ? 'Enviando arquivo...' : 'Processando nota(s) com IA...'}
                  </p>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  {notasExtraidas.length > 1 ? (
                    <Files className="h-10 w-10 text-success" />
                  ) : (
                    <FileText className={cn(
                      "h-10 w-10", 
                      duplicatasPorNota.get(0)?.tipo === 'hash' ? "text-destructive" : "text-success"
                    )} />
                  )}
                  <p className="font-medium">{file.name}</p>
                  {notasExtraidas.length > 1 && (
                    <p className="text-sm text-success font-medium">
                      {notasExtraidas.length} notas fiscais encontradas
                    </p>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-file-input')?.click()}>
                    Trocar arquivo
                  </Button>
                </div>
              ) : (
                <label htmlFor="import-file-input" className="cursor-pointer">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">Clique para enviar a nota fiscal</p>
                  <p className="text-sm text-muted-foreground mt-1">PDF, JPG ou PNG até 10MB</p>
                  <p className="text-xs text-muted-foreground mt-1">PDFs com múltiplas páginas são suportados</p>
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

            {/* Alerta de duplicata por hash (arquivo inteiro) */}
            {duplicatasPorNota.get(0)?.tipo === 'hash' && notasExtraidas.length === 0 && (
              <div className="p-4 rounded-lg bg-destructive/10 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Este arquivo já foi importado!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {duplicatasPorNota.get(0)?.nome_emitente && `Emitente: ${duplicatasPorNota.get(0)?.nome_emitente}`}
                    {duplicatasPorNota.get(0)?.numero_nota && ` • Nota: ${duplicatasPorNota.get(0)?.numero_nota}`}
                  </p>
                  <Button 
                    variant="link" 
                    className="p-0 h-auto text-primary" 
                    onClick={() => navigate(`/solicitacao/${duplicatasPorNota.get(0)?.id}`)}
                  >
                    Ver solicitação existente →
                  </Button>
                </div>
              </div>
            )}

            {/* Result summary */}
            {notasExtraidas.length > 0 && (
              <div className={cn(
                "p-4 rounded-lg flex items-start gap-3",
                "bg-success/10"
              )}>
                <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    {notasExtraidas.length} nota(s) fiscal(is) identificada(s)
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Valor total: {formatCurrency(notasExtraidas.reduce((sum, n) => sum + (n.total_value || 0), 0))}
                  </p>
                </div>
              </div>
            )}

            {aiError && (
              <div className="p-4 rounded-lg bg-destructive/10 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-medium">Não foi possível ler o documento</p>
                  <p className="text-sm text-muted-foreground">Verifique se o arquivo contém notas fiscais legíveis</p>
                </div>
              </div>
            )}

            <Button 
              onClick={handleProceedFromUpload} 
              disabled={!canProceedUpload || notasExtraidas.length === 0}
              className="w-full"
            >
              {notasExtraidas.length > 1 ? 'Selecionar Notas' : 'Continuar'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Selection (only for multiple notas) */}
        {step === 'selecao' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Selecione as notas que deseja importar:
              </p>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  const allIndices = notasExtraidas.map((_, i) => i)
                    .filter(i => duplicatasPorNota.get(i)?.tipo !== 'hash');
                  if (notasSelecionadas.length === allIndices.length) {
                    // Deselect all
                    for (const i of allIndices) toggleNotaSelecionada(i);
                  } else {
                    // Select all
                    for (const i of allIndices) {
                      if (!notasSelecionadas.includes(i)) toggleNotaSelecionada(i);
                    }
                  }
                }}
              >
                {notasSelecionadas.length === notasExtraidas.filter((_, i) => duplicatasPorNota.get(i)?.tipo !== 'hash').length 
                  ? 'Desmarcar Todas' : 'Selecionar Todas'}
              </Button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {notasExtraidas.map((nota, index) => (
                <NotaSelectionCard
                  key={index}
                  nota={nota}
                  index={index}
                  selected={notasSelecionadas.includes(index)}
                  onToggle={() => toggleNotaSelecionada(index)}
                  duplicata={duplicatasPorNota.get(index)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">
                {notasSelecionadas.length} de {notasExtraidas.length} selecionada(s)
              </span>
              <span className="font-medium">
                Total: {formatCurrency(notasSelecionadas.reduce((sum, i) => sum + (notasExtraidas[i]?.total_value || 0), 0))}
              </span>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button 
                onClick={() => {
                  consultarCnpjsParaNotas();
                  setStep('form');
                }} 
                disabled={!canProceedSelecao}
                className="flex-1"
              >
                Continuar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Form */}
        {step === 'form' && (
          <div className="space-y-4">
            {/* Shared fields */}
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
              <p className="text-sm font-medium">Dados comuns a todas as notas:</p>
              
              <div className="space-y-2">
                <Label>Empresa / Fundo Fixo *</Label>
                <Select 
                  value={sharedForm.empresa_id} 
                  onValueChange={(value) => setSharedForm({ ...sharedForm, empresa_id: value })}
                >
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

              <div className="space-y-2">
                <Label>Justificativa *</Label>
                <Textarea
                  value={sharedForm.justificativa}
                  onChange={(e) => setSharedForm({ ...sharedForm, justificativa: e.target.value })}
                  placeholder="Descreva o motivo das compras..."
                  rows={3}
                />
              </div>
            </div>

            {/* Individual nota forms */}
            <div className="space-y-4">
              <p className="text-sm font-medium">Dados de cada nota:</p>
              
              {notasSelecionadas.map((index) => {
                const nota = notasExtraidas[index];
                const formData = notasFormData.get(index);
                if (!formData) return null;

                return (
                  <div key={index} className="p-4 rounded-lg border border-border space-y-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Página {nota.pagina}</span>
                      {nota.confidence_label === 'alta' ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : nota.confidence_label === 'media' ? (
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Valor da Nota *</Label>
                        <Input
                          value={formData.valorDisplay}
                          onChange={(e) => {
                            const masked = maskCurrency(e.target.value);
                            updateNotaFormData(index, {
                              valorDisplay: masked,
                              valor_solicitado: parseCurrency(masked),
                            });
                          }}
                          placeholder="R$ 0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select 
                          value={formData.categoria} 
                          onValueChange={(value) => updateNotaFormData(index, { categoria: value })}
                        >
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

                    {/* Fornecedor */}
                    {(formData.nomeEmitente || formData.cnpjEmitente) && (
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
                              value={formData.nomeEmitente}
                              onChange={(e) => updateNotaFormData(index, { nomeEmitente: e.target.value })}
                              placeholder="Nome do fornecedor"
                            />
                          </div>
                          {formData.cnpjEmitente && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>CNPJ:</span>
                              <span className="font-mono">{formData.cnpjEmitente}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Descrição da Compra</Label>
                      <Input
                        value={formData.descricaoCompra}
                        onChange={(e) => updateNotaFormData(index, { descricaoCompra: e.target.value })}
                        placeholder="O que foi comprado?"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {valorTotalSelecionado > saldoDisponivel && sharedForm.empresa_id && (
              <div className="p-3 rounded-lg bg-warning/10 text-warning text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  Valor total ({formatCurrency(valorTotalSelecionado)}) excede o saldo disponível ({formatCurrency(saldoDisponivel)})
                </span>
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

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empresa:</span>
                <span className="font-medium">{empresas.find(e => e.id === sharedForm.empresa_id)?.nome_fantasia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notas a importar:</span>
                <span className="font-medium">{notasSelecionadas.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor total:</span>
                <span className="font-medium">{formatCurrency(valorTotalSelecionado)}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-sm">{sharedForm.justificativa}</p>
              </div>
            </div>

            {/* Detail per nota */}
            <div className="space-y-2">
              {notasSelecionadas.map((index) => {
                const nota = notasExtraidas[index];
                const formData = notasFormData.get(index);
                if (!formData) return null;

                return (
                  <div key={index} className="p-3 rounded-lg border border-border text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Pág {nota.pagina}</span>
                      <span className="font-medium">{formatCurrency(formData.valor_solicitado)}</span>
                    </div>
                    {formData.nomeEmitente && (
                      <p className="text-muted-foreground truncate">{formData.nomeEmitente}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Ao confirmar, {notasSelecionadas.length > 1 ? 'as solicitações serão criadas' : 'a solicitação será criada'} com status <strong>baixada</strong> e o valor total será debitado do saldo do fundo fixo.
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
