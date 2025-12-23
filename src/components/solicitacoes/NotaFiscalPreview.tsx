import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FileText, Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

interface NotaFiscalPreviewProps {
  filePath: string;
}

export function NotaFiscalPreview({ filePath }: NotaFiscalPreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(filePath);

  useEffect(() => {
    const getSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from('notas-fiscais')
          .createSignedUrl(filePath, 3600); // 1 hour

        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (err) {
        console.error('Erro ao gerar URL assinada:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    getSignedUrl();
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando nota fiscal...</span>
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Erro ao carregar nota fiscal</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isImage && (
        <div className="rounded-lg overflow-hidden border bg-muted/30">
          <img
            src={signedUrl}
            alt="Nota Fiscal"
            className="max-w-full max-h-96 object-contain mx-auto"
          />
        </div>
      )}
      
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={signedUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            {isImage ? 'Abrir Imagem' : 'Visualizar PDF'}
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={signedUrl} download>
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </a>
        </Button>
      </div>
    </div>
  );
}
