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
      active_dispatch: {
        Row: {
          assigned_dispatcher: string | null
          current_load_lane: string | null
          dispatch_status: Database["public"]["Enums"]["dispatch_status"]
          eta_redispatch: string | null
          id: string
          operator_id: string
          status_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_dispatcher?: string | null
          current_load_lane?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status"]
          eta_redispatch?: string | null
          id?: string
          operator_id: string
          status_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_dispatcher?: string | null
          current_load_lane?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status"]
          eta_redispatch?: string | null
          id?: string
          operator_id?: string
          status_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_dispatch_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: true
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      application_invites: {
        Row: {
          created_at: string
          email: string
          email_error: string | null
          email_sent: boolean
          first_name: string
          id: string
          invited_by: string
          invited_by_name: string | null
          last_name: string
          note: string | null
          phone: string | null
          resent_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          email_error?: string | null
          email_sent?: boolean
          first_name: string
          id?: string
          invited_by: string
          invited_by_name?: string | null
          last_name: string
          note?: string | null
          phone?: string | null
          resent_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          email_error?: string | null
          email_sent?: boolean
          first_name?: string
          id?: string
          invited_by?: string
          invited_by_name?: string | null
          last_name?: string
          note?: string | null
          phone?: string | null
          resent_at?: string | null
        }
        Relationships: []
      }
      application_resume_tokens: {
        Row: {
          application_id: string
          created_at: string
          email: string
          expires_at: string
          token: string
          used_at: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          email: string
          expires_at: string
          token: string
          used_at?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_resume_tokens_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          address_city: string | null
          address_duration: string | null
          address_line2: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          auth_drug_alcohol: boolean | null
          auth_previous_employers: boolean | null
          auth_safety_history: boolean | null
          background_verification_notes: string | null
          cdl_10_years: boolean | null
          cdl_class: string | null
          cdl_expiration: string | null
          cdl_number: string | null
          cdl_state: string | null
          ch_status: Database["public"]["Enums"]["mvr_status"]
          created_at: string
          dl_front_url: string | null
          dl_rear_url: string | null
          dob: string | null
          dot_accidents: boolean | null
          dot_accidents_description: string | null
          dot_positive_test_past_2yr: boolean | null
          dot_return_to_duty_docs: boolean | null
          draft_token: string | null
          email: string
          employers: Json
          employment_gaps: boolean | null
          employment_gaps_explanation: string | null
          endorsements: string[] | null
          equipment_operated: string[] | null
          first_name: string | null
          id: string
          is_draft: boolean | null
          last_name: string | null
          medical_cert_expiration: string | null
          medical_cert_url: string | null
          moving_violations: boolean | null
          moving_violations_description: string | null
          mvr_status: Database["public"]["Enums"]["mvr_status"]
          phone: string | null
          prev_address_city: string | null
          prev_address_line2: string | null
          prev_address_state: string | null
          prev_address_street: string | null
          prev_address_zip: string | null
          referral_source: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          sap_process: boolean | null
          signature_image_url: string | null
          signed_date: string | null
          ssn_encrypted: string | null
          submitted_at: string | null
          submitted_by_staff: boolean | null
          testing_policy_accepted: boolean | null
          typed_full_name: string | null
          updated_at: string
          user_id: string | null
          years_experience: string | null
        }
        Insert: {
          address_city?: string | null
          address_duration?: string | null
          address_line2?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          auth_drug_alcohol?: boolean | null
          auth_previous_employers?: boolean | null
          auth_safety_history?: boolean | null
          background_verification_notes?: string | null
          cdl_10_years?: boolean | null
          cdl_class?: string | null
          cdl_expiration?: string | null
          cdl_number?: string | null
          cdl_state?: string | null
          ch_status?: Database["public"]["Enums"]["mvr_status"]
          created_at?: string
          dl_front_url?: string | null
          dl_rear_url?: string | null
          dob?: string | null
          dot_accidents?: boolean | null
          dot_accidents_description?: string | null
          dot_positive_test_past_2yr?: boolean | null
          dot_return_to_duty_docs?: boolean | null
          draft_token?: string | null
          email: string
          employers?: Json
          employment_gaps?: boolean | null
          employment_gaps_explanation?: string | null
          endorsements?: string[] | null
          equipment_operated?: string[] | null
          first_name?: string | null
          id?: string
          is_draft?: boolean | null
          last_name?: string | null
          medical_cert_expiration?: string | null
          medical_cert_url?: string | null
          moving_violations?: boolean | null
          moving_violations_description?: string | null
          mvr_status?: Database["public"]["Enums"]["mvr_status"]
          phone?: string | null
          prev_address_city?: string | null
          prev_address_line2?: string | null
          prev_address_state?: string | null
          prev_address_street?: string | null
          prev_address_zip?: string | null
          referral_source?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          sap_process?: boolean | null
          signature_image_url?: string | null
          signed_date?: string | null
          ssn_encrypted?: string | null
          submitted_at?: string | null
          submitted_by_staff?: boolean | null
          testing_policy_accepted?: boolean | null
          typed_full_name?: string | null
          updated_at?: string
          user_id?: string | null
          years_experience?: string | null
        }
        Update: {
          address_city?: string | null
          address_duration?: string | null
          address_line2?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          auth_drug_alcohol?: boolean | null
          auth_previous_employers?: boolean | null
          auth_safety_history?: boolean | null
          background_verification_notes?: string | null
          cdl_10_years?: boolean | null
          cdl_class?: string | null
          cdl_expiration?: string | null
          cdl_number?: string | null
          cdl_state?: string | null
          ch_status?: Database["public"]["Enums"]["mvr_status"]
          created_at?: string
          dl_front_url?: string | null
          dl_rear_url?: string | null
          dob?: string | null
          dot_accidents?: boolean | null
          dot_accidents_description?: string | null
          dot_positive_test_past_2yr?: boolean | null
          dot_return_to_duty_docs?: boolean | null
          draft_token?: string | null
          email?: string
          employers?: Json
          employment_gaps?: boolean | null
          employment_gaps_explanation?: string | null
          endorsements?: string[] | null
          equipment_operated?: string[] | null
          first_name?: string | null
          id?: string
          is_draft?: boolean | null
          last_name?: string | null
          medical_cert_expiration?: string | null
          medical_cert_url?: string | null
          moving_violations?: boolean | null
          moving_violations_description?: string | null
          mvr_status?: Database["public"]["Enums"]["mvr_status"]
          phone?: string | null
          prev_address_city?: string | null
          prev_address_line2?: string | null
          prev_address_state?: string | null
          prev_address_street?: string | null
          prev_address_zip?: string | null
          referral_source?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          sap_process?: boolean | null
          signature_image_url?: string | null
          signed_date?: string | null
          ssn_encrypted?: string | null
          submitted_at?: string | null
          submitted_by_staff?: boolean | null
          testing_policy_accepted?: boolean | null
          typed_full_name?: string | null
          updated_at?: string
          user_id?: string | null
          years_experience?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      carrier_signature_settings: {
        Row: {
          id: string
          signature_url: string | null
          title: string
          typed_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          signature_url?: string | null
          title: string
          typed_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          signature_url?: string | null
          title?: string
          typed_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cert_reminders: {
        Row: {
          doc_type: string
          email_error: string | null
          email_sent: boolean
          id: string
          operator_id: string
          sent_at: string
          sent_by: string | null
          sent_by_name: string | null
        }
        Insert: {
          doc_type: string
          email_error?: string | null
          email_sent?: boolean
          id?: string
          operator_id: string
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
        }
        Update: {
          doc_type?: string
          email_error?: string | null
          email_sent?: boolean
          id?: string
          operator_id?: string
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cert_reminders_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_pay_setup: {
        Row: {
          business_name: string | null
          contractor_type: string
          created_at: string
          deposit_overview_acknowledged: boolean
          deposit_overview_acknowledged_at: string | null
          email: string
          id: string
          legal_first_name: string
          legal_last_name: string
          operator_id: string
          payroll_calendar_acknowledged: boolean
          payroll_calendar_acknowledged_at: string | null
          phone: string
          submitted_at: string | null
          terms_accepted: boolean
          terms_accepted_at: string | null
          updated_at: string
          void_check_file_name: string | null
          void_check_file_path: string | null
          void_check_url: string | null
          w9_file_name: string | null
          w9_file_path: string | null
          w9_url: string | null
        }
        Insert: {
          business_name?: string | null
          contractor_type: string
          created_at?: string
          deposit_overview_acknowledged?: boolean
          deposit_overview_acknowledged_at?: string | null
          email: string
          id?: string
          legal_first_name: string
          legal_last_name: string
          operator_id: string
          payroll_calendar_acknowledged?: boolean
          payroll_calendar_acknowledged_at?: string | null
          phone: string
          submitted_at?: string | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
          void_check_file_name?: string | null
          void_check_file_path?: string | null
          void_check_url?: string | null
          w9_file_name?: string | null
          w9_file_path?: string | null
          w9_url?: string | null
        }
        Update: {
          business_name?: string | null
          contractor_type?: string
          created_at?: string
          deposit_overview_acknowledged?: boolean
          deposit_overview_acknowledged_at?: string | null
          email?: string
          id?: string
          legal_first_name?: string
          legal_last_name?: string
          operator_id?: string
          payroll_calendar_acknowledged?: boolean
          payroll_calendar_acknowledged_at?: string | null
          phone?: string
          submitted_at?: string | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
          void_check_file_name?: string | null
          void_check_file_path?: string | null
          void_check_url?: string | null
          w9_file_name?: string | null
          w9_file_path?: string | null
          w9_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_pay_setup_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: true
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_daily_log: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          log_date: string
          notes: string | null
          operator_id: string
          status: Database["public"]["Enums"]["daily_dispatch_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          log_date: string
          notes?: string | null
          operator_id: string
          status: Database["public"]["Enums"]["daily_dispatch_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          log_date?: string
          notes?: string | null
          operator_id?: string
          status?: Database["public"]["Enums"]["daily_dispatch_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_daily_log_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          current_load_lane: string | null
          dispatch_status: Database["public"]["Enums"]["dispatch_status"]
          id: string
          operator_id: string
          status_notes: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          current_load_lane?: string | null
          dispatch_status: Database["public"]["Enums"]["dispatch_status"]
          id?: string
          operator_id: string
          status_notes?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          current_load_lane?: string | null
          dispatch_status?: Database["public"]["Enums"]["dispatch_status"]
          id?: string
          operator_id?: string
          status_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_status_history_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      document_acknowledgments: {
        Row: {
          acknowledged_at: string
          document_id: string
          document_version: number
          id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          document_version?: number
          id?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          document_version?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "driver_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_version_history: {
        Row: {
          body: string | null
          document_id: string
          id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body?: string | null
          document_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          body?: string | null
          document_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_version_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "driver_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string | null
          file_url: string | null
          id: string
          operator_id: string
          review_status: Database["public"]["Enums"]["doc_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          operator_id: string
          review_status?: Database["public"]["Enums"]["doc_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          operator_id?: string
          review_status?: Database["public"]["Enums"]["doc_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          body: string | null
          category: string
          content_type: string
          created_at: string
          description: string | null
          estimated_read_minutes: number | null
          id: string
          is_pinned: boolean
          is_required: boolean
          is_visible: boolean
          pdf_path: string | null
          pdf_url: string | null
          sort_order: number
          title: string
          updated_at: string
          version: number
          video_url: string | null
        }
        Insert: {
          body?: string | null
          category: string
          content_type?: string
          created_at?: string
          description?: string | null
          estimated_read_minutes?: number | null
          id?: string
          is_pinned?: boolean
          is_required?: boolean
          is_visible?: boolean
          pdf_path?: string | null
          pdf_url?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          version?: number
          video_url?: string | null
        }
        Update: {
          body?: string | null
          category?: string
          content_type?: string
          created_at?: string
          description?: string | null
          estimated_read_minutes?: number | null
          id?: string
          is_pinned?: boolean
          is_required?: boolean
          is_visible?: boolean
          pdf_path?: string | null
          pdf_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          version?: number
          video_url?: string | null
        }
        Relationships: []
      }
      driver_optional_docs: {
        Row: {
          created_at: string
          doc_name: string
          driver_id: string
          enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          doc_name: string
          driver_id: string
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          doc_name?: string
          driver_id?: string
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      driver_uploads: {
        Row: {
          category: Database["public"]["Enums"]["driver_upload_category"]
          driver_id: string
          file_name: string | null
          file_path: string | null
          file_url: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["driver_upload_status"]
          uploaded_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["driver_upload_category"]
          driver_id: string
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["driver_upload_status"]
          uploaded_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["driver_upload_category"]
          driver_id?: string
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["driver_upload_status"]
          uploaded_at?: string
        }
        Relationships: []
      }
      driver_vault_documents: {
        Row: {
          category: string
          expires_at: string | null
          file_name: string | null
          file_path: string | null
          file_url: string | null
          id: string
          label: string
          notes: string | null
          operator_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          label: string
          notes?: string | null
          operator_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          label?: string
          notes?: string | null
          operator_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_vault_documents_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          cta_label: string
          heading: string
          id: string
          milestone_key: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_html: string
          cta_label?: string
          heading: string
          id?: string
          milestone_key: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_html?: string
          cta_label?: string
          heading?: string
          id?: string
          milestone_key?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      equipment_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          equipment_id: string
          id: string
          notes: string | null
          operator_id: string
          return_condition: string | null
          returned_at: string | null
          ship_date: string | null
          shipping_carrier: string | null
          tracking_number: string | null
          tracking_receipt_uploaded_at: string | null
          tracking_receipt_url: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          equipment_id: string
          id?: string
          notes?: string | null
          operator_id: string
          return_condition?: string | null
          returned_at?: string | null
          ship_date?: string | null
          shipping_carrier?: string | null
          tracking_number?: string | null
          tracking_receipt_uploaded_at?: string | null
          tracking_receipt_url?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          equipment_id?: string
          id?: string
          notes?: string | null
          operator_id?: string
          return_condition?: string | null
          returned_at?: string | null
          ship_date?: string | null
          shipping_carrier?: string | null
          tracking_number?: string | null
          tracking_receipt_uploaded_at?: string | null
          tracking_receipt_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_assignments_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_items: {
        Row: {
          created_at: string
          device_type: string
          id: string
          notes: string | null
          serial_number: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_type: string
          id?: string
          notes?: string | null
          serial_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          notes?: string | null
          serial_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      faq: {
        Row: {
          answer: string
          category: Database["public"]["Enums"]["faq_category"]
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category: Database["public"]["Enums"]["faq_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: Database["public"]["Enums"]["faq_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      faq_history: {
        Row: {
          answer: string
          category: string
          change_type: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          faq_id: string
          id: string
          is_published: boolean
          question: string
        }
        Insert: {
          answer: string
          category: string
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          faq_id: string
          id?: string
          is_published?: boolean
          question: string
        }
        Update: {
          answer?: string
          category?: string
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          faq_id?: string
          id?: string
          is_published?: boolean
          question?: string
        }
        Relationships: []
      }
      fleet_settings: {
        Row: {
          default_dot_reminder_interval_days: number
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_dot_reminder_interval_days?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_dot_reminder_interval_days?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      forecast_deductions: {
        Row: {
          amount: number
          created_at: string
          group_id: string | null
          id: string
          installment_number: number | null
          installment_total: number | null
          label: string
          operator_id: string
          payday_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          group_id?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          label: string
          operator_id: string
          payday_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          group_id?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          label?: string
          operator_id?: string
          payday_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_deductions_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_expenses: {
        Row: {
          amount: number
          created_at: string
          expense_date: string
          expense_type: string
          id: string
          notes: string | null
          operator_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_date: string
          expense_type: string
          id?: string
          notes?: string | null
          operator_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_date?: string
          expense_type?: string
          id?: string
          notes?: string | null
          operator_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_expenses_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_loads: {
        Row: {
          created_at: string
          delivery_city: string | null
          delivery_date: string
          delivery_state: string | null
          id: string
          load_rate: number
          notes: string | null
          operator_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_city?: string | null
          delivery_date: string
          delivery_state?: string | null
          id?: string
          load_rate: number
          notes?: string | null
          operator_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_city?: string | null
          delivery_date?: string
          delivery_state?: string | null
          id?: string
          load_rate?: number
          notes?: string | null
          operator_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_loads_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      ica_contracts: {
        Row: {
          carrier_signature_url: string | null
          carrier_signed_at: string | null
          carrier_signed_by: string | null
          carrier_title: string | null
          carrier_typed_name: string | null
          contractor_signature_url: string | null
          contractor_signed_at: string | null
          contractor_typed_name: string | null
          created_at: string
          deposit_elected: boolean
          deposit_elected_date: string | null
          deposit_initials: string | null
          equipment_location: string | null
          id: string
          lease_effective_date: string | null
          lease_termination_date: string | null
          linehaul_split_pct: number
          operator_id: string
          owner_address: string | null
          owner_business_name: string | null
          owner_city: string | null
          owner_ein_ssn: string | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          owner_state: string | null
          owner_zip: string | null
          status: string
          trailer_number: string | null
          truck_make: string | null
          truck_model: string | null
          truck_plate: string | null
          truck_plate_state: string | null
          truck_vin: string | null
          truck_year: string | null
          updated_at: string
        }
        Insert: {
          carrier_signature_url?: string | null
          carrier_signed_at?: string | null
          carrier_signed_by?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          contractor_signature_url?: string | null
          contractor_signed_at?: string | null
          contractor_typed_name?: string | null
          created_at?: string
          deposit_elected?: boolean
          deposit_elected_date?: string | null
          deposit_initials?: string | null
          equipment_location?: string | null
          id?: string
          lease_effective_date?: string | null
          lease_termination_date?: string | null
          linehaul_split_pct?: number
          operator_id: string
          owner_address?: string | null
          owner_business_name?: string | null
          owner_city?: string | null
          owner_ein_ssn?: string | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_state?: string | null
          owner_zip?: string | null
          status?: string
          trailer_number?: string | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_vin?: string | null
          truck_year?: string | null
          updated_at?: string
        }
        Update: {
          carrier_signature_url?: string | null
          carrier_signed_at?: string | null
          carrier_signed_by?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          contractor_signature_url?: string | null
          contractor_signed_at?: string | null
          contractor_typed_name?: string | null
          created_at?: string
          deposit_elected?: boolean
          deposit_elected_date?: string | null
          deposit_initials?: string | null
          equipment_location?: string | null
          id?: string
          lease_effective_date?: string | null
          lease_termination_date?: string | null
          linehaul_split_pct?: number
          operator_id?: string
          owner_address?: string | null
          owner_business_name?: string | null
          owner_city?: string | null
          owner_ein_ssn?: string | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_state?: string | null
          owner_zip?: string | null
          status?: string
          trailer_number?: string | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_vin?: string | null
          truck_year?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ica_contracts_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_binder_order: {
        Row: {
          doc_order: Json
          id: string
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          doc_order?: Json
          id?: string
          scope: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          doc_order?: Json
          id?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inspection_documents: {
        Row: {
          driver_id: string | null
          expires_at: string | null
          file_path: string | null
          file_url: string | null
          id: string
          name: string
          public_share_token: string
          scope: Database["public"]["Enums"]["inspection_doc_scope"]
          shared_with_fleet: boolean
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          driver_id?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          name: string
          public_share_token?: string
          scope?: Database["public"]["Enums"]["inspection_doc_scope"]
          shared_with_fleet?: boolean
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          driver_id?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          name?: string
          public_share_token?: string
          scope?: Database["public"]["Enums"]["inspection_doc_scope"]
          shared_with_fleet?: boolean
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      insurance_email_settings: {
        Row: {
          id: string
          recipient_emails: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          recipient_emails?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          recipient_emails?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lease_terminations: {
        Row: {
          carrier_signature_url: string | null
          carrier_signed_at: string
          carrier_signed_by: string | null
          carrier_title: string | null
          carrier_typed_name: string | null
          contractor_label: string | null
          contractor_signature_url: string | null
          contractor_signed_at: string | null
          contractor_typed_name: string | null
          created_at: string
          effective_date: string
          ica_contract_id: string | null
          id: string
          insurance_notified_at: string | null
          insurance_recipients: string[] | null
          lease_effective_date: string | null
          notes: string | null
          operator_id: string
          pdf_path: string | null
          pdf_url: string | null
          reason: string
          trailer_number: string | null
          truck_make: string | null
          truck_model: string | null
          truck_plate: string | null
          truck_plate_state: string | null
          truck_vin: string | null
          truck_year: string | null
          updated_at: string
        }
        Insert: {
          carrier_signature_url?: string | null
          carrier_signed_at?: string
          carrier_signed_by?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          contractor_label?: string | null
          contractor_signature_url?: string | null
          contractor_signed_at?: string | null
          contractor_typed_name?: string | null
          created_at?: string
          effective_date: string
          ica_contract_id?: string | null
          id?: string
          insurance_notified_at?: string | null
          insurance_recipients?: string[] | null
          lease_effective_date?: string | null
          notes?: string | null
          operator_id: string
          pdf_path?: string | null
          pdf_url?: string | null
          reason: string
          trailer_number?: string | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_vin?: string | null
          truck_year?: string | null
          updated_at?: string
        }
        Update: {
          carrier_signature_url?: string | null
          carrier_signed_at?: string
          carrier_signed_by?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          contractor_label?: string | null
          contractor_signature_url?: string | null
          contractor_signed_at?: string | null
          contractor_typed_name?: string | null
          created_at?: string
          effective_date?: string
          ica_contract_id?: string | null
          id?: string
          insurance_notified_at?: string | null
          insurance_recipients?: string[] | null
          lease_effective_date?: string | null
          notes?: string | null
          operator_id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          reason?: string
          trailer_number?: string | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_vin?: string | null
          truck_year?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_terminations_ica_contract_id_fkey"
            columns: ["ica_contract_id"]
            isOneToOne: false
            referencedRelation: "ica_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_terminations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      message_notification_throttle: {
        Row: {
          last_notified_at: string
          recipient_id: string
          sender_id: string
          unread_count: number
        }
        Insert: {
          last_notified_at?: string
          recipient_id: string
          sender_id: string
          unread_count?: number
        }
        Update: {
          last_notified_at?: string
          recipient_id?: string
          sender_id?: string
          unread_count?: number
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_size_bytes: number | null
          attachment_url: string | null
          body: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          pinned_at: string | null
          pinned_by: string | null
          read_at: string | null
          recipient_id: string
          reply_to_id: string | null
          sender_id: string
          sent_at: string
          thread_id: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_size_bytes?: number | null
          attachment_url?: string | null
          body: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          read_at?: string | null
          recipient_id: string
          reply_to_id?: string | null
          sender_id: string
          sent_at?: string
          thread_id?: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_size_bytes?: number | null
          attachment_url?: string | null
          body?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          read_at?: string | null
          recipient_id?: string
          reply_to_id?: string | null
          sender_id?: string
          sent_at?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_plate_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          driver_name: string
          event_type: string
          id: string
          notes: string | null
          operator_id: string | null
          plate_id: string
          returned_at: string | null
          returned_by: string | null
          unit_number: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          driver_name: string
          event_type?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          plate_id: string
          returned_at?: string | null
          returned_by?: string | null
          unit_number?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          driver_name?: string
          event_type?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          plate_id?: string
          returned_at?: string | null
          returned_by?: string | null
          unit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_plate_assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_plate_assignments_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "mo_plates"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_plates: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          plate_number: string
          registration_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          plate_number: string
          registration_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          plate_number?: string
          registration_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          event_type: string
          id: string
          in_app_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          event_type: string
          id?: string
          in_app_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          event_type?: string
          id?: string
          in_app_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          id: string
          link: string | null
          read_at: string | null
          sent_at: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          id?: string
          link?: string | null
          read_at?: string | null
          sent_at?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          id?: string
          link?: string | null
          read_at?: string | null
          sent_at?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_status: {
        Row: {
          bestpass_number: string | null
          bg_check_notes: string | null
          ch_received_date: string | null
          ch_requested_date: string | null
          ch_status: Database["public"]["Enums"]["mvr_status"]
          cost_form_2290: number | null
          cost_mo_registration: number | null
          cost_notes: string | null
          cost_other: number | null
          cost_other_description: string | null
          dash_cam_number: string | null
          decal_applied: Database["public"]["Enums"]["yes_no"]
          decal_method: Database["public"]["Enums"]["install_method"] | null
          decal_photo_ds_url: string | null
          decal_photo_ps_url: string | null
          dispatch_ready_consortium: boolean
          dispatch_ready_first_assigned: boolean
          dispatch_ready_orientation: boolean
          doc_notes: string | null
          eld_exempt: boolean
          eld_exempt_reason: string | null
          eld_installed: Database["public"]["Enums"]["yes_no"]
          eld_method: Database["public"]["Enums"]["install_method"] | null
          eld_serial_number: string | null
          exception_approved_at: string | null
          exception_approved_by: string | null
          exception_notes: string | null
          form_2290: Database["public"]["Enums"]["document_status"]
          form_2290_owner_provided: boolean
          fuel_card_issued: Database["public"]["Enums"]["yes_no"]
          fuel_card_number: string | null
          fully_onboarded: boolean | null
          go_live_date: string | null
          ica_notes: string | null
          ica_sent_date: string | null
          ica_signed_date: string | null
          ica_status: Database["public"]["Enums"]["ica_status"]
          id: string
          insurance_added_date: string | null
          insurance_ai_address: string | null
          insurance_ai_city: string | null
          insurance_ai_company: string | null
          insurance_ai_email: string | null
          insurance_ai_state: string | null
          insurance_ai_zip: string | null
          insurance_ch_address: string | null
          insurance_ch_city: string | null
          insurance_ch_company: string | null
          insurance_ch_email: string | null
          insurance_ch_same_as_ai: boolean
          insurance_ch_state: string | null
          insurance_ch_zip: string | null
          insurance_notes: string | null
          insurance_policy_type: string | null
          insurance_stated_value: number | null
          mo_docs_submitted: Database["public"]["Enums"]["mo_docs_status"]
          mo_docs_submitted_date: string | null
          mo_expected_approval_date: string | null
          mo_notes: string | null
          mo_reg_received: Database["public"]["Enums"]["mo_reg_status"]
          mvr_ch_approval: Database["public"]["Enums"]["approval_status"]
          mvr_received_date: string | null
          mvr_requested_date: string | null
          mvr_status: Database["public"]["Enums"]["mvr_status"]
          operator_id: string
          operator_type: string | null
          paper_logbook_approved: boolean
          pe_receipt_url: string | null
          pe_results_date: string | null
          pe_results_doc_url: string | null
          pe_scheduled_date: string | null
          pe_screening: Database["public"]["Enums"]["screening_status"]
          pe_screening_result: Database["public"]["Enums"]["screening_result"]
          qpassport_url: string | null
          registration_status:
            | Database["public"]["Enums"]["registration_type"]
            | null
          temp_decal_approved: boolean
          trailer_number: string | null
          truck_inspection: Database["public"]["Enums"]["document_status"]
          truck_make: string | null
          truck_model: string | null
          truck_photos: Database["public"]["Enums"]["document_status"]
          truck_plate: string | null
          truck_plate_state: string | null
          truck_title: Database["public"]["Enums"]["document_status"]
          truck_vin: string | null
          truck_year: string | null
          unit_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bestpass_number?: string | null
          bg_check_notes?: string | null
          ch_received_date?: string | null
          ch_requested_date?: string | null
          ch_status?: Database["public"]["Enums"]["mvr_status"]
          cost_form_2290?: number | null
          cost_mo_registration?: number | null
          cost_notes?: string | null
          cost_other?: number | null
          cost_other_description?: string | null
          dash_cam_number?: string | null
          decal_applied?: Database["public"]["Enums"]["yes_no"]
          decal_method?: Database["public"]["Enums"]["install_method"] | null
          decal_photo_ds_url?: string | null
          decal_photo_ps_url?: string | null
          dispatch_ready_consortium?: boolean
          dispatch_ready_first_assigned?: boolean
          dispatch_ready_orientation?: boolean
          doc_notes?: string | null
          eld_exempt?: boolean
          eld_exempt_reason?: string | null
          eld_installed?: Database["public"]["Enums"]["yes_no"]
          eld_method?: Database["public"]["Enums"]["install_method"] | null
          eld_serial_number?: string | null
          exception_approved_at?: string | null
          exception_approved_by?: string | null
          exception_notes?: string | null
          form_2290?: Database["public"]["Enums"]["document_status"]
          form_2290_owner_provided?: boolean
          fuel_card_issued?: Database["public"]["Enums"]["yes_no"]
          fuel_card_number?: string | null
          fully_onboarded?: boolean | null
          go_live_date?: string | null
          ica_notes?: string | null
          ica_sent_date?: string | null
          ica_signed_date?: string | null
          ica_status?: Database["public"]["Enums"]["ica_status"]
          id?: string
          insurance_added_date?: string | null
          insurance_ai_address?: string | null
          insurance_ai_city?: string | null
          insurance_ai_company?: string | null
          insurance_ai_email?: string | null
          insurance_ai_state?: string | null
          insurance_ai_zip?: string | null
          insurance_ch_address?: string | null
          insurance_ch_city?: string | null
          insurance_ch_company?: string | null
          insurance_ch_email?: string | null
          insurance_ch_same_as_ai?: boolean
          insurance_ch_state?: string | null
          insurance_ch_zip?: string | null
          insurance_notes?: string | null
          insurance_policy_type?: string | null
          insurance_stated_value?: number | null
          mo_docs_submitted?: Database["public"]["Enums"]["mo_docs_status"]
          mo_docs_submitted_date?: string | null
          mo_expected_approval_date?: string | null
          mo_notes?: string | null
          mo_reg_received?: Database["public"]["Enums"]["mo_reg_status"]
          mvr_ch_approval?: Database["public"]["Enums"]["approval_status"]
          mvr_received_date?: string | null
          mvr_requested_date?: string | null
          mvr_status?: Database["public"]["Enums"]["mvr_status"]
          operator_id: string
          operator_type?: string | null
          paper_logbook_approved?: boolean
          pe_receipt_url?: string | null
          pe_results_date?: string | null
          pe_results_doc_url?: string | null
          pe_scheduled_date?: string | null
          pe_screening?: Database["public"]["Enums"]["screening_status"]
          pe_screening_result?: Database["public"]["Enums"]["screening_result"]
          qpassport_url?: string | null
          registration_status?:
            | Database["public"]["Enums"]["registration_type"]
            | null
          temp_decal_approved?: boolean
          trailer_number?: string | null
          truck_inspection?: Database["public"]["Enums"]["document_status"]
          truck_make?: string | null
          truck_model?: string | null
          truck_photos?: Database["public"]["Enums"]["document_status"]
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_title?: Database["public"]["Enums"]["document_status"]
          truck_vin?: string | null
          truck_year?: string | null
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bestpass_number?: string | null
          bg_check_notes?: string | null
          ch_received_date?: string | null
          ch_requested_date?: string | null
          ch_status?: Database["public"]["Enums"]["mvr_status"]
          cost_form_2290?: number | null
          cost_mo_registration?: number | null
          cost_notes?: string | null
          cost_other?: number | null
          cost_other_description?: string | null
          dash_cam_number?: string | null
          decal_applied?: Database["public"]["Enums"]["yes_no"]
          decal_method?: Database["public"]["Enums"]["install_method"] | null
          decal_photo_ds_url?: string | null
          decal_photo_ps_url?: string | null
          dispatch_ready_consortium?: boolean
          dispatch_ready_first_assigned?: boolean
          dispatch_ready_orientation?: boolean
          doc_notes?: string | null
          eld_exempt?: boolean
          eld_exempt_reason?: string | null
          eld_installed?: Database["public"]["Enums"]["yes_no"]
          eld_method?: Database["public"]["Enums"]["install_method"] | null
          eld_serial_number?: string | null
          exception_approved_at?: string | null
          exception_approved_by?: string | null
          exception_notes?: string | null
          form_2290?: Database["public"]["Enums"]["document_status"]
          form_2290_owner_provided?: boolean
          fuel_card_issued?: Database["public"]["Enums"]["yes_no"]
          fuel_card_number?: string | null
          fully_onboarded?: boolean | null
          go_live_date?: string | null
          ica_notes?: string | null
          ica_sent_date?: string | null
          ica_signed_date?: string | null
          ica_status?: Database["public"]["Enums"]["ica_status"]
          id?: string
          insurance_added_date?: string | null
          insurance_ai_address?: string | null
          insurance_ai_city?: string | null
          insurance_ai_company?: string | null
          insurance_ai_email?: string | null
          insurance_ai_state?: string | null
          insurance_ai_zip?: string | null
          insurance_ch_address?: string | null
          insurance_ch_city?: string | null
          insurance_ch_company?: string | null
          insurance_ch_email?: string | null
          insurance_ch_same_as_ai?: boolean
          insurance_ch_state?: string | null
          insurance_ch_zip?: string | null
          insurance_notes?: string | null
          insurance_policy_type?: string | null
          insurance_stated_value?: number | null
          mo_docs_submitted?: Database["public"]["Enums"]["mo_docs_status"]
          mo_docs_submitted_date?: string | null
          mo_expected_approval_date?: string | null
          mo_notes?: string | null
          mo_reg_received?: Database["public"]["Enums"]["mo_reg_status"]
          mvr_ch_approval?: Database["public"]["Enums"]["approval_status"]
          mvr_received_date?: string | null
          mvr_requested_date?: string | null
          mvr_status?: Database["public"]["Enums"]["mvr_status"]
          operator_id?: string
          operator_type?: string | null
          paper_logbook_approved?: boolean
          pe_receipt_url?: string | null
          pe_results_date?: string | null
          pe_results_doc_url?: string | null
          pe_scheduled_date?: string | null
          pe_screening?: Database["public"]["Enums"]["screening_status"]
          pe_screening_result?: Database["public"]["Enums"]["screening_result"]
          qpassport_url?: string | null
          registration_status?:
            | Database["public"]["Enums"]["registration_type"]
            | null
          temp_decal_approved?: boolean
          trailer_number?: string | null
          truck_inspection?: Database["public"]["Enums"]["document_status"]
          truck_make?: string | null
          truck_model?: string | null
          truck_photos?: Database["public"]["Enums"]["document_status"]
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_title?: Database["public"]["Enums"]["document_status"]
          truck_vin?: string | null
          truck_year?: string | null
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_status_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: true
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_documents: {
        Row: {
          document_type: Database["public"]["Enums"]["operator_doc_type"]
          file_name: string | null
          file_url: string | null
          id: string
          operator_id: string
          uploaded_at: string
        }
        Insert: {
          document_type?: Database["public"]["Enums"]["operator_doc_type"]
          file_name?: string | null
          file_url?: string | null
          id?: string
          operator_id: string
          uploaded_at?: string
        }
        Update: {
          document_type?: Database["public"]["Enums"]["operator_doc_type"]
          file_name?: string | null
          file_url?: string | null
          id?: string
          operator_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_documents_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          anticipated_start_date: string | null
          application_id: string | null
          assigned_onboarding_staff: string | null
          created_at: string
          excluded_from_dispatch: boolean
          excluded_from_dispatch_at: string | null
          excluded_from_dispatch_by: string | null
          excluded_from_dispatch_reason: string | null
          id: string
          is_active: boolean
          last_web_seen_at: string | null
          notes: string | null
          on_hold: boolean
          on_hold_date: string | null
          on_hold_reason: string | null
          pay_percentage: number
          pwa_installed_at: string | null
          unit_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anticipated_start_date?: string | null
          application_id?: string | null
          assigned_onboarding_staff?: string | null
          created_at?: string
          excluded_from_dispatch?: boolean
          excluded_from_dispatch_at?: string | null
          excluded_from_dispatch_by?: string | null
          excluded_from_dispatch_reason?: string | null
          id?: string
          is_active?: boolean
          last_web_seen_at?: string | null
          notes?: string | null
          on_hold?: boolean
          on_hold_date?: string | null
          on_hold_reason?: string | null
          pay_percentage?: number
          pwa_installed_at?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anticipated_start_date?: string | null
          application_id?: string | null
          assigned_onboarding_staff?: string | null
          created_at?: string
          excluded_from_dispatch?: boolean
          excluded_from_dispatch_at?: string | null
          excluded_from_dispatch_by?: string | null
          excluded_from_dispatch_reason?: string | null
          id?: string
          is_active?: boolean
          last_web_seen_at?: string | null
          notes?: string | null
          on_hold?: boolean
          on_hold_date?: string | null
          on_hold_reason?: string | null
          pay_percentage?: number
          pwa_installed_at?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operators_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      pandadoc_documents: {
        Row: {
          document_name: string
          id: string
          operator_id: string
          pandadoc_document_id: string | null
          pandadoc_status: Database["public"]["Enums"]["pandadoc_status"]
          sent_at: string | null
          sent_by: string | null
          signed_at: string | null
        }
        Insert: {
          document_name: string
          id?: string
          operator_id: string
          pandadoc_document_id?: string | null
          pandadoc_status?: Database["public"]["Enums"]["pandadoc_status"]
          sent_at?: string | null
          sent_by?: string | null
          signed_at?: string | null
        }
        Update: {
          document_name?: string
          id?: string
          operator_id?: string
          pandadoc_document_id?: string | null
          pandadoc_status?: Database["public"]["Enums"]["pandadoc_status"]
          sent_at?: string | null
          sent_by?: string | null
          signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pandadoc_documents_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_config: {
        Row: {
          description: string | null
          full_name: string
          id: string
          is_active: boolean
          items: Json
          label: string
          stage_key: string
          stage_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          items?: Json
          label: string
          stage_key: string
          stage_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          items?: Json
          label?: string
          stage_key?: string
          stage_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          avatar_url: string | null
          created_at: string
          first_name: string | null
          home_state: string | null
          id: string
          invited_by: string | null
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          home_state?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          home_state?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      release_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      resource_documents: {
        Row: {
          category: Database["public"]["Enums"]["resource_category"]
          description: string | null
          file_name: string | null
          file_url: string | null
          id: string
          is_visible: boolean
          sort_order: number
          title: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["resource_category"]
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_visible?: boolean
          sort_order?: number
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["resource_category"]
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_visible?: boolean
          sort_order?: number
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      resource_history: {
        Row: {
          category: string
          change_type: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          description: string | null
          file_name: string | null
          id: string
          is_visible: boolean
          resource_id: string
          title: string
        }
        Insert: {
          category: string
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          description?: string | null
          file_name?: string | null
          id?: string
          is_visible?: boolean
          resource_id: string
          title: string
        }
        Update: {
          category?: string
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          description?: string | null
          file_name?: string | null
          id?: string
          is_visible?: boolean
          resource_id?: string
          title?: string
        }
        Relationships: []
      }
      service_help_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          resource_id: string | null
          service_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          resource_id?: string | null
          service_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          resource_id?: string | null
          service_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_help_requests_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "service_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_help_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resource_bookmarks: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resource_bookmarks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "service_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resource_completions: {
        Row: {
          completed_at: string
          id: string
          resource_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          resource_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          resource_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resource_completions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "service_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resource_views: {
        Row: {
          id: string
          resource_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          resource_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          resource_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resource_views_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "service_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          body: string | null
          created_at: string
          description: string | null
          estimated_minutes: number | null
          id: string
          is_start_here: boolean
          is_visible: boolean
          last_verified_at: string | null
          resource_type: string
          service_id: string
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_start_here?: boolean
          is_visible?: boolean
          last_verified_at?: string | null
          resource_type: string
          service_id: string
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_start_here?: boolean
          is_visible?: boolean
          last_verified_at?: string | null
          resource_type?: string
          service_id?: string
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_new_driver_essential: boolean
          is_visible: boolean
          known_issues_notes: string | null
          logo_url: string | null
          name: string
          sort_order: number
          support_chat_url: string | null
          support_email: string | null
          support_hours: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_new_driver_essential?: boolean
          is_visible?: boolean
          known_issues_notes?: string | null
          logo_url?: string | null
          name: string
          sort_order?: number
          support_chat_url?: string | null
          support_email?: string | null
          support_hours?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_new_driver_essential?: boolean
          is_visible?: boolean
          known_issues_notes?: string | null
          logo_url?: string | null
          name?: string
          sort_order?: number
          support_chat_url?: string | null
          support_email?: string | null
          support_hours?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      truck_dot_inspections: {
        Row: {
          certificate_file_name: string | null
          certificate_file_path: string | null
          certificate_file_url: string | null
          created_at: string
          created_by: string | null
          id: string
          inspection_date: string
          inspector_name: string | null
          location: string | null
          next_due_date: string | null
          notes: string | null
          operator_id: string
          reminder_interval: number
          result: string
        }
        Insert: {
          certificate_file_name?: string | null
          certificate_file_path?: string | null
          certificate_file_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_date: string
          inspector_name?: string | null
          location?: string | null
          next_due_date?: string | null
          notes?: string | null
          operator_id: string
          reminder_interval?: number
          result?: string
        }
        Update: {
          certificate_file_name?: string | null
          certificate_file_path?: string | null
          certificate_file_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_date?: string
          inspector_name?: string | null
          location?: string | null
          next_due_date?: string | null
          notes?: string | null
          operator_id?: string
          reminder_interval?: number
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_dot_inspections_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_maintenance_records: {
        Row: {
          amount: number | null
          categories: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invoice_file_name: string | null
          invoice_file_path: string | null
          invoice_file_url: string | null
          invoice_number: string | null
          notes: string | null
          odometer: number | null
          operator_id: string
          service_date: string
          shop_name: string | null
        }
        Insert: {
          amount?: number | null
          categories?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_file_name?: string | null
          invoice_file_path?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          notes?: string | null
          odometer?: number | null
          operator_id: string
          service_date: string
          shop_name?: string | null
        }
        Update: {
          amount?: number | null
          categories?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_file_name?: string | null
          invoice_file_path?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          notes?: string | null
          odometer?: number | null
          operator_id?: string
          service_date?: string
          shop_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_maintenance_records_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      consume_application_resume_token: {
        Args: { p_token: string }
        Returns: {
          application_id: string
          draft_token: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_application_by_draft_token: {
        Args: { p_token: string }
        Returns: {
          address_city: string | null
          address_duration: string | null
          address_line2: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          auth_drug_alcohol: boolean | null
          auth_previous_employers: boolean | null
          auth_safety_history: boolean | null
          background_verification_notes: string | null
          cdl_10_years: boolean | null
          cdl_class: string | null
          cdl_expiration: string | null
          cdl_number: string | null
          cdl_state: string | null
          ch_status: Database["public"]["Enums"]["mvr_status"]
          created_at: string
          dl_front_url: string | null
          dl_rear_url: string | null
          dob: string | null
          dot_accidents: boolean | null
          dot_accidents_description: string | null
          dot_positive_test_past_2yr: boolean | null
          dot_return_to_duty_docs: boolean | null
          draft_token: string | null
          email: string
          employers: Json
          employment_gaps: boolean | null
          employment_gaps_explanation: string | null
          endorsements: string[] | null
          equipment_operated: string[] | null
          first_name: string | null
          id: string
          is_draft: boolean | null
          last_name: string | null
          medical_cert_expiration: string | null
          medical_cert_url: string | null
          moving_violations: boolean | null
          moving_violations_description: string | null
          mvr_status: Database["public"]["Enums"]["mvr_status"]
          phone: string | null
          prev_address_city: string | null
          prev_address_line2: string | null
          prev_address_state: string | null
          prev_address_street: string | null
          prev_address_zip: string | null
          referral_source: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          sap_process: boolean | null
          signature_image_url: string | null
          signed_date: string | null
          ssn_encrypted: string | null
          submitted_at: string | null
          submitted_by_staff: boolean | null
          testing_policy_accepted: boolean | null
          typed_full_name: string | null
          updated_at: string
          user_id: string | null
          years_experience: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_equipment_shipping_for_operator: {
        Args: { p_operator_id: string }
        Returns: {
          assigned_at: string
          assignment_id: string
          device_type: string
          equipment_id: string
          returned_at: string
          serial_number: string
          ship_date: string
          shipping_carrier: string
          tracking_number: string
          tracking_receipt_uploaded_at: string
          tracking_receipt_url: string
        }[]
      }
      get_inspection_doc_by_token: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          file_url: string
          id: string
          name: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_operator_seen: { Args: { _standalone: boolean }; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      remove_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      search_audit_log: {
        Args: {
          p_action?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_to?: string
        }
        Returns: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      account_status: "pending" | "active" | "denied" | "inactive"
      app_role:
        | "applicant"
        | "operator"
        | "onboarding_staff"
        | "dispatcher"
        | "management"
        | "owner"
      approval_status: "pending" | "approved" | "denied"
      daily_dispatch_status:
        | "dispatched"
        | "home"
        | "truck_down"
        | "not_dispatched"
      dispatch_status: "not_dispatched" | "dispatched" | "home" | "truck_down"
      doc_review_status: "pending" | "approved" | "rejected"
      document_status: "not_started" | "requested" | "received"
      driver_upload_category:
        | "roadside_inspection_report"
        | "repairs_maintenance_receipt"
        | "miscellaneous"
      driver_upload_status: "pending_review" | "reviewed" | "needs_attention"
      faq_category:
        | "application_process"
        | "background_screening"
        | "documents_requirements"
        | "ica_contracts"
        | "missouri_registration"
        | "equipment"
        | "dispatch_operations"
        | "general_owner_operator"
      ica_status:
        | "not_issued"
        | "in_progress"
        | "sent_for_signature"
        | "complete"
      inspection_doc_scope: "company_wide" | "per_driver"
      install_method:
        | "ar_shop_install"
        | "ups_self_install"
        | "owner_operator_install"
        | "supertransport_shop"
      mo_docs_status: "not_submitted" | "submitted"
      mo_reg_status: "not_yet" | "yes"
      mvr_status: "not_started" | "requested" | "received"
      notification_channel: "in_app" | "email" | "both"
      operator_doc_type:
        | "registration"
        | "insurance_cert"
        | "inspection_report"
        | "ica_summary"
        | "other"
        | "form_2290"
        | "truck_title"
        | "truck_photos"
        | "truck_inspection"
        | "pe_receipt"
      pandadoc_status: "sent" | "viewed" | "completed"
      registration_type: "own_registration" | "needs_mo_reg"
      resource_category:
        | "user_manuals"
        | "decal_files"
        | "forms_compliance"
        | "dot_general"
      review_status: "pending" | "approved" | "denied"
      screening_result: "pending" | "clear" | "non_clear"
      screening_status: "not_started" | "scheduled" | "results_in"
      yes_no: "no" | "yes"
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
      account_status: ["pending", "active", "denied", "inactive"],
      app_role: [
        "applicant",
        "operator",
        "onboarding_staff",
        "dispatcher",
        "management",
        "owner",
      ],
      approval_status: ["pending", "approved", "denied"],
      daily_dispatch_status: [
        "dispatched",
        "home",
        "truck_down",
        "not_dispatched",
      ],
      dispatch_status: ["not_dispatched", "dispatched", "home", "truck_down"],
      doc_review_status: ["pending", "approved", "rejected"],
      document_status: ["not_started", "requested", "received"],
      driver_upload_category: [
        "roadside_inspection_report",
        "repairs_maintenance_receipt",
        "miscellaneous",
      ],
      driver_upload_status: ["pending_review", "reviewed", "needs_attention"],
      faq_category: [
        "application_process",
        "background_screening",
        "documents_requirements",
        "ica_contracts",
        "missouri_registration",
        "equipment",
        "dispatch_operations",
        "general_owner_operator",
      ],
      ica_status: [
        "not_issued",
        "in_progress",
        "sent_for_signature",
        "complete",
      ],
      inspection_doc_scope: ["company_wide", "per_driver"],
      install_method: [
        "ar_shop_install",
        "ups_self_install",
        "owner_operator_install",
        "supertransport_shop",
      ],
      mo_docs_status: ["not_submitted", "submitted"],
      mo_reg_status: ["not_yet", "yes"],
      mvr_status: ["not_started", "requested", "received"],
      notification_channel: ["in_app", "email", "both"],
      operator_doc_type: [
        "registration",
        "insurance_cert",
        "inspection_report",
        "ica_summary",
        "other",
        "form_2290",
        "truck_title",
        "truck_photos",
        "truck_inspection",
        "pe_receipt",
      ],
      pandadoc_status: ["sent", "viewed", "completed"],
      registration_type: ["own_registration", "needs_mo_reg"],
      resource_category: [
        "user_manuals",
        "decal_files",
        "forms_compliance",
        "dot_general",
      ],
      review_status: ["pending", "approved", "denied"],
      screening_result: ["pending", "clear", "non_clear"],
      screening_status: ["not_started", "scheduled", "results_in"],
      yes_no: ["no", "yes"],
    },
  },
} as const
