import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, maskCurrency, parseCurrency, maskCNPJ, formatDate } from '@/lib/masks';
import { Upload, Loader2, CheckCircle, AlertTriangle, XCircle, FileText, Plus, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NotaFiscalItem {
  id: string; // local uuid
  valor: number;
  upload_url: string;
  arquivo_hash?: string | null;
  data_emissao?: string | null;
  numero_nota?: string | null;
  nome_emitente?: string | null;
  cnpj_emitente?: string | null; // sem máscara
  descricao?: string | null;
  ai_valor_extraido?: number | null;
  ai_confianca?: 'alta' | 'media' | 'baixa' | null;
  ai_evidencia?: string | null;
  ai_status?: 'ok' | 'falhou' | 'pendente' | null;
  ai_processed_at?: string | null;
  fileName?: string;
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

interface Props {
  notas: NotaFiscalItem[];
  onChange: (notas: NotaFiscalItem[]) => void;
  /** prefixo do path dentro do bucket notas-fiscais (ex.: `${userId}/${solicitacaoId}` ou `admin/${adminId}/${solicitacaoId}`) */
  storagePathPrefix: string;
  /** id usado nos inputs file para evitar conflito quando há mais de uma instância na tela */
  inputIdPrefix?: string;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

const sha256 = async (file: File): Promise<string> => {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export function NotasFiscaisManager({ notas, onChange, storagePathPrefix, inputIdPrefix = 'nf' }: Props) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notaToRemove, setNotaToRemove] = useState<NotaFiscalItem | null>(null);

  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [arquivoHash, setArquivoHash] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState(false);

  const [valorDisplay, setValorDisplay] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [numeroNota, setNumeroNota] = useState('');
  const [nomeEmitente, setNomeEmitente] = useState('');
  const [cnpjEmitente, setCnpjEmitente] = useState('');

  const total = notas.reduce((sum, n) => sum + Number(n.valor || 0), 0);

  const resetForm = () => {
    setEditingId(null);
    setFile(null);
    setFileName('');
    setFileUrl(null);
    setArquivoHash(null);
    setAiResult(null);
    setAiError(false);
    setValorDisplay('');
    setDescricao('');
    setDataEmissao('');
    setNumeroNota('');
    setNomeEmitente('');
    setCnpjEmitente('');
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (n: NotaFiscalItem) => {
    setEditingId(n.id);
    setFile(null);
    setFileName(n.fileName || 'Arquivo enviado');
    setFileUrl(n.upload_url);
    setArquivoHash(n.arquivo_hash || null);
    setAiResult(null);
    setAiError(false);
    setValorDisplay(maskCurrency(String(Math.round(Number(n.valor) * 100))));
    setDescricao(n.descricao || '');
    setDataEmissao(n.data_emissao || '');
    setNumeroNota(n.numero_nota || '');
    setNomeEmitente(n.nome_emitente || '');
    setCnpjEmitente(n.cnpj_emitente ? maskCNPJ(n.cnpj_emitente) : '');
    setDialogOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(selected.type)) {
      toast({ title: 'Erro', description: 'Apenas PDF, JPG ou PNG são permitidos', variant: 'destructive' });
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'Arquivo deve ter no máximo 5MB', variant: 'destructive' });
      return;
    }

    setFile(selected);
    setFileName(selected.name);
    setUploading(true);
    setAiResult(null);
    setAiError(false);

    try {
      const hash = await sha256(selected);

      // bloquear arquivo duplicado dentro da mesma baixa
      if (notas.some(n => n.id !== editingId && n.arquivo_hash === hash)) {
        toast({ title: 'Arquivo duplicado', description: 'Esta nota já foi anexada nesta baixa', variant: 'destructive' });
        setUploading(false);
        setFile(null);
        setFileName('');
        return;
      }
      setArquivoHash(hash);

      // sanitização básica do nome
      const safeName = selected.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${storagePathPrefix}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from('notas-fiscais').upload(filePath, selected);
      if (uploadError) throw uploadError;

      setFileUrl(filePath);
      setUploading(false);
      setProcessing(true);

      const base64 = await fileToBase64(selected);
      const { data: aiData, error: aiErr } = await supabase.functions.invoke('leitor-notas', {
        body: { file_base64: base64, file_type: selected.type },
      });

      if (aiErr || !aiData?.total_value) {
        setAiError(true);
        toast({ title: 'IA não conseguiu ler a nota', description: 'Preencha os campos manualmente', variant: 'destructive' });
      } else {
        setAiResult(aiData as AIResult);
        setValorDisplay(maskCurrency(String(Math.round((aiData.total_value as number) * 100))));
        if (aiData.extracted_fields?.data_emissao) setDataEmissao(aiData.extracted_fields.data_emissao);
        if (aiData.extracted_fields?.numero_nota) setNumeroNota(aiData.extracted_fields.numero_nota);
        if (aiData.extracted_fields?.nome_emitente) setNomeEmitente(aiData.extracted_fields.nome_emitente);
        if (aiData.extracted_fields?.cnpj_emitente) setCnpjEmitente(maskCNPJ(aiData.extracted_fields.cnpj_emitente));
        toast({ title: 'Nota processada!', description: 'Campos preenchidos automaticamente' });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao processar arquivo', variant: 'destructive' });
      setAiError(true);
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleSaveNota = () => {
    const valor = parseCurrency(valorDisplay);
    if (!fileUrl) {
      toast({ title: 'Anexe a nota fiscal', variant: 'destructive' });
      return;
    }
    if (valor <= 0) {
      toast({ title: 'Informe o valor da nota', variant: 'destructive' });
      return;
    }

    const item: NotaFiscalItem = {
      id: editingId || crypto.randomUUID(),
      valor,
      upload_url: fileUrl,
      arquivo_hash: arquivoHash,
      data_emissao: dataEmissao || null,
      numero_nota: numeroNota || null,
      nome_emitente: nomeEmitente || null,
      cnpj_emitente: cnpjEmitente.replace(/\D/g, '') || null,
      descricao: descricao || null,
      ai_valor_extraido: aiResult?.total_value ?? null,
      ai_confianca: aiResult?.confidence_label ?? null,
      ai_evidencia: aiResult?.evidence_text ?? null,
      ai_status: aiResult ? 'ok' : aiError ? 'falhou' : 'pendente',
      ai_processed_at: new Date().toISOString(),
      fileName,
    };

    const next = editingId
      ? notas.map(n => (n.id === editingId ? item : n))
      : [...notas, item];

    onChange(next);
    setDialogOpen(false);
    resetForm();
  };

  const handleRemove = (id: string) => {
    onChange(notas.filter(n => n.id !== id));
  };

  const inputId = `${inputIdPrefix}-file-input`;

  return (
    <div className="space-y-3">
      {notas.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma nota anexada</p>
          <p className="text-xs text-muted-foreground mt-1">Adicione uma ou mais notas fiscais para esta baixa</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notas.map((n, idx) => (
            <div key={n.id} className="border border-border rounded-lg p-3 flex items-start gap-3">
              <div className="bg-primary/10 text-primary rounded h-8 w-8 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{n.nome_emitente || n.fileName || 'Nota fiscal'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {n.numero_nota ? `Nº ${n.numero_nota}` : '—'}
                      {n.data_emissao ? ` • ${formatDate(n.data_emissao)}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold whitespace-nowrap">{formatCurrency(Number(n.valor))}</p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(n)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemove(n.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar nota
        </Button>
        {notas.length > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">Total:</span>{' '}
            <span className="font-semibold">{formatCurrency(total)}</span>
          </p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar nota fiscal' : 'Adicionar nota fiscal'}</DialogTitle>
            <DialogDescription>
              Faça upload do arquivo e revise os dados extraídos pela IA.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Arquivo (PDF/JPG/PNG) *</Label>
                <div className={cn(
                  'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
                  fileUrl ? 'border-success bg-success/5' : 'border-border hover:border-primary/50'
                )}>
                  {uploading || processing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        {uploading ? 'Enviando arquivo...' : 'Processando com IA...'}
                      </p>
                    </div>
                  ) : fileUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-6 w-6 text-success" />
                      <p className="text-sm font-medium truncate max-w-full">{fileName}</p>
                      <Button type="button" variant="ghost" size="sm" onClick={() => document.getElementById(inputId)?.click()}>
                        Trocar arquivo
                      </Button>
                    </div>
                  ) : (
                    <label htmlFor={inputId} className="cursor-pointer block">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Clique para enviar</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, JPG ou PNG até 5MB</p>
                    </label>
                  )}
                  <input id={inputId} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                </div>
              </div>

              {aiResult && (
                <div className={cn(
                  'p-3 rounded-lg flex items-start gap-3',
                  aiResult.confidence_label === 'alta' ? 'bg-success/10' :
                  aiResult.confidence_label === 'media' ? 'bg-warning/10' : 'bg-destructive/10'
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
                    <p className="text-muted-foreground">Valor: {formatCurrency(aiResult.total_value || 0)}</p>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="p-3 rounded-lg bg-destructive/10 flex items-start gap-3">
                  <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm">Preencha os campos manualmente</p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Valor desta nota *</Label>
                  <Input value={valorDisplay} onChange={(e) => setValorDisplay(maskCurrency(e.target.value))} placeholder="R$ 0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Número da Nota</Label>
                  <Input value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} placeholder="Ex: 12345" />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ Emitente</Label>
                  <Input value={cnpjEmitente} onChange={(e) => setCnpjEmitente(maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nome do Emitente</Label>
                <Input value={nomeEmitente} onChange={(e) => setNomeEmitente(e.target.value)} placeholder="Nome da empresa" />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que foi comprado nesta nota..." rows={2} />
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button type="button" onClick={handleSaveNota} disabled={!fileUrl || uploading || processing}>
              {editingId ? 'Salvar alterações' : 'Adicionar nota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
