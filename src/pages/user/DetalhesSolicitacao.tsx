import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { NotaFiscalPreview } from '@/components/solicitacoes/NotaFiscalPreview';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/masks';
import { ArrowLeft, Loader2, FileText, Building2, Calendar, DollarSign, Receipt, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Solicitacao {
  id: string;
  solicitante_user_id: string;
  valor_solicitado: number;
  valor_entregue: number | null;
  valor_gasto_real: number | null;
  troco_real: number | null;
  status: 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';
  created_at: string;
  data_aprovacao: string | null;
  data_baixa: string | null;
  justificativa: string;
  categoria: string | null;
  motivo_rejeicao: string | null;
  observacoes_admin: string | null;
  forma_entrega: string | null;
  descricao_compra: string | null;
  upload_nota_fiscal_url: string | null;
  data_emissao_nota: string | null;
  numero_nota: string | null;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  ai_valor_extraido: number | null;
  ai_confianca: 'alta' | 'media' | 'baixa' | null;
  ai_status: 'pendente' | 'processado' | 'erro' | null;
  tipo_ajuste: 'complemento_fundo' | 'reembolso_usuario' | null;
  valor_ajuste: number | null;
  data_ajuste: string | null;
  observacao_ajuste: string | null;
  empresas: { nome_fantasia: string } | null;
  profiles: { nome: string } | null;
}

export default function DetalhesSolicitacao() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasConsultiveAccess } = useAuth();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSolicitacao = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('solicitacoes')
        .select(`
          id, solicitante_user_id, valor_solicitado, valor_entregue, valor_gasto_real, troco_real, status, 
          created_at, data_aprovacao, data_baixa, justificativa, categoria, 
          motivo_rejeicao, observacoes_admin, forma_entrega, descricao_compra, 
          upload_nota_fiscal_url, data_emissao_nota, numero_nota, nome_emitente, cnpj_emitente,
          ai_valor_extraido, ai_confianca, ai_status,
          tipo_ajuste, valor_ajuste, data_ajuste, observacao_ajuste,
          empresas(nome_fantasia), profiles:solicitante_user_id(nome)
        `)
        .eq('id', id)
        .maybeSingle();

      if (data) {
        setSolicitacao(data as unknown as Solicitacao);
      }
      setLoading(false);
    };
    fetchSolicitacao();
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!solicitacao) {
    return (
      <AppLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">Solicitação não encontrada</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
        </div>
      </AppLayout>
    );
  }

  // Check if current user is the owner (not consultivo viewing)
  const isOwner = user?.id === solicitacao.solicitante_user_id;
  const ajusteResolvido = !!solicitacao.tipo_ajuste;
  const canDoBaixa = isOwner && !ajusteResolvido && (solicitacao.status === 'entregue' || solicitacao.status === 'pendente_ajuste');

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Detalhes da Solicitação</h1>
          <StatusBadge status={solicitacao.status} />
        </div>

        {/* Main Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {solicitacao.empresas?.nome_fantasia || 'Empresa não informada'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Values Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Valor Solicitado</p>
                <p className="text-xl font-bold">{formatCurrency(solicitacao.valor_solicitado)}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Valor Entregue</p>
                <p className="text-xl font-bold">
                  {solicitacao.valor_entregue ? formatCurrency(solicitacao.valor_entregue) : '-'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Valor Gasto</p>
                <p className="text-xl font-bold">
                  {solicitacao.valor_gasto_real ? formatCurrency(solicitacao.valor_gasto_real) : '-'}
                </p>
              </div>
            </div>

            {/* Troco Info */}
            {solicitacao.troco_real !== null && (
              <div className={`p-4 rounded-lg ${solicitacao.troco_real >= 0 ? 'bg-success/10' : 'bg-warning/10'}`}>
                <p className="text-sm text-muted-foreground">
                  {solicitacao.troco_real >= 0 ? 'Troco Devolvido' : 'Diferença a Ajustar'}
                </p>
                <p className={`text-xl font-bold ${solicitacao.troco_real >= 0 ? 'text-success' : 'text-warning'}`}>
                  {formatCurrency(Math.abs(solicitacao.troco_real))}
                </p>
              </div>
            )}

            {/* Dates and Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Data da Solicitação</p>
                  <p className="font-medium">{formatDate(solicitacao.created_at)}</p>
                </div>
              </div>
              {solicitacao.data_aprovacao && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Data de Aprovação</p>
                    <p className="font-medium">{formatDate(solicitacao.data_aprovacao)}</p>
                  </div>
                </div>
              )}
              {solicitacao.data_baixa && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Data da Baixa</p>
                    <p className="font-medium">{formatDate(solicitacao.data_baixa)}</p>
                  </div>
                </div>
              )}
              {solicitacao.categoria && (
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Categoria</p>
                    <p className="font-medium">{solicitacao.categoria}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Justification */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">Justificativa</p>
              <p className="p-3 rounded-lg bg-muted/50">{solicitacao.justificativa}</p>
            </div>

            {/* Purchase Description */}
            {solicitacao.descricao_compra && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Descrição da Compra</p>
                <p className="p-3 rounded-lg bg-muted/50">{solicitacao.descricao_compra}</p>
              </div>
            )}

            {/* Admin Observations */}
            {solicitacao.observacoes_admin && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Observações do Admin</p>
                <p className="p-3 rounded-lg bg-muted/50">{solicitacao.observacoes_admin}</p>
              </div>
            )}

            {/* Rejection Reason */}
            {solicitacao.motivo_rejeicao && (
              <div className="p-4 rounded-lg bg-destructive/10">
                <p className="text-sm text-muted-foreground mb-1">Motivo da Rejeição</p>
                <p className="text-destructive">{solicitacao.motivo_rejeicao}</p>
              </div>
            )}

            {/* Nota Fiscal Section */}
            {solicitacao.upload_nota_fiscal_url && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Nota Fiscal Anexada</h3>
                </div>

                {/* AI Extracted Data */}
                {(solicitacao.numero_nota || solicitacao.nome_emitente || solicitacao.ai_valor_extraido) && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Bot className="h-4 w-4" />
                      <span>Dados extraídos automaticamente</span>
                      {solicitacao.ai_confianca && (
                        <Badge variant={
                          solicitacao.ai_confianca === 'alta' ? 'default' :
                          solicitacao.ai_confianca === 'media' ? 'secondary' : 'destructive'
                        }>
                          Confiança {solicitacao.ai_confianca}
                        </Badge>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {solicitacao.numero_nota && (
                        <div>
                          <p className="text-xs text-muted-foreground">Número da Nota</p>
                          <p className="font-medium">{solicitacao.numero_nota}</p>
                        </div>
                      )}
                      {solicitacao.data_emissao_nota && (
                        <div>
                          <p className="text-xs text-muted-foreground">Data de Emissão</p>
                          <p className="font-medium">{formatDate(solicitacao.data_emissao_nota)}</p>
                        </div>
                      )}
                      {solicitacao.nome_emitente && (
                        <div>
                          <p className="text-xs text-muted-foreground">Emitente</p>
                          <p className="font-medium">{solicitacao.nome_emitente}</p>
                        </div>
                      )}
                      {solicitacao.cnpj_emitente && (
                        <div>
                          <p className="text-xs text-muted-foreground">CNPJ Emitente</p>
                          <p className="font-medium">{solicitacao.cnpj_emitente}</p>
                        </div>
                      )}
                      {solicitacao.ai_valor_extraido && (
                        <div>
                          <p className="text-xs text-muted-foreground">Valor Extraído (IA)</p>
                          <p className="font-medium">{formatCurrency(solicitacao.ai_valor_extraido)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* File Preview */}
                <NotaFiscalPreview filePath={solicitacao.upload_nota_fiscal_url} />
              </div>
            )}

            {/* Actions */}
            {canDoBaixa && (
              <div className="pt-4 border-t">
                <Button asChild className="w-full sm:w-auto">
                  <Link to={`/baixa/${solicitacao.id}`}>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Fazer Baixa
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
