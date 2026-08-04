/**
 * Database types for the Supabase schema.
 *
 * These are hand-authored to match supabase/migrations. Once the Supabase CLI
 * is linked you can regenerate them from the live schema with:
 *   npm run db:types
 * which runs `supabase gen types typescript --local`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgStatus = 'trial' | 'active' | 'suspended' | 'cancelled'
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'disabled'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled'
export type BillingCycle = 'monthly' | 'yearly'
export type ClientType = 'individual' | 'corporate'
export type ClientStatus = 'active' | 'inactive' | 'prospect'
export type MatterStatus = 'open' | 'pending' | 'in_court' | 'closed' | 'won' | 'lost'
export type HearingType = 'mention' | 'hearing' | 'trial' | 'ruling' | 'motion' | 'conference' | 'other'
export type HearingStatus = 'scheduled' | 'adjourned' | 'held' | 'cancelled'
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export type RoleKey =
  | 'platform_owner'
  | 'platform_admin'
  | 'managing_partner'
  | 'partner'
  | 'senior_associate'
  | 'associate'
  | 'junior_associate'
  | 'paralegal'
  | 'finance'
  | 'hr'
  | 'secretary'
  | 'receptionist'

type Timestamps = {
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          legal_name: string | null
          logo_url: string | null
          primary_color: string
          status: OrgStatus
          plan: string
          billing_email: string | null
          phone: string | null
          website: string | null
          timezone: string
          settings: Json
          industry: string | null
          storage_used_bytes: number
          last_login_at: string | null
          deleted_at: string | null
          deleted_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          name: string
          slug: string
          legal_name?: string | null
          logo_url?: string | null
          primary_color?: string
          status?: OrgStatus
          plan?: string
          billing_email?: string | null
          phone?: string | null
          website?: string | null
          timezone?: string
          settings?: Json
          industry?: string | null
          storage_used_bytes?: number
          last_login_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          phone: string | null
          title: string | null
          is_platform_admin: boolean
          platform_role: string | null
          default_organization_id: string | null
          last_seen_at: string | null
        } & Timestamps
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          title?: string | null
          is_platform_admin?: boolean
          platform_role?: string | null
          default_organization_id?: string | null
          last_seen_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      permissions: {
        Row: {
          id: string
          key: string
          resource: string
          action: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          resource: string
          action: string
          description?: string | null
        }
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          organization_id: string | null
          key: RoleKey | null
          name: string
          description: string | null
          rank: number
          is_system: boolean
        } & Timestamps
        Insert: {
          id?: string
          organization_id?: string | null
          key?: RoleKey | null
          name: string
          description?: string | null
          rank?: number
          is_system?: boolean
        }
        Update: Partial<Database['public']['Tables']['roles']['Insert']>
        Relationships: []
      }
      role_permissions: {
        Row: { role_id: string; permission_id: string }
        Insert: { role_id: string; permission_id: string }
        Update: Partial<{ role_id: string; permission_id: string }>
        Relationships: [
          {
            foreignKeyName: 'role_permissions_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_permissions_permission_id_fkey'
            columns: ['permission_id']
            isOneToOne: false
            referencedRelation: 'permissions'
            referencedColumns: ['id']
          },
        ]
      }
      memberships: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role_id: string
          status: MembershipStatus
          is_owner: boolean
          title: string | null
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role_id: string
          status?: MembershipStatus
          is_owner?: boolean
          title?: string | null
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role_id: string
          token: string
          status: InvitationStatus
          invited_by: string | null
          message: string | null
          expires_at: string
          accepted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          email: string
          role_id: string
          token?: string
          status?: InvitationStatus
          invited_by?: string | null
          message?: string | null
          expires_at?: string
          accepted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          actor_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          summary: string | null
          metadata: Json
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          actor_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          summary?: string | null
          metadata?: Json
          ip_address?: string | null
        }
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          key: string | null
          name: string
          description: string | null
          currency: string
          price_monthly: number
          price_yearly: number
          max_users: number | null
          storage_gb: number
          support_level: string
          features: Json
          highlights: string[]
          is_custom: boolean
          is_active: boolean
          sort_order: number
        } & Timestamps
        Insert: {
          id?: string
          key?: string | null
          name: string
          description?: string | null
          currency?: string
          price_monthly?: number
          price_yearly?: number
          max_users?: number | null
          storage_gb?: number
          support_level?: string
          features?: Json
          highlights?: string[]
          is_custom?: boolean
          is_active?: boolean
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['plans']['Insert']>
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          organization_id: string
          type: ClientType
          display_name: string
          first_name: string | null
          last_name: string | null
          company_name: string | null
          email: string | null
          phone: string | null
          website: string | null
          address: string | null
          city: string | null
          country: string | null
          status: ClientStatus
          notes: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          type?: ClientType
          display_name: string
          first_name?: string | null
          last_name?: string | null
          company_name?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          status?: ClientStatus
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      matters: {
        Row: {
          id: string
          organization_id: string
          matter_number: string | null
          title: string
          description: string | null
          client_id: string | null
          practice_area: string | null
          status: MatterStatus
          lead_lawyer_id: string | null
          opposing_counsel: string | null
          court: string | null
          judge: string | null
          priority: string
          opened_on: string
          closed_on: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_number?: string | null
          title: string
          description?: string | null
          client_id?: string | null
          practice_area?: string | null
          status?: MatterStatus
          lead_lawyer_id?: string | null
          opposing_counsel?: string | null
          court?: string | null
          judge?: string | null
          priority?: string
          opened_on?: string
          closed_on?: string | null
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['matters']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matters_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matters_lead_lawyer_id_fkey'
            columns: ['lead_lawyer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      matter_notes: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          author_id: string | null
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          author_id?: string | null
          body: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['matter_notes']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matter_notes_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          title: string
          description: string | null
          status: TaskStatus
          priority: TaskPriority
          assignee_id: string | null
          due_date: string | null
          completed_at: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          title: string
          description?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          assignee_id?: string | null
          due_date?: string | null
          completed_at?: string | null
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'tasks_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      platform_settings: {
        Row: {
          id: boolean
          product_name: string
          support_email: string | null
          primary_color: string
          allow_org_creation: boolean
          default_trial_days: number
          maintenance_mode: boolean
          maintenance_message: string | null
          global_notice: string | null
          feature_flags: Json
          smtp: Json
          updated_at: string
        }
        Insert: {
          id?: boolean
          product_name?: string
          support_email?: string | null
          primary_color?: string
          allow_org_creation?: boolean
          default_trial_days?: number
          maintenance_mode?: boolean
          maintenance_message?: string | null
          global_notice?: string | null
          feature_flags?: Json
          smtp?: Json
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['platform_settings']['Insert']>
        Relationships: []
      }
      support_sessions: {
        Row: {
          id: string
          organization_id: string
          admin_id: string | null
          reason: string | null
          started_at: string
          expires_at: string
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          admin_id?: string | null
          reason?: string | null
          started_at?: string
          expires_at: string
          ended_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['support_sessions']['Insert']>
        Relationships: []
      }
      support_tickets: {
        Row: {
          id: string
          organization_id: string
          ticket_number: string | null
          subject: string
          status: TicketStatus
          priority: TicketPriority
          created_by: string | null
          assignee_id: string | null
          support_session_id: string | null
          resolved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          ticket_number?: string | null
          subject: string
          status?: TicketStatus
          priority?: TicketPriority
          created_by?: string | null
          assignee_id?: string | null
          support_session_id?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['support_tickets']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'support_tickets_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_support_session_id_fkey'
            columns: ['support_session_id']
            isOneToOne: false
            referencedRelation: 'support_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          id: string
          ticket_id: string
          author_id: string | null
          from_platform: boolean
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          author_id?: string | null
          from_platform?: boolean
          body: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['support_ticket_messages']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'support_ticket_messages_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'support_tickets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_ticket_messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      staff_profiles: {
        Row: {
          organization_id: string
          user_id: string
          bar_number: string | null
          year_admitted: number | null
          qualifications: string[]
          specializations: string[]
          hourly_rate: number | null
          bio: string | null
          availability: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          organization_id: string
          user_id: string
          bar_number?: string | null
          year_admitted?: number | null
          qualifications?: string[]
          specializations?: string[]
          hourly_rate?: number | null
          bio?: string | null
          availability?: string
          phone?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['staff_profiles']['Insert']>
        Relationships: []
      }
      hearings: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          title: string
          hearing_at: string
          duration_minutes: number | null
          location: string | null
          court: string | null
          judge: string | null
          type: HearingType
          status: HearingStatus
          outcome: string | null
          notes: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          title: string
          hearing_at: string
          duration_minutes?: number | null
          location?: string | null
          court?: string | null
          judge?: string | null
          type?: HearingType
          status?: HearingStatus
          outcome?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['hearings']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'hearings_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      matter_events: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          actor_id: string | null
          kind: string
          summary: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          actor_id?: string | null
          kind: string
          summary: string
          metadata?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['matter_events']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matter_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      documents: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          name: string
          display_name: string
          storage_path: string
          mime_type: string | null
          size_bytes: number | null
          category: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          name: string
          display_name: string
          storage_path: string
          mime_type?: string | null
          size_bytes?: number | null
          category?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'documents_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      time_entries: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          user_id: string | null
          work_date: string
          minutes: number
          rate: number
          description: string
          billable: boolean
          invoiced: boolean
          invoice_id: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          user_id?: string | null
          work_date?: string
          minutes: number
          rate?: number
          description: string
          billable?: boolean
          invoiced?: boolean
          invoice_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['time_entries']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'time_entries_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          user_id: string | null
          expense_date: string
          amount: number
          description: string
          category: string | null
          billable: boolean
          invoiced: boolean
          invoice_id: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          user_id?: string | null
          expense_date?: string
          amount: number
          description: string
          category?: string | null
          billable?: boolean
          invoiced?: boolean
          invoice_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'expenses_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          organization_id: string
          invoice_number: string | null
          client_id: string | null
          matter_id: string | null
          status: InvoiceStatus
          issue_date: string
          due_date: string | null
          subtotal: number
          tax: number
          total: number
          amount_paid: number
          notes: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          invoice_number?: string | null
          client_id?: string | null
          matter_id?: string | null
          status?: InvoiceStatus
          issue_date?: string
          due_date?: string | null
          subtotal?: number
          tax?: number
          total?: number
          amount_paid?: number
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_items: {
        Row: {
          id: string
          organization_id: string
          invoice_id: string
          kind: string
          description: string
          quantity: number
          unit: string | null
          rate: number
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          invoice_id: string
          kind?: string
          description: string
          quantity?: number
          unit?: string | null
          rate?: number
          amount?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['invoice_items']['Insert']>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          organization_id: string
          invoice_id: string
          amount: number
          method: string | null
          reference: string | null
          paid_at: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          invoice_id: string
          amount: number
          method?: string | null
          reference?: string | null
          paid_at?: string
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_id: string | null
          status: SubscriptionStatus
          billing_cycle: BillingCycle
          seats: number
          auto_renew: boolean
          trial_ends_at: string | null
          current_period_end: string | null
          cancelled_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          plan_id?: string | null
          status?: SubscriptionStatus
          billing_cycle?: BillingCycle
          seats?: number
          auto_renew?: boolean
          trial_ends_at?: string | null
          current_period_end?: string | null
          cancelled_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'subscriptions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: true
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_platform_admin: { Args: Record<string, never>; Returns: boolean }
      is_org_member: { Args: { org: string }; Returns: boolean }
      is_org_admin: { Args: { org: string }; Returns: boolean }
      has_permission: { Args: { org: string; perm: string }; Returns: boolean }
      create_organization: {
        Args: {
          p_name: string
          p_slug: string
          p_legal_name?: string | null
          p_plan_id?: string | null
          p_trial?: boolean
          p_billing_cycle?: BillingCycle
          p_owner_user_id?: string | null
        }
        Returns: Database['public']['Tables']['organizations']['Row']
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: Database['public']['Tables']['memberships']['Row']
      }
      log_audit: {
        Args: {
          p_org: string
          p_action: string
          p_entity_type?: string | null
          p_entity_id?: string | null
          p_summary?: string | null
          p_metadata?: Json
        }
        Returns: Database['public']['Tables']['audit_logs']['Row']
      }
      set_avatar: { Args: { p_user: string; p_url: string }; Returns: undefined }
      generate_invoice: {
        Args: {
          p_org: string
          p_client: string
          p_matter?: string | null
          p_due_date?: string | null
          p_tax_rate?: number
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      soft_delete_organization: { Args: { p_org: string }; Returns: undefined }
      restore_organization: { Args: { p_org: string }; Returns: undefined }
      hard_delete_organization: { Args: { p_org: string }; Returns: undefined }
      start_support_session: {
        Args: { p_org: string; p_reason: string }
        Returns: Database['public']['Tables']['support_sessions']['Row']
      }
      end_support_session: { Args: { p_id: string }; Returns: undefined }
      set_platform_access: { Args: { p_user: string; p_role: string; p_is_admin: boolean }; Returns: undefined }
    }
    Enums: {
      org_status: OrgStatus
      membership_status: MembershipStatus
      invitation_status: InvitationStatus
      role_key: RoleKey
      subscription_status: SubscriptionStatus
      billing_cycle: BillingCycle
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// Convenience row aliases
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Role = Database['public']['Tables']['roles']['Row']
export type Permission = Database['public']['Tables']['permissions']['Row']
export type Membership = Database['public']['Tables']['memberships']['Row']
export type Invitation = Database['public']['Tables']['invitations']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
export type Plan = Database['public']['Tables']['plans']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']
export type PlatformSettings = Database['public']['Tables']['platform_settings']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type Matter = Database['public']['Tables']['matters']['Row']
export type MatterNote = Database['public']['Tables']['matter_notes']['Row']
export type MatterEvent = Database['public']['Tables']['matter_events']['Row']
export type Hearing = Database['public']['Tables']['hearings']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type StaffProfile = Database['public']['Tables']['staff_profiles']['Row']
export type TimeEntry = Database['public']['Tables']['time_entries']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceItem = Database['public']['Tables']['invoice_items']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type DocumentRow = Database['public']['Tables']['documents']['Row']
