export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      dominios_email_permitidos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          dominio: string
          id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          dominio: string
          id?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          dominio?: string
          id?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          nome_fantasia: string
          status: boolean
          unidade: string | null
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          nome_fantasia: string
          status?: boolean
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          nome_fantasia?: string
          status?: boolean
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          atividade_principal: string | null
          cnpj: string
          consultado_em: string | null
          created_at: string | null
          endereco_completo: string | null
          id: string
          nome_fantasia: string | null
          razao_social: string | null
          situacao: string | null
        }
        Insert: {
          atividade_principal?: string | null
          cnpj: string
          consultado_em?: string | null
          created_at?: string | null
          endereco_completo?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social?: string | null
          situacao?: string | null
        }
        Update: {
          atividade_principal?: string | null
          cnpj?: string
          consultado_em?: string | null
          created_at?: string | null
          endereco_completo?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social?: string | null
          situacao?: string | null
        }
        Relationships: []
      }
      fundos: {
        Row: {
          empresa_id: string
          id: string
          saldo_atual: number
          saldo_minimo_alerta: number | null
          updated_at: string
        }
        Insert: {
          empresa_id: string
          id?: string
          saldo_atual?: number
          saldo_minimo_alerta?: number | null
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          id?: string
          saldo_atual?: number
          saldo_minimo_alerta?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_fundos: {
        Row: {
          admin_id: string | null
          created_at: string
          descricao: string | null
          fundo_id: string
          id: string
          saldo_anterior: number
          saldo_posterior: number
          solicitacao_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          descricao?: string | null
          fundo_id: string
          id?: string
          saldo_anterior: number
          saldo_posterior: number
          solicitacao_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          descricao?: string | null
          fundo_id?: string
          id?: string
          saldo_anterior?: number
          saldo_posterior?: number
          solicitacao_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_fundos_fundo_id_fkey"
            columns: ["fundo_id"]
            isOneToOne: false
            referencedRelation: "fundos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fundos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem: string
          tipo?: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      solicitacoes: {
        Row: {
          admin_aprovador_id: string | null
          ai_confianca: Database["public"]["Enums"]["nivel_confianca"] | null
          ai_evidencia: string | null
          ai_processed_at: string | null
          ai_status: Database["public"]["Enums"]["ai_status"] | null
          ai_valor_extraido: number | null
          arquivo_hash: string | null
          categoria: string | null
          cnpj_emitente: string | null
          created_at: string
          data_aprovacao: string | null
          data_baixa: string | null
          data_emissao_nota: string | null
          descricao_compra: string | null
          empresa_id: string
          excedeu_limite_maximo: boolean
          excedeu_saldo: boolean
          forma_entrega: string | null
          id: string
          justificativa: string
          justificativa_excesso_admin: string | null
          motivo_rejeicao: string | null
          nome_emitente: string | null
          numero_nota: string | null
          observacoes_admin: string | null
          solicitante_user_id: string
          status: Database["public"]["Enums"]["status_solicitacao"]
          tipo_solicitacao: Database["public"]["Enums"]["tipo_solicitacao"]
          troco_real: number | null
          updated_at: string
          upload_nota_fiscal_url: string | null
          valor_entregue: number | null
          valor_gasto_real: number | null
          valor_solicitado: number
        }
        Insert: {
          admin_aprovador_id?: string | null
          ai_confianca?: Database["public"]["Enums"]["nivel_confianca"] | null
          ai_evidencia?: string | null
          ai_processed_at?: string | null
          ai_status?: Database["public"]["Enums"]["ai_status"] | null
          ai_valor_extraido?: number | null
          arquivo_hash?: string | null
          categoria?: string | null
          cnpj_emitente?: string | null
          created_at?: string
          data_aprovacao?: string | null
          data_baixa?: string | null
          data_emissao_nota?: string | null
          descricao_compra?: string | null
          empresa_id: string
          excedeu_limite_maximo?: boolean
          excedeu_saldo?: boolean
          forma_entrega?: string | null
          id?: string
          justificativa: string
          justificativa_excesso_admin?: string | null
          motivo_rejeicao?: string | null
          nome_emitente?: string | null
          numero_nota?: string | null
          observacoes_admin?: string | null
          solicitante_user_id: string
          status?: Database["public"]["Enums"]["status_solicitacao"]
          tipo_solicitacao?: Database["public"]["Enums"]["tipo_solicitacao"]
          troco_real?: number | null
          updated_at?: string
          upload_nota_fiscal_url?: string | null
          valor_entregue?: number | null
          valor_gasto_real?: number | null
          valor_solicitado: number
        }
        Update: {
          admin_aprovador_id?: string | null
          ai_confianca?: Database["public"]["Enums"]["nivel_confianca"] | null
          ai_evidencia?: string | null
          ai_processed_at?: string | null
          ai_status?: Database["public"]["Enums"]["ai_status"] | null
          ai_valor_extraido?: number | null
          arquivo_hash?: string | null
          categoria?: string | null
          cnpj_emitente?: string | null
          created_at?: string
          data_aprovacao?: string | null
          data_baixa?: string | null
          data_emissao_nota?: string | null
          descricao_compra?: string | null
          empresa_id?: string
          excedeu_limite_maximo?: boolean
          excedeu_saldo?: boolean
          forma_entrega?: string | null
          id?: string
          justificativa?: string
          justificativa_excesso_admin?: string | null
          motivo_rejeicao?: string | null
          nome_emitente?: string | null
          numero_nota?: string | null
          observacoes_admin?: string | null
          solicitante_user_id?: string
          status?: Database["public"]["Enums"]["status_solicitacao"]
          tipo_solicitacao?: Database["public"]["Enums"]["tipo_solicitacao"]
          troco_real?: number | null
          updated_at?: string
          upload_nota_fiscal_url?: string | null
          valor_entregue?: number | null
          valor_gasto_real?: number | null
          valor_solicitado?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_solicitante_profile"
            columns: ["solicitante_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "solicitacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuario_empresa_acesso: {
        Row: {
          created_at: string | null
          created_by: string | null
          empresa_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          empresa_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          empresa_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_empresa_acesso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      ai_status: "pendente" | "ok" | "falhou"
      app_role: "admin" | "user"
      nivel_confianca: "alta" | "media" | "baixa"
      status_solicitacao:
        | "enviada"
        | "aprovada"
        | "entregue"
        | "rejeitada"
        | "baixada"
        | "pendente_ajuste"
      tipo_solicitacao: "FUNDO_FIXO" | "COMPRA_AVULSA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_status: ["pendente", "ok", "falhou"],
      app_role: ["admin", "user"],
      nivel_confianca: ["alta", "media", "baixa"],
      status_solicitacao: [
        "enviada",
        "aprovada",
        "entregue",
        "rejeitada",
        "baixada",
        "pendente_ajuste",
      ],
      tipo_solicitacao: ["FUNDO_FIXO", "COMPRA_AVULSA"],
    },
  },
} as const
