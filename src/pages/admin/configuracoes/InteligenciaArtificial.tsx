import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck, ShieldAlert, ExternalLink, RefreshCw, Sparkles, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Provider = 'lovable' | 'openai';

interface AiConfig {
  id: string;
  provider: Provider;
  openai_model: string;
  lovable_model: string;
}

interface KeyStatus {
  configured: boolean;
  valid: boolean;
  message: string;
  masked?: string;
}

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (recomendado para PDF)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (mais barato)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

const LOVABLE_MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido)' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (preciso)' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
];

export default function InteligenciaArtificial() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [checkingKey, setCheckingKey] = useState(false);

  useEffect(() => {
    loadConfig();
    checkKey();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('ai_config').select('*').limit(1).maybeSingle();
    if (error) {
      toast.error('Erro ao carregar configuração: ' + error.message);
    } else if (data) {
      setConfig(data as AiConfig);
    }
    setLoading(false);
  };

  const checkKey = async () => {
    setCheckingKey(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-openai-key');
      if (error) throw error;
      setKeyStatus(data as KeyStatus);
    } catch (e: any) {
      setKeyStatus({ configured: false, valid: false, message: e?.message ?? 'Erro ao verificar chave' });
    } finally {
      setCheckingKey(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from('ai_config')
      .update({
        provider: config.provider,
        openai_model: config.openai_model,
        lovable_model: config.lovable_model,
        updated_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq('id', config.id);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Configuração salva!');
      if (config.provider === 'openai' && !keyStatus?.valid) {
        toast.warning('Atenção: chave OpenAI não está válida. Atualize-a antes de processar notas.');
      }
    }
    setSaving(false);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Provedor de IA para Leitura de Notas
          </CardTitle>
          <CardDescription>
            Escolha qual serviço de IA será usado para extrair dados das notas fiscais enviadas pelos usuários.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={config.provider}
            onValueChange={(v) => setConfig({ ...config, provider: v as Provider })}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="lovable" id="lovable" className="mt-1" />
              <div className="flex-1 space-y-1">
                <Label htmlFor="lovable" className="text-base font-semibold cursor-pointer">
                  Lovable AI <Badge variant="secondary" className="ml-2">Padrão</Badge>
                </Label>
                <p className="text-sm text-muted-foreground">
                  Usa o gateway de IA da Lovable. Não precisa de chave externa, mas consome créditos do workspace.
                </p>
                {config.provider === 'lovable' && (
                  <div className="mt-3">
                    <Label className="text-xs">Modelo</Label>
                    <Select
                      value={config.lovable_model}
                      onValueChange={(v) => setConfig({ ...config, lovable_model: v })}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOVABLE_MODELS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="openai" id="openai" className="mt-1" />
              <div className="flex-1 space-y-1">
                <Label htmlFor="openai" className="text-base font-semibold cursor-pointer">
                  OpenAI (sua chave)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Usa sua própria chave da OpenAI. Cobrança vai direto para sua conta OpenAI (~US$ 0,01–0,03 por nota).
                </p>
                {config.provider === 'openai' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label className="text-xs">Modelo</Label>
                      <Select
                        value={config.openai_model}
                        onValueChange={(v) => setConfig({ ...config, openai_model: v })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPENAI_MODELS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Chave da OpenAI
          </CardTitle>
          <CardDescription>
            A chave fica armazenada criptografada no backend (secret <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code>) e nunca é exposta ao navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkingKey ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
            </div>
          ) : keyStatus ? (
            keyStatus.valid ? (
              <Alert className="border-green-500/50 bg-green-500/5">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <AlertDescription className="ml-2">
                  <strong className="text-green-700">Chave válida e conectada</strong>
                  {keyStatus.masked && (
                    <span className="block text-xs text-muted-foreground mt-1 font-mono">{keyStatus.masked}</span>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <strong>{keyStatus.configured ? 'Chave inválida' : 'Chave não configurada'}</strong>
                  <span className="block text-sm mt-1">{keyStatus.message}</span>
                </AlertDescription>
              </Alert>
            )
          ) : null}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <p className="font-semibold">Como atualizar sua chave OpenAI:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Crie uma chave em{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  platform.openai.com/api-keys <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Garanta que sua conta tem créditos em platform.openai.com/billing</li>
              <li>
                Peça ao assistente Lovable: <em>"atualize o secret OPENAI_API_KEY"</em> — ele abrirá um campo seguro para você colar a chave nova.
              </li>
              <li>Depois clique em <strong>"Verificar agora"</strong> abaixo.</li>
            </ol>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={checkKey} disabled={checkingKey}>
              <RefreshCw className={`mr-2 h-4 w-4 ${checkingKey ? 'animate-spin' : ''}`} />
              Verificar agora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
