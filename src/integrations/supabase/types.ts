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
    PostgrestVersion: "14.5"
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
      application_correction_fields: {
        Row: {
          created_at: string
          field_label: string
          field_path: string
          id: string
          new_value: Json | null
          old_value: Json | null
          request_id: string
        }
        Insert: {
          created_at?: string
          field_label: string
          field_path: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          request_id: string
        }
        Update: {
          created_at?: string
          field_label?: string
          field_path?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_correction_fields_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "application_correction_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      application_correction_requests: {
        Row: {
          application_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          courtesy_message: string | null
          created_at: string
          expires_at: string
          id: string
          reason_for_changes: string
          rejection_reason: string | null
          requested_by_staff_id: string
          requested_by_staff_name: string | null
          responded_at: string | null
          sent_at: string
          signature_image_url: string | null
          signed_ip: unknown
          signed_typed_name: string | null
          signed_user_agent: string | null
          status: Database["public"]["Enums"]["application_correction_status"]
          token: string
          updated_at: string
        }
        Insert: {
          application_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          courtesy_message?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          reason_for_changes: string
          rejection_reason?: string | null
          requested_by_staff_id: string
          requested_by_staff_name?: string | null
          responded_at?: string | null
          sent_at?: string
          signature_image_url?: string | null
          signed_ip?: unknown
          signed_typed_name?: string | null
          signed_user_agent?: string | null
          status?: Database["public"]["Enums"]["application_correction_status"]
          token: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          courtesy_message?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          reason_for_changes?: string
          rejection_reason?: string | null
          requested_by_staff_id?: string
          requested_by_staff_name?: string | null
          responded_at?: string | null
          sent_at?: string
          signature_image_url?: string | null
          signed_ip?: unknown
          signed_typed_name?: string | null
          signed_user_agent?: string | null
          status?: Database["public"]["Enums"]["application_correction_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_correction_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_document_history: {
        Row: {
          application_id: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          document_key: string
          id: string
          new_path: string | null
          note: string | null
          old_path: string | null
          reason: string | null
          source: string
        }
        Insert: {
          application_id: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          document_key: string
          id?: string
          new_path?: string | null
          note?: string | null
          old_path?: string | null
          reason?: string | null
          source: string
        }
        Update: {
          application_id?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          document_key?: string
          id?: string
          new_path?: string | null
          note?: string | null
          old_path?: string | null
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_document_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
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
      application_revision_attachments: {
        Row: {
          application_id: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          note: string | null
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          application_id: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          application_id?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_revision_attachments_application_id_fkey"
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
          approved_at: string | null
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
          current_step: number
          dl_front_url: string | null
          dl_rear_url: string | null
          dob: string | null
          document_retake_requests: Json
          dot_accidents: boolean | null
          dot_accidents_description: string | null
          dot_positive_test_past_2yr: boolean | null
          dot_return_to_duty_docs: boolean | null
          draft_token: string | null
          driver_rights_notice_acknowledged: boolean
          driver_rights_notice_date: string | null
          email: string
          employers: Json
          employment_gaps: boolean | null
          employment_gaps_explanation: string | null
          endorsements: string[] | null
          equipment_operated: string[] | null
          first_name: string | null
          id: string
          is_demo: boolean
          is_draft: boolean | null
          last_name: string | null
          medical_cert_expiration: string | null
          medical_cert_url: string | null
          moving_violations: boolean | null
          moving_violations_description: string | null
          mvr_status: Database["public"]["Enums"]["mvr_status"]
          pei_archive_category: string | null
          pei_archive_reason: string | null
          pei_archived_at: string | null
          pei_archived_by: string | null
          pei_archived_by_name: string | null
          pei_deadline: string | null
          pei_status: Database["public"]["Enums"]["pei_applicant_status"]
          phone: string | null
          pre_revision_status:
            | Database["public"]["Enums"]["review_status"]
            | null
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
          revision_count: number
          revision_request_message: string | null
          revision_requested_at: string | null
          revision_requested_by: string | null
          revisions_handled_by_staff_at: string | null
          revisions_handled_by_staff_id: string | null
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
          approved_at?: string | null
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
          current_step?: number
          dl_front_url?: string | null
          dl_rear_url?: string | null
          dob?: string | null
          document_retake_requests?: Json
          dot_accidents?: boolean | null
          dot_accidents_description?: string | null
          dot_positive_test_past_2yr?: boolean | null
          dot_return_to_duty_docs?: boolean | null
          draft_token?: string | null
          driver_rights_notice_acknowledged?: boolean
          driver_rights_notice_date?: string | null
          email: string
          employers?: Json
          employment_gaps?: boolean | null
          employment_gaps_explanation?: string | null
          endorsements?: string[] | null
          equipment_operated?: string[] | null
          first_name?: string | null
          id?: string
          is_demo?: boolean
          is_draft?: boolean | null
          last_name?: string | null
          medical_cert_expiration?: string | null
          medical_cert_url?: string | null
          moving_violations?: boolean | null
          moving_violations_description?: string | null
          mvr_status?: Database["public"]["Enums"]["mvr_status"]
          pei_archive_category?: string | null
          pei_archive_reason?: string | null
          pei_archived_at?: string | null
          pei_archived_by?: string | null
          pei_archived_by_name?: string | null
          pei_deadline?: string | null
          pei_status?: Database["public"]["Enums"]["pei_applicant_status"]
          phone?: string | null
          pre_revision_status?:
            | Database["public"]["Enums"]["review_status"]
            | null
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
          revision_count?: number
          revision_request_message?: string | null
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          revisions_handled_by_staff_at?: string | null
          revisions_handled_by_staff_id?: string | null
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
          approved_at?: string | null
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
          current_step?: number
          dl_front_url?: string | null
          dl_rear_url?: string | null
          dob?: string | null
          document_retake_requests?: Json
          dot_accidents?: boolean | null
          dot_accidents_description?: string | null
          dot_positive_test_past_2yr?: boolean | null
          dot_return_to_duty_docs?: boolean | null
          draft_token?: string | null
          driver_rights_notice_acknowledged?: boolean
          driver_rights_notice_date?: string | null
          email?: string
          employers?: Json
          employment_gaps?: boolean | null
          employment_gaps_explanation?: string | null
          endorsements?: string[] | null
          equipment_operated?: string[] | null
          first_name?: string | null
          id?: string
          is_demo?: boolean
          is_draft?: boolean | null
          last_name?: string | null
          medical_cert_expiration?: string | null
          medical_cert_url?: string | null
          moving_violations?: boolean | null
          moving_violations_description?: string | null
          mvr_status?: Database["public"]["Enums"]["mvr_status"]
          pei_archive_category?: string | null
          pei_archive_reason?: string | null
          pei_archived_at?: string | null
          pei_archived_by?: string | null
          pei_archived_by_name?: string | null
          pei_deadline?: string | null
          pei_status?: Database["public"]["Enums"]["pei_applicant_status"]
          phone?: string | null
          pre_revision_status?:
            | Database["public"]["Enums"]["review_status"]
            | null
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
          revision_count?: number
          revision_request_message?: string | null
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          revisions_handled_by_staff_at?: string | null
          revisions_handled_by_staff_id?: string | null
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
      binder_share_bundles: {
        Row: {
          created_at: string
          created_by: string | null
          doc_tokens: string[]
          driver_name: string | null
          expires_at: string
          id: string
          token: string
          unit_number: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_tokens: string[]
          driver_name?: string | null
          expires_at?: string
          id?: string
          token?: string
          unit_number?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_tokens?: string[]
          driver_name?: string | null
          expires_at?: string
          id?: string
          token?: string
          unit_number?: string | null
        }
        Relationships: []
      }
      blank_log_acknowledgments: {
        Row: {
          acknowledged_at: string
          created_at: string
          id: string
          operator_id: string
          quarter_key: string
          sheets_confirmed: boolean
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string
          created_at?: string
          id?: string
          operator_id: string
          quarter_key: string
          sheets_confirmed?: boolean
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string
          created_at?: string
          id?: string
          operator_id?: string
          quarter_key?: string
          sheets_confirmed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blank_log_acknowledgments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_contacts: {
        Row: {
          broker_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role: Database["public"]["Enums"]["broker_contact_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          broker_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["broker_contact_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          broker_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["broker_contact_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_contacts_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_do_not_load_history: {
        Row: {
          broker_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_value: boolean
          previous_value: boolean | null
          reason: string | null
        }
        Insert: {
          broker_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value: boolean
          previous_value?: boolean | null
          reason?: string | null
        }
        Update: {
          broker_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: boolean
          previous_value?: boolean | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_do_not_load_history_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_do_not_load_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_documents: {
        Row: {
          broker_id: string
          created_at: string
          created_by: string | null
          document_category: string
          document_name: string
          expiration_date: string | null
          file_path: string | null
          file_url: string | null
          id: string
          is_current_version: boolean
          notes: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          broker_id: string
          created_at?: string
          created_by?: string | null
          document_category: string
          document_name: string
          expiration_date?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          notes?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          broker_id?: string
          created_at?: string
          created_by?: string | null
          document_category?: string
          document_name?: string
          expiration_date?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          notes?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "broker_documents_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_factoring_history: {
        Row: {
          broker_id: string
          changed_at: string
          changed_by: string | null
          documentation_url: string | null
          id: string
          new_status: Database["public"]["Enums"]["broker_factoring_status"]
          previous_status:
            | Database["public"]["Enums"]["broker_factoring_status"]
            | null
          reason: string | null
        }
        Insert: {
          broker_id: string
          changed_at?: string
          changed_by?: string | null
          documentation_url?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["broker_factoring_status"]
          previous_status?:
            | Database["public"]["Enums"]["broker_factoring_status"]
            | null
          reason?: string | null
        }
        Update: {
          broker_id?: string
          changed_at?: string
          changed_by?: string | null
          documentation_url?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["broker_factoring_status"]
          previous_status?:
            | Database["public"]["Enums"]["broker_factoring_status"]
            | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_factoring_history_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_factoring_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_notes: {
        Row: {
          body: string
          broker_id: string
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          broker_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          broker_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_notes_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avg_days_to_pay: number | null
          billing_email: string | null
          broker_agreement_document_id: string | null
          broker_agreement_recorded_by: string | null
          broker_agreement_signed: boolean
          broker_agreement_signed_at: string | null
          carrier_packet_completed: boolean
          carrier_packet_completed_at: string | null
          carrier_packet_completed_by: string | null
          city: string | null
          company_name: string
          created_at: string
          created_by: string | null
          do_not_load: boolean
          do_not_load_reason: string | null
          do_not_load_set_at: string | null
          do_not_load_set_by: string | null
          dot_number: string | null
          factoring_status: Database["public"]["Enums"]["broker_factoring_status"]
          factoring_status_reason: string | null
          factoring_status_updated_at: string | null
          id: string
          is_active: boolean
          mc_number: string | null
          notes: string | null
          payment_terms: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          rating: number | null
          state: string | null
          updated_at: string
          updated_by: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avg_days_to_pay?: number | null
          billing_email?: string | null
          broker_agreement_document_id?: string | null
          broker_agreement_recorded_by?: string | null
          broker_agreement_signed?: boolean
          broker_agreement_signed_at?: string | null
          carrier_packet_completed?: boolean
          carrier_packet_completed_at?: string | null
          carrier_packet_completed_by?: string | null
          city?: string | null
          company_name: string
          created_at?: string
          created_by?: string | null
          do_not_load?: boolean
          do_not_load_reason?: string | null
          do_not_load_set_at?: string | null
          do_not_load_set_by?: string | null
          dot_number?: string | null
          factoring_status?: Database["public"]["Enums"]["broker_factoring_status"]
          factoring_status_reason?: string | null
          factoring_status_updated_at?: string | null
          id?: string
          is_active?: boolean
          mc_number?: string | null
          notes?: string | null
          payment_terms?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          rating?: number | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avg_days_to_pay?: number | null
          billing_email?: string | null
          broker_agreement_document_id?: string | null
          broker_agreement_recorded_by?: string | null
          broker_agreement_signed?: boolean
          broker_agreement_signed_at?: string | null
          carrier_packet_completed?: boolean
          carrier_packet_completed_at?: string | null
          carrier_packet_completed_by?: string | null
          city?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          do_not_load?: boolean
          do_not_load_reason?: string | null
          do_not_load_set_at?: string | null
          do_not_load_set_by?: string | null
          dot_number?: string | null
          factoring_status?: Database["public"]["Enums"]["broker_factoring_status"]
          factoring_status_reason?: string | null
          factoring_status_updated_at?: string | null
          id?: string
          is_active?: boolean
          mc_number?: string | null
          notes?: string | null
          payment_terms?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          rating?: number | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brokers_broker_agreement_document_id_fkey"
            columns: ["broker_agreement_document_id"]
            isOneToOne: false
            referencedRelation: "broker_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brokers_broker_agreement_recorded_by_fkey"
            columns: ["broker_agreement_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brokers_carrier_packet_completed_by_fkey"
            columns: ["carrier_packet_completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brokers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brokers_do_not_load_set_by_fkey"
            columns: ["do_not_load_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brokers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_notification_settings: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          label: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          label?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      carrier_profile: {
        Row: {
          created_at: string
          fmcsa_division_state: string
          home_terminal_address: string
          home_terminal_timezone: string
          id: string
          legal_name: string
          main_office_address: string
          mc_number: string
          updated_at: string
          usdot_number: string
        }
        Insert: {
          created_at?: string
          fmcsa_division_state?: string
          home_terminal_address: string
          home_terminal_timezone: string
          id?: string
          legal_name: string
          main_office_address: string
          mc_number: string
          updated_at?: string
          usdot_number: string
        }
        Update: {
          created_at?: string
          fmcsa_division_state?: string
          home_terminal_address?: string
          home_terminal_timezone?: string
          id?: string
          legal_name?: string
          main_office_address?: string
          mc_number?: string
          updated_at?: string
          usdot_number?: string
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
          source: string
          threshold: string | null
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
          source?: string
          threshold?: string | null
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
          source?: string
          threshold?: string | null
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
      claim_flag_history: {
        Row: {
          action: string
          change_source: string | null
          changed_at: string
          changed_by: string | null
          claim_flag_id: string
          created_at: string | null
          id: string
          load_id: string
          new_actual_amount: number | null
          new_estimated_amount: number | null
          new_flag_level: Database["public"]["Enums"]["claim_flag_level"] | null
          new_is_active: boolean | null
          new_resolution: string | null
          notes: string | null
          previous_actual_amount: number | null
          previous_estimated_amount: number | null
          previous_flag_level:
            | Database["public"]["Enums"]["claim_flag_level"]
            | null
          previous_is_active: boolean | null
          previous_resolution: string | null
        }
        Insert: {
          action: string
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          claim_flag_id: string
          created_at?: string | null
          id?: string
          load_id: string
          new_actual_amount?: number | null
          new_estimated_amount?: number | null
          new_flag_level?:
            | Database["public"]["Enums"]["claim_flag_level"]
            | null
          new_is_active?: boolean | null
          new_resolution?: string | null
          notes?: string | null
          previous_actual_amount?: number | null
          previous_estimated_amount?: number | null
          previous_flag_level?:
            | Database["public"]["Enums"]["claim_flag_level"]
            | null
          previous_is_active?: boolean | null
          previous_resolution?: string | null
        }
        Update: {
          action?: string
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          claim_flag_id?: string
          created_at?: string | null
          id?: string
          load_id?: string
          new_actual_amount?: number | null
          new_estimated_amount?: number | null
          new_flag_level?:
            | Database["public"]["Enums"]["claim_flag_level"]
            | null
          new_is_active?: boolean | null
          new_resolution?: string | null
          notes?: string | null
          previous_actual_amount?: number | null
          previous_estimated_amount?: number | null
          previous_flag_level?:
            | Database["public"]["Enums"]["claim_flag_level"]
            | null
          previous_is_active?: boolean | null
          previous_resolution?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_flag_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_flag_history_claim_flag_id_fkey"
            columns: ["claim_flag_id"]
            isOneToOne: false
            referencedRelation: "claim_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_flag_history_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_flags: {
        Row: {
          actual_claim_amount: number | null
          claim_type: Database["public"]["Enums"]["claim_type"]
          created_at: string | null
          created_by: string | null
          description: string
          documentation_url: string | null
          estimated_claim_amount: number | null
          flag_level: Database["public"]["Enums"]["claim_flag_level"]
          id: string
          is_active: boolean
          load_id: string
          reported_at: string
          reported_by_contact: string | null
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          actual_claim_amount?: number | null
          claim_type?: Database["public"]["Enums"]["claim_type"]
          created_at?: string | null
          created_by?: string | null
          description: string
          documentation_url?: string | null
          estimated_claim_amount?: number | null
          flag_level?: Database["public"]["Enums"]["claim_flag_level"]
          id?: string
          is_active?: boolean
          load_id: string
          reported_at?: string
          reported_by_contact?: string | null
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          actual_claim_amount?: number | null
          claim_type?: Database["public"]["Enums"]["claim_type"]
          created_at?: string | null
          created_by?: string | null
          description?: string
          documentation_url?: string | null
          estimated_claim_amount?: number | null
          flag_level?: Database["public"]["Enums"]["claim_flag_level"]
          id?: string
          is_active?: boolean
          load_id?: string
          reported_at?: string
          reported_by_contact?: string | null
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_flags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_flags_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_documents: {
        Row: {
          category: Database["public"]["Enums"]["company_document_category"]
          created_at: string | null
          created_by: string | null
          description: string | null
          document_name: string
          expiration_date: string | null
          file_path: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_current_version: boolean
          is_sendable: boolean
          notes: string | null
          superseded_by_id: string | null
          updated_at: string | null
          updated_by: string | null
          version_number: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["company_document_category"]
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_name: string
          expiration_date?: string | null
          file_path?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          is_sendable?: boolean
          notes?: string | null
          superseded_by_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version_number?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["company_document_category"]
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_name?: string
          expiration_date?: string | null
          file_path?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          is_sendable?: boolean
          notes?: string | null
          superseded_by_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      detention_claims: {
        Row: {
          broker_notified_at: string | null
          created_at: string
          created_by: string | null
          driver_reported_at: string
          id: string
          load_id: string
          load_stop_id: string | null
          notification_method:
            | Database["public"]["Enums"]["detention_notification_method"]
            | null
          notified_by: string | null
          reported_to: string | null
          resolution_note: string | null
          resulting_charge_id: string | null
          status: Database["public"]["Enums"]["detention_claim_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          broker_notified_at?: string | null
          created_at?: string
          created_by?: string | null
          driver_reported_at: string
          id?: string
          load_id: string
          load_stop_id?: string | null
          notification_method?:
            | Database["public"]["Enums"]["detention_notification_method"]
            | null
          notified_by?: string | null
          reported_to?: string | null
          resolution_note?: string | null
          resulting_charge_id?: string | null
          status?: Database["public"]["Enums"]["detention_claim_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          broker_notified_at?: string | null
          created_at?: string
          created_by?: string | null
          driver_reported_at?: string
          id?: string
          load_id?: string
          load_stop_id?: string | null
          notification_method?:
            | Database["public"]["Enums"]["detention_notification_method"]
            | null
          notified_by?: string | null
          reported_to?: string | null
          resolution_note?: string | null
          resulting_charge_id?: string | null
          status?: Database["public"]["Enums"]["detention_claim_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detention_claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_claims_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_claims_load_stop_id_fkey"
            columns: ["load_stop_id"]
            isOneToOne: false
            referencedRelation: "load_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_claims_notified_by_fkey"
            columns: ["notified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_claims_reported_to_fkey"
            columns: ["reported_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_claims_resulting_charge_id_fkey"
            columns: ["resulting_charge_id"]
            isOneToOne: false
            referencedRelation: "load_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_claims_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      document_exceptions: {
        Row: {
          created_at: string | null
          document_type: Database["public"]["Enums"]["load_document_type"]
          driver_notes: string
          ebol_reference_number: string | null
          id: string
          load_id: string
          load_stop_id: string | null
          reason: Database["public"]["Enums"]["document_exception_reason"]
          report_latitude: number | null
          report_longitude: number | null
          reported_at: string
          reported_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolving_document_id: string | null
          status: Database["public"]["Enums"]["document_exception_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_type: Database["public"]["Enums"]["load_document_type"]
          driver_notes: string
          ebol_reference_number?: string | null
          id?: string
          load_id: string
          load_stop_id?: string | null
          reason: Database["public"]["Enums"]["document_exception_reason"]
          report_latitude?: number | null
          report_longitude?: number | null
          reported_at?: string
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolving_document_id?: string | null
          status?: Database["public"]["Enums"]["document_exception_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: Database["public"]["Enums"]["load_document_type"]
          driver_notes?: string
          ebol_reference_number?: string | null
          id?: string
          load_id?: string
          load_stop_id?: string | null
          reason?: Database["public"]["Enums"]["document_exception_reason"]
          report_latitude?: number | null
          report_longitude?: number | null
          reported_at?: string
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolving_document_id?: string | null
          status?: Database["public"]["Enums"]["document_exception_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_exceptions_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_exceptions_load_stop_id_fkey"
            columns: ["load_stop_id"]
            isOneToOne: false
            referencedRelation: "load_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_exceptions_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_exceptions_resolving_document_id_fkey"
            columns: ["resolving_document_id"]
            isOneToOne: false
            referencedRelation: "load_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_send_log: {
        Row: {
          broker_id: string | null
          company_document_id: string
          id: string
          message_body: string | null
          notes: string | null
          recipient_email: string
          recipient_name: string | null
          send_status: string
          sent_at: string
          sent_by: string | null
          subject: string | null
        }
        Insert: {
          broker_id?: string | null
          company_document_id: string
          id?: string
          message_body?: string | null
          notes?: string | null
          recipient_email: string
          recipient_name?: string | null
          send_status?: string
          sent_at?: string
          sent_by?: string | null
          subject?: string | null
        }
        Update: {
          broker_id?: string | null
          company_document_id?: string
          id?: string
          message_body?: string | null
          notes?: string | null
          recipient_email?: string
          recipient_name?: string | null
          send_status?: string
          sent_at?: string
          sent_by?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_send_log_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_send_log_company_document_id_fkey"
            columns: ["company_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_send_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_short_links: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          share_token: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          share_token: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          share_token?: string
        }
        Relationships: []
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
      dot_consultant_email_settings: {
        Row: {
          consultant_name: string | null
          greeting_name: string | null
          id: string
          recipient_emails: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          consultant_name?: string | null
          greeting_name?: string | null
          id?: string
          recipient_emails?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          consultant_name?: string | null
          greeting_name?: string | null
          id?: string
          recipient_emails?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      driver_documents: {
        Row: {
          blocks_go_live: boolean
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
          blocks_go_live?: boolean
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
          blocks_go_live?: boolean
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
      driver_staff_contact_suppressions: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          staff_id?: string
        }
        Relationships: []
      }
      driver_staff_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          staff_id?: string
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
      eld_cron_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          effective_date: string | null
          emails_sent: number
          error_text: string | null
          events_evaluated: number
          finished_at: string | null
          id: string
          is_override: boolean
          job_name: string
          ledger_rows_inserted: number
          notifications_inserted: number
          result: Json | null
          started_at: string
          status: string
          trigger_source: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          effective_date?: string | null
          emails_sent?: number
          error_text?: string | null
          events_evaluated?: number
          finished_at?: string | null
          id?: string
          is_override?: boolean
          job_name?: string
          ledger_rows_inserted?: number
          notifications_inserted?: number
          result?: Json | null
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          effective_date?: string | null
          emails_sent?: number
          error_text?: string | null
          events_evaluated?: number
          finished_at?: string | null
          id?: string
          is_override?: boolean
          job_name?: string
          ledger_rows_inserted?: number
          notifications_inserted?: number
          result?: Json | null
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Relationships: []
      }
      eld_device_models: {
        Row: {
          created_at: string
          device_make: string
          device_model: string
          fmcsa_list_date: string | null
          fmcsa_registration_id: string | null
          id: string
          is_active: boolean
          last_check_at: string | null
          last_check_id: string | null
          last_check_result: string | null
          provider_name: string
          replacement_deadline: string | null
          revocation_date: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_make: string
          device_model: string
          fmcsa_list_date?: string | null
          fmcsa_registration_id?: string | null
          id?: string
          is_active?: boolean
          last_check_at?: string | null
          last_check_id?: string | null
          last_check_result?: string | null
          provider_name: string
          replacement_deadline?: string | null
          revocation_date?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_make?: string
          device_model?: string
          fmcsa_list_date?: string | null
          fmcsa_registration_id?: string | null
          id?: string
          is_active?: boolean
          last_check_at?: string | null
          last_check_id?: string | null
          last_check_result?: string | null
          provider_name?: string
          replacement_deadline?: string | null
          revocation_date?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      eld_devices: {
        Row: {
          created_at: string
          eld_device_model_id: string | null
          id: string
          is_active: boolean
          operator_id: string
          serial_number: string | null
          truck_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          eld_device_model_id?: string | null
          id?: string
          is_active?: boolean
          operator_id: string
          serial_number?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          eld_device_model_id?: string | null
          id?: string
          is_active?: boolean
          operator_id?: string
          serial_number?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eld_devices_eld_device_model_id_fkey"
            columns: ["eld_device_model_id"]
            isOneToOne: false
            referencedRelation: "eld_device_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_devices_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      eld_extension_requests: {
        Row: {
          actions_taken: string
          carrier_legal_name: string
          carrier_main_office_address: string
          carrier_mc: string | null
          carrier_usdot: string
          created_at: string
          created_by: string | null
          device_make: string | null
          device_model: string | null
          device_provider: string | null
          device_serial: string | null
          discovered_at: string
          discovered_location: string
          driver_license_number: string | null
          driver_license_state: string | null
          driver_name: string
          eld_registration_id: string | null
          event_id: string
          filer_email: string
          filer_name: string
          filer_phone: string
          filer_title: string
          fmcsa_division_state: string
          generated_at: string | null
          granted_through: string | null
          id: string
          is_demo: boolean
          malfunction_code: string
          malfunction_description: string
          operator_id: string
          pdf_path: string | null
          repair_deadline: string
          reported_at: string
          requested_through: string
          responded_by: string | null
          response_date: string | null
          response_notes: string | null
          response_reference: string | null
          response_status_at: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          vehicle_unit_number: string | null
          vehicle_vin: string | null
          why_extension_needed: string
        }
        Insert: {
          actions_taken: string
          carrier_legal_name: string
          carrier_main_office_address: string
          carrier_mc?: string | null
          carrier_usdot: string
          created_at?: string
          created_by?: string | null
          device_make?: string | null
          device_model?: string | null
          device_provider?: string | null
          device_serial?: string | null
          discovered_at: string
          discovered_location: string
          driver_license_number?: string | null
          driver_license_state?: string | null
          driver_name: string
          eld_registration_id?: string | null
          event_id: string
          filer_email: string
          filer_name: string
          filer_phone: string
          filer_title: string
          fmcsa_division_state: string
          generated_at?: string | null
          granted_through?: string | null
          id?: string
          is_demo?: boolean
          malfunction_code: string
          malfunction_description: string
          operator_id: string
          pdf_path?: string | null
          repair_deadline: string
          reported_at: string
          requested_through: string
          responded_by?: string | null
          response_date?: string | null
          response_notes?: string | null
          response_reference?: string | null
          response_status_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          vehicle_unit_number?: string | null
          vehicle_vin?: string | null
          why_extension_needed: string
        }
        Update: {
          actions_taken?: string
          carrier_legal_name?: string
          carrier_main_office_address?: string
          carrier_mc?: string | null
          carrier_usdot?: string
          created_at?: string
          created_by?: string | null
          device_make?: string | null
          device_model?: string | null
          device_provider?: string | null
          device_serial?: string | null
          discovered_at?: string
          discovered_location?: string
          driver_license_number?: string | null
          driver_license_state?: string | null
          driver_name?: string
          eld_registration_id?: string | null
          event_id?: string
          filer_email?: string
          filer_name?: string
          filer_phone?: string
          filer_title?: string
          fmcsa_division_state?: string
          generated_at?: string | null
          granted_through?: string | null
          id?: string
          is_demo?: boolean
          malfunction_code?: string
          malfunction_description?: string
          operator_id?: string
          pdf_path?: string | null
          repair_deadline?: string
          reported_at?: string
          requested_through?: string
          responded_by?: string | null
          response_date?: string | null
          response_notes?: string | null
          response_reference?: string | null
          response_status_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          vehicle_unit_number?: string | null
          vehicle_vin?: string | null
          why_extension_needed?: string
        }
        Relationships: [
          {
            foreignKeyName: "eld_extension_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_extension_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "eld_malfunction_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_extension_requests_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_extension_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_extension_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eld_malfunction_events: {
        Row: {
          backdate_reason: string | null
          carrier_acknowledged_at: string | null
          carrier_acknowledged_by: string | null
          carrier_legal_name: string | null
          carrier_main_office_address: string | null
          carrier_mc: string | null
          carrier_usdot: string | null
          created_at: string
          device_make: string | null
          device_model: string | null
          device_provider: string | null
          device_serial: string | null
          discovered_at: string
          discovered_location: string
          driver_notes: string | null
          eld_device_id: string | null
          eld_registration_id: string | null
          escalations_suppressed_at: string | null
          escalations_suppressed_by: string | null
          escalations_suppressed_reason: string | null
          escalations_suppressed_until: string | null
          extension_expires_on: string | null
          extension_granted_at: string | null
          extension_granted_by: string | null
          extension_notes: string | null
          extension_requested_at: string | null
          hinders_hos_recording: boolean
          id: string
          is_demo: boolean
          malfunction_code: string
          malfunction_description: string
          notice_generated_at: string | null
          notice_last_send_error: string | null
          notice_pdf_path: string | null
          notice_send_attempts: number
          notice_sent_at: string | null
          notice_uploaded_at: string | null
          operator_id: string
          repair_deadline: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          backdate_reason?: string | null
          carrier_acknowledged_at?: string | null
          carrier_acknowledged_by?: string | null
          carrier_legal_name?: string | null
          carrier_main_office_address?: string | null
          carrier_mc?: string | null
          carrier_usdot?: string | null
          created_at?: string
          device_make?: string | null
          device_model?: string | null
          device_provider?: string | null
          device_serial?: string | null
          discovered_at: string
          discovered_location: string
          driver_notes?: string | null
          eld_device_id?: string | null
          eld_registration_id?: string | null
          escalations_suppressed_at?: string | null
          escalations_suppressed_by?: string | null
          escalations_suppressed_reason?: string | null
          escalations_suppressed_until?: string | null
          extension_expires_on?: string | null
          extension_granted_at?: string | null
          extension_granted_by?: string | null
          extension_notes?: string | null
          extension_requested_at?: string | null
          hinders_hos_recording?: boolean
          id?: string
          is_demo?: boolean
          malfunction_code: string
          malfunction_description: string
          notice_generated_at?: string | null
          notice_last_send_error?: string | null
          notice_pdf_path?: string | null
          notice_send_attempts?: number
          notice_sent_at?: string | null
          notice_uploaded_at?: string | null
          operator_id: string
          repair_deadline: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          backdate_reason?: string | null
          carrier_acknowledged_at?: string | null
          carrier_acknowledged_by?: string | null
          carrier_legal_name?: string | null
          carrier_main_office_address?: string | null
          carrier_mc?: string | null
          carrier_usdot?: string | null
          created_at?: string
          device_make?: string | null
          device_model?: string | null
          device_provider?: string | null
          device_serial?: string | null
          discovered_at?: string
          discovered_location?: string
          driver_notes?: string | null
          eld_device_id?: string | null
          eld_registration_id?: string | null
          escalations_suppressed_at?: string | null
          escalations_suppressed_by?: string | null
          escalations_suppressed_reason?: string | null
          escalations_suppressed_until?: string | null
          extension_expires_on?: string | null
          extension_granted_at?: string | null
          extension_granted_by?: string | null
          extension_notes?: string | null
          extension_requested_at?: string | null
          hinders_hos_recording?: boolean
          id?: string
          is_demo?: boolean
          malfunction_code?: string
          malfunction_description?: string
          notice_generated_at?: string | null
          notice_last_send_error?: string | null
          notice_pdf_path?: string | null
          notice_send_attempts?: number
          notice_sent_at?: string | null
          notice_uploaded_at?: string | null
          operator_id?: string
          repair_deadline?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eld_malfunction_events_carrier_acknowledged_by_fkey"
            columns: ["carrier_acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_malfunction_events_eld_device_id_fkey"
            columns: ["eld_device_id"]
            isOneToOne: false
            referencedRelation: "eld_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_malfunction_events_escalations_suppressed_by_fkey"
            columns: ["escalations_suppressed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_malfunction_events_extension_granted_by_fkey"
            columns: ["extension_granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eld_malfunction_events_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      eld_malfunction_notifications: {
        Row: {
          channel: string
          created_at: string
          day_number: number | null
          event_id: string | null
          id: string
          is_override: boolean
          notification_type: string
          recipient_user_id: string
          sent_on: string
        }
        Insert: {
          channel: string
          created_at?: string
          day_number?: number | null
          event_id?: string | null
          id?: string
          is_override?: boolean
          notification_type: string
          recipient_user_id: string
          sent_on?: string
        }
        Update: {
          channel?: string
          created_at?: string
          day_number?: number | null
          event_id?: string | null
          id?: string
          is_override?: boolean
          notification_type?: string
          recipient_user_id?: string
          sent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "eld_malfunction_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "eld_malfunction_events"
            referencedColumns: ["id"]
          },
        ]
      }
      eld_revoked_list_checks: {
        Row: {
          checked_at: string
          checked_by: string | null
          created_at: string
          eld_device_model_id: string
          fmcsa_list_date: string | null
          id: string
          is_demo: boolean
          notes: string | null
          replacement_deadline: string | null
          result: string
          revocation_date: string | null
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          eld_device_model_id: string
          fmcsa_list_date?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          replacement_deadline?: string | null
          result: string
          revocation_date?: string | null
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          eld_device_model_id?: string
          fmcsa_list_date?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          replacement_deadline?: string | null
          result?: string
          revocation_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eld_revoked_list_checks_eld_device_model_id_fkey"
            columns: ["eld_device_model_id"]
            isOneToOne: false
            referencedRelation: "eld_device_models"
            referencedColumns: ["id"]
          },
        ]
      }
      eld_sync_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          detail: string
          id: string
          is_demo: boolean
          kind: string
          last_seen_at: string
          log_date: string | null
          occurrences: number
          operator_id: string | null
          raised_at: string
          raised_by: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          detail?: string
          id?: string
          is_demo?: boolean
          kind: string
          last_seen_at?: string
          log_date?: string | null
          occurrences?: number
          operator_id?: string | null
          raised_at?: string
          raised_by?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          detail?: string
          id?: string
          is_demo?: boolean
          kind?: string
          last_seen_at?: string
          log_date?: string | null
          occurrences?: number
          operator_id?: string | null
          raised_at?: string
          raised_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eld_sync_alerts_operator_id_fkey"
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
          open_count: number
          opened_at: string | null
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
          open_count?: number
          opened_at?: string | null
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
          open_count?: number
          opened_at?: string | null
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
      equipment_receipts: {
        Row: {
          carrier: string | null
          created_at: string
          direction: string
          equipment_line: string | null
          file_name: string | null
          file_url: string
          id: string
          operator_id: string
          sheet_id: string | null
          tracking_number: string | null
          uploaded_at: string
          uploaded_by: string | null
          uploader_role: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          direction: string
          equipment_line?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          operator_id: string
          sheet_id?: string | null
          tracking_number?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploader_role: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          direction?: string
          equipment_line?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          operator_id?: string
          sheet_id?: string | null
          tracking_number?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploader_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_receipts_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_receipts_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "onboard_assignment_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          access_notes: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          default_appointment_required: boolean
          facility_name: string
          facility_type: string | null
          hours_notes: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          notes: string | null
          state: string | null
          times_used: number
          updated_at: string
          updated_by: string | null
          zip: string | null
        }
        Insert: {
          access_notes?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          default_appointment_required?: boolean
          facility_name: string
          facility_type?: string | null
          hours_notes?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          notes?: string | null
          state?: string | null
          times_used?: number
          updated_at?: string
          updated_by?: string | null
          zip?: string | null
        }
        Update: {
          access_notes?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          default_appointment_required?: boolean
          facility_name?: string
          facility_type?: string | null
          hours_notes?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          notes?: string | null
          state?: string | null
          times_used?: number
          updated_at?: string
          updated_by?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facilities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faq: {
        Row: {
          answer: string
          audience: Database["public"]["Enums"]["faq_audience"]
          category: Database["public"]["Enums"]["faq_category"]
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          last_verified_at: string
          question: string
          search_vector: unknown
          sort_order: number
          source_document: string | null
          source_section: string | null
          tags: string[]
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          answer: string
          audience?: Database["public"]["Enums"]["faq_audience"]
          category: Database["public"]["Enums"]["faq_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          last_verified_at?: string
          question: string
          search_vector?: unknown
          sort_order?: number
          source_document?: string | null
          source_section?: string | null
          tags?: string[]
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          answer?: string
          audience?: Database["public"]["Enums"]["faq_audience"]
          category?: Database["public"]["Enums"]["faq_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          last_verified_at?: string
          question?: string
          search_vector?: unknown
          sort_order?: number
          source_document?: string | null
          source_section?: string | null
          tags?: string[]
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      faq_history: {
        Row: {
          answer: string
          audience: Database["public"]["Enums"]["faq_audience"] | null
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
          audience?: Database["public"]["Enums"]["faq_audience"] | null
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
          audience?: Database["public"]["Enums"]["faq_audience"] | null
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
      ica_amendment_units: {
        Row: {
          amendment_id: string
          change_type: string
          created_at: string
          id: string
          is_primary: boolean
          trailer_number: string | null
          truck_make: string | null
          truck_model: string | null
          truck_plate: string | null
          truck_plate_state: string | null
          truck_vin: string | null
          truck_year: string | null
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          amendment_id: string
          change_type: string
          created_at?: string
          id?: string
          is_primary?: boolean
          trailer_number?: string | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_vin?: string | null
          truck_year?: string | null
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          amendment_id?: string
          change_type?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          trailer_number?: string | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_vin?: string | null
          truck_year?: string | null
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ica_amendment_units_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "ica_amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      ica_amendments: {
        Row: {
          action: string
          activated_at: string | null
          amendment_number: number
          carrier_signature_url: string | null
          carrier_signed_at: string | null
          carrier_signed_by: string | null
          carrier_title: string | null
          carrier_typed_name: string | null
          created_at: string
          created_by: string | null
          effective_date: string | null
          id: string
          notes: string | null
          operator_id: string
          operator_signature_url: string | null
          operator_signed_at: string | null
          operator_typed_name: string | null
          parent_ica_id: string
          pdf_path: string | null
          pdf_url: string | null
          status: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          action: string
          activated_at?: string | null
          amendment_number: number
          carrier_signature_url?: string | null
          carrier_signed_at?: string | null
          carrier_signed_by?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          notes?: string | null
          operator_id: string
          operator_signature_url?: string | null
          operator_signed_at?: string | null
          operator_typed_name?: string | null
          parent_ica_id: string
          pdf_path?: string | null
          pdf_url?: string | null
          status?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          action?: string
          activated_at?: string | null
          amendment_number?: number
          carrier_signature_url?: string | null
          carrier_signed_at?: string | null
          carrier_signed_by?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          notes?: string | null
          operator_id?: string
          operator_signature_url?: string | null
          operator_signed_at?: string | null
          operator_typed_name?: string | null
          parent_ica_id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          status?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ica_amendments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ica_amendments_parent_ica_id_fkey"
            columns: ["parent_ica_id"]
            isOneToOne: false
            referencedRelation: "ica_contracts"
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
      ica_driver_acknowledgments: {
        Row: {
          acknowledged_at: string
          contract_id: string
          created_at: string
          driver_user_id: string
          id: string
        }
        Insert: {
          acknowledged_at?: string
          contract_id: string
          created_at?: string
          driver_user_id: string
          id?: string
        }
        Update: {
          acknowledged_at?: string
          contract_id?: string
          created_at?: string
          driver_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ica_driver_acknowledgments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ica_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ica_review_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          note: string | null
          opened_at: string | null
          recipient_email: string
          recipient_name: string
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          opened_at?: string | null
          recipient_email: string
          recipient_name: string
          revoked?: boolean
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          opened_at?: string | null
          recipient_email?: string
          recipient_name?: string
          revoked?: boolean
          token?: string
        }
        Relationships: []
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
          inspection_date: string | null
          inspection_result: string | null
          inspector_name: string | null
          name: string
          pending_review: boolean
          public_share_token: string
          scope: Database["public"]["Enums"]["inspection_doc_scope"]
          shared_with_fleet: boolean
          source: string
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
          inspection_date?: string | null
          inspection_result?: string | null
          inspector_name?: string | null
          name: string
          pending_review?: boolean
          public_share_token?: string
          scope?: Database["public"]["Enums"]["inspection_doc_scope"]
          shared_with_fleet?: boolean
          source?: string
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
          inspection_date?: string | null
          inspection_result?: string | null
          inspector_name?: string | null
          name?: string
          pending_review?: boolean
          public_share_token?: string
          scope?: Database["public"]["Enums"]["inspection_doc_scope"]
          shared_with_fleet?: boolean
          source?: string
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
      load_change_history: {
        Row: {
          change_source: string
          changed_at: string
          changed_by: string | null
          field_path: string
          id: string
          is_financial: boolean
          load_id: string
          new_value: string | null
          previous_value: string | null
          reason: string | null
        }
        Insert: {
          change_source?: string
          changed_at?: string
          changed_by?: string | null
          field_path: string
          id?: string
          is_financial?: boolean
          load_id: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
        }
        Update: {
          change_source?: string
          changed_at?: string
          changed_by?: string | null
          field_path?: string
          id?: string
          is_financial?: boolean
          load_id?: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_change_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_change_history_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_charges: {
        Row: {
          actual_cost: number | null
          amount: number
          charge_type: string
          created_at: string
          created_by: string | null
          description: string | null
          funding_source: string | null
          id: string
          load_id: string
          load_stop_id: string | null
          proof_document_id: string | null
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_cost?: number | null
          amount?: number
          charge_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          funding_source?: string | null
          id?: string
          load_id: string
          load_stop_id?: string | null
          proof_document_id?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_cost?: number | null
          amount?: number
          charge_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          funding_source?: string | null
          id?: string
          load_id?: string
          load_stop_id?: string | null
          proof_document_id?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_charges_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_charges_load_stop_id_fkey"
            columns: ["load_stop_id"]
            isOneToOne: false
            referencedRelation: "load_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_charges_proof_document_id_fkey"
            columns: ["proof_document_id"]
            isOneToOne: false
            referencedRelation: "load_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_charges_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      load_documents: {
        Row: {
          capture_latitude: number | null
          capture_longitude: number | null
          created_at: string | null
          damage_noted: boolean | null
          damage_notes: string | null
          document_name: string | null
          document_type: Database["public"]["Enums"]["load_document_type"]
          file_path: string | null
          file_type: string | null
          file_url: string | null
          id: string
          inspection_sticker_expiry: string | null
          inspection_sticker_state:
            | Database["public"]["Enums"]["loadout_sticker_state"]
            | null
          is_verified: boolean | null
          load_id: string
          load_stop_id: string | null
          notes: string | null
          photo_label: string | null
          photo_sequence: number | null
          updated_at: string | null
          upload_channel: Database["public"]["Enums"]["document_upload_channel"]
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          capture_latitude?: number | null
          capture_longitude?: number | null
          created_at?: string | null
          damage_noted?: boolean | null
          damage_notes?: string | null
          document_name?: string | null
          document_type: Database["public"]["Enums"]["load_document_type"]
          file_path?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          inspection_sticker_expiry?: string | null
          inspection_sticker_state?:
            | Database["public"]["Enums"]["loadout_sticker_state"]
            | null
          is_verified?: boolean | null
          load_id: string
          load_stop_id?: string | null
          notes?: string | null
          photo_label?: string | null
          photo_sequence?: number | null
          updated_at?: string | null
          upload_channel?: Database["public"]["Enums"]["document_upload_channel"]
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          capture_latitude?: number | null
          capture_longitude?: number | null
          created_at?: string | null
          damage_noted?: boolean | null
          damage_notes?: string | null
          document_name?: string | null
          document_type?: Database["public"]["Enums"]["load_document_type"]
          file_path?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          inspection_sticker_expiry?: string | null
          inspection_sticker_state?:
            | Database["public"]["Enums"]["loadout_sticker_state"]
            | null
          is_verified?: boolean | null
          load_id?: string
          load_stop_id?: string | null
          notes?: string | null
          photo_label?: string | null
          photo_sequence?: number | null
          updated_at?: string | null
          upload_channel?: Database["public"]["Enums"]["document_upload_channel"]
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_documents_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_documents_load_stop_id_fkey"
            columns: ["load_stop_id"]
            isOneToOne: false
            referencedRelation: "load_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      load_number_config: {
        Row: {
          current_year: number | null
          id: string
          include_year: boolean
          next_sequence: number
          prefix: string
          reset_annually: boolean
          separator: string
          sequence_padding: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          current_year?: number | null
          id?: string
          include_year?: boolean
          next_sequence?: number
          prefix?: string
          reset_annually?: boolean
          separator?: string
          sequence_padding?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          current_year?: number | null
          id?: string
          include_year?: boolean
          next_sequence?: number
          prefix?: string
          reset_annually?: boolean
          separator?: string
          sequence_padding?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      load_reference_citations: {
        Row: {
          created_at: string
          id: string
          load_stop_id: string | null
          printed_label: string | null
          reference_id: string
          stop_sequence: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          load_stop_id?: string | null
          printed_label?: string | null
          reference_id: string
          stop_sequence?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          load_stop_id?: string | null
          printed_label?: string | null
          reference_id?: string
          stop_sequence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "load_reference_citations_load_stop_id_fkey"
            columns: ["load_stop_id"]
            isOneToOne: false
            referencedRelation: "load_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_reference_citations_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "load_references"
            referencedColumns: ["id"]
          },
        ]
      }
      load_references: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          load_id: string
          reference_class: string
          source: string
          value: string
          value_key: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          load_id: string
          reference_class: string
          source?: string
          value: string
          value_key: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          load_id?: string
          reference_class?: string
          source?: string
          value?: string
          value_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_references_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_references_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_status_history: {
        Row: {
          change_source: string | null
          changed_at: string
          changed_by: string | null
          created_at: string | null
          id: string
          load_id: string
          new_status: Database["public"]["Enums"]["load_status"]
          notes: string | null
          previous_status: Database["public"]["Enums"]["load_status"] | null
        }
        Insert: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          load_id: string
          new_status: Database["public"]["Enums"]["load_status"]
          notes?: string | null
          previous_status?: Database["public"]["Enums"]["load_status"] | null
        }
        Update: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          load_id?: string
          new_status?: Database["public"]["Enums"]["load_status"]
          notes?: string | null
          previous_status?: Database["public"]["Enums"]["load_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "load_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_status_history_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      load_stops: {
        Row: {
          actual_arrival_at: string | null
          actual_departure_at: string | null
          address_line1: string | null
          address_line2: string | null
          appointment_end: string | null
          appointment_start: string | null
          arrival_latitude: number | null
          arrival_longitude: number | null
          arrival_recorded_by: string | null
          arrival_source: Database["public"]["Enums"]["stop_time_source"] | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          departure_latitude: number | null
          departure_longitude: number | null
          departure_recorded_by: string | null
          departure_source:
            | Database["public"]["Enums"]["stop_time_source"]
            | null
          facility_id: string | null
          facility_name: string | null
          id: string
          load_id: string
          reference_label: string | null
          reference_number: string | null
          state: string | null
          stop_notes: string | null
          stop_notes_verbatim: string | null
          stop_sequence: number
          stop_type: Database["public"]["Enums"]["stop_type"]
          stopoff_charge_amount: number | null
          stopoff_charge_eligible: boolean | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          actual_arrival_at?: string | null
          actual_departure_at?: string | null
          address_line1?: string | null
          address_line2?: string | null
          appointment_end?: string | null
          appointment_start?: string | null
          arrival_latitude?: number | null
          arrival_longitude?: number | null
          arrival_recorded_by?: string | null
          arrival_source?:
            | Database["public"]["Enums"]["stop_time_source"]
            | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          departure_latitude?: number | null
          departure_longitude?: number | null
          departure_recorded_by?: string | null
          departure_source?:
            | Database["public"]["Enums"]["stop_time_source"]
            | null
          facility_id?: string | null
          facility_name?: string | null
          id?: string
          load_id: string
          reference_label?: string | null
          reference_number?: string | null
          state?: string | null
          stop_notes?: string | null
          stop_notes_verbatim?: string | null
          stop_sequence: number
          stop_type: Database["public"]["Enums"]["stop_type"]
          stopoff_charge_amount?: number | null
          stopoff_charge_eligible?: boolean | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          actual_arrival_at?: string | null
          actual_departure_at?: string | null
          address_line1?: string | null
          address_line2?: string | null
          appointment_end?: string | null
          appointment_start?: string | null
          arrival_latitude?: number | null
          arrival_longitude?: number | null
          arrival_recorded_by?: string | null
          arrival_source?:
            | Database["public"]["Enums"]["stop_time_source"]
            | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          departure_latitude?: number | null
          departure_longitude?: number | null
          departure_recorded_by?: string | null
          departure_source?:
            | Database["public"]["Enums"]["stop_time_source"]
            | null
          facility_id?: string | null
          facility_name?: string | null
          id?: string
          load_id?: string
          reference_label?: string | null
          reference_number?: string | null
          state?: string | null
          stop_notes?: string | null
          stop_notes_verbatim?: string | null
          stop_sequence?: number
          stop_type?: Database["public"]["Enums"]["stop_type"]
          stopoff_charge_amount?: number | null
          stopoff_charge_eligible?: boolean | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_stops_arrival_recorded_by_fkey"
            columns: ["arrival_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_stops_departure_recorded_by_fkey"
            columns: ["departure_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_stops_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_stops_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          bol_number: string | null
          broker_id: string | null
          broker_reference_number: string | null
          broker_terms_verbatim: string | null
          co_driver_name: string | null
          commodity: string | null
          confirmed_tons: number | null
          created_at: string
          created_by: string | null
          deadhead_miles: number | null
          delivered_at: string | null
          detention_clock_start:
            | Database["public"]["Enums"]["detention_clock_start"]
            | null
          detention_daily_cap: number | null
          detention_free_time_minutes: number | null
          detention_notification_required: boolean | null
          detention_rate_per_hour: number | null
          detention_terms_note: string | null
          dispatched_at: string | null
          dispatcher_id: string | null
          driver_accepted_at: string | null
          driver_decline_reason: string | null
          driver_declined_at: string | null
          driver_facing_notes: string | null
          equipment_type: Database["public"]["Enums"]["equipment_type"] | null
          estimated_tons: number | null
          fsc_amount: number | null
          fsc_bundled_into_linehaul: boolean | null
          handling_type:
            | Database["public"]["Enums"]["load_handling_type"]
            | null
          id: string
          internal_notes: string | null
          is_hazmat: boolean | null
          is_team_load: boolean | null
          linehaul_rate: number | null
          load_number: string
          load_type: Database["public"]["Enums"]["load_type"]
          loaded_miles: number | null
          loadout_relocation_fee: number | null
          loadout_trailer_number: string | null
          loadout_trailer_owner_company: string | null
          loadout_trailer_owner_contact: string | null
          loadout_trailer_type: string | null
          loadout_trailer_vin: string | null
          loadout_use_end: string | null
          loadout_use_period_days: number | null
          loadout_use_start: string | null
          loadout_use_window_source: string | null
          mode: string | null
          operator_id: string | null
          permit_cost: number | null
          permit_recovery_method: string | null
          permit_required: boolean | null
          po_number: string | null
          rate_per_mile: number | null
          rate_per_ton: number | null
          rate_type: Database["public"]["Enums"]["rate_type"]
          reefer_acknowledged_at: string | null
          reefer_continuous_run: boolean | null
          reefer_notes: string | null
          reefer_precool_required: boolean | null
          reefer_temp_f: number | null
          reefer_temp_max_f: number | null
          reefer_temp_min_f: number | null
          special_instructions: string | null
          special_instructions_verbatim: string | null
          status: Database["public"]["Enums"]["load_status"]
          total_load_value: number | null
          updated_at: string
          updated_by: string | null
          verbatim_verification: Json | null
          weight_lbs: number | null
        }
        Insert: {
          bol_number?: string | null
          broker_id?: string | null
          broker_reference_number?: string | null
          broker_terms_verbatim?: string | null
          co_driver_name?: string | null
          commodity?: string | null
          confirmed_tons?: number | null
          created_at?: string
          created_by?: string | null
          deadhead_miles?: number | null
          delivered_at?: string | null
          detention_clock_start?:
            | Database["public"]["Enums"]["detention_clock_start"]
            | null
          detention_daily_cap?: number | null
          detention_free_time_minutes?: number | null
          detention_notification_required?: boolean | null
          detention_rate_per_hour?: number | null
          detention_terms_note?: string | null
          dispatched_at?: string | null
          dispatcher_id?: string | null
          driver_accepted_at?: string | null
          driver_decline_reason?: string | null
          driver_declined_at?: string | null
          driver_facing_notes?: string | null
          equipment_type?: Database["public"]["Enums"]["equipment_type"] | null
          estimated_tons?: number | null
          fsc_amount?: number | null
          fsc_bundled_into_linehaul?: boolean | null
          handling_type?:
            | Database["public"]["Enums"]["load_handling_type"]
            | null
          id?: string
          internal_notes?: string | null
          is_hazmat?: boolean | null
          is_team_load?: boolean | null
          linehaul_rate?: number | null
          load_number: string
          load_type?: Database["public"]["Enums"]["load_type"]
          loaded_miles?: number | null
          loadout_relocation_fee?: number | null
          loadout_trailer_number?: string | null
          loadout_trailer_owner_company?: string | null
          loadout_trailer_owner_contact?: string | null
          loadout_trailer_type?: string | null
          loadout_trailer_vin?: string | null
          loadout_use_end?: string | null
          loadout_use_period_days?: number | null
          loadout_use_start?: string | null
          loadout_use_window_source?: string | null
          mode?: string | null
          operator_id?: string | null
          permit_cost?: number | null
          permit_recovery_method?: string | null
          permit_required?: boolean | null
          po_number?: string | null
          rate_per_mile?: number | null
          rate_per_ton?: number | null
          rate_type?: Database["public"]["Enums"]["rate_type"]
          reefer_acknowledged_at?: string | null
          reefer_continuous_run?: boolean | null
          reefer_notes?: string | null
          reefer_precool_required?: boolean | null
          reefer_temp_f?: number | null
          reefer_temp_max_f?: number | null
          reefer_temp_min_f?: number | null
          special_instructions?: string | null
          special_instructions_verbatim?: string | null
          status?: Database["public"]["Enums"]["load_status"]
          total_load_value?: number | null
          updated_at?: string
          updated_by?: string | null
          verbatim_verification?: Json | null
          weight_lbs?: number | null
        }
        Update: {
          bol_number?: string | null
          broker_id?: string | null
          broker_reference_number?: string | null
          broker_terms_verbatim?: string | null
          co_driver_name?: string | null
          commodity?: string | null
          confirmed_tons?: number | null
          created_at?: string
          created_by?: string | null
          deadhead_miles?: number | null
          delivered_at?: string | null
          detention_clock_start?:
            | Database["public"]["Enums"]["detention_clock_start"]
            | null
          detention_daily_cap?: number | null
          detention_free_time_minutes?: number | null
          detention_notification_required?: boolean | null
          detention_rate_per_hour?: number | null
          detention_terms_note?: string | null
          dispatched_at?: string | null
          dispatcher_id?: string | null
          driver_accepted_at?: string | null
          driver_decline_reason?: string | null
          driver_declined_at?: string | null
          driver_facing_notes?: string | null
          equipment_type?: Database["public"]["Enums"]["equipment_type"] | null
          estimated_tons?: number | null
          fsc_amount?: number | null
          fsc_bundled_into_linehaul?: boolean | null
          handling_type?:
            | Database["public"]["Enums"]["load_handling_type"]
            | null
          id?: string
          internal_notes?: string | null
          is_hazmat?: boolean | null
          is_team_load?: boolean | null
          linehaul_rate?: number | null
          load_number?: string
          load_type?: Database["public"]["Enums"]["load_type"]
          loaded_miles?: number | null
          loadout_relocation_fee?: number | null
          loadout_trailer_number?: string | null
          loadout_trailer_owner_company?: string | null
          loadout_trailer_owner_contact?: string | null
          loadout_trailer_type?: string | null
          loadout_trailer_vin?: string | null
          loadout_use_end?: string | null
          loadout_use_period_days?: number | null
          loadout_use_start?: string | null
          loadout_use_window_source?: string | null
          mode?: string | null
          operator_id?: string | null
          permit_cost?: number | null
          permit_recovery_method?: string | null
          permit_required?: boolean | null
          po_number?: string | null
          rate_per_mile?: number | null
          rate_per_ton?: number | null
          rate_type?: Database["public"]["Enums"]["rate_type"]
          reefer_acknowledged_at?: string | null
          reefer_continuous_run?: boolean | null
          reefer_notes?: string | null
          reefer_precool_required?: boolean | null
          reefer_temp_f?: number | null
          reefer_temp_max_f?: number | null
          reefer_temp_min_f?: number | null
          special_instructions?: string | null
          special_instructions_verbatim?: string | null
          status?: Database["public"]["Enums"]["load_status"]
          total_load_value?: number | null
          updated_at?: string
          updated_by?: string | null
          verbatim_verification?: Json | null
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_dispatcher_id_fkey"
            columns: ["dispatcher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      message_threads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_group: boolean
          last_message_at: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string | null
          title?: string | null
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
          is_system: boolean
          load_id: string | null
          pinned_at: string | null
          pinned_by: string | null
          read_at: string | null
          recipient_id: string | null
          reminder_sent_at: string | null
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
          is_system?: boolean
          load_id?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          read_at?: string | null
          recipient_id?: string | null
          reminder_sent_at?: string | null
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
          is_system?: boolean
          load_id?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          read_at?: string | null
          recipient_id?: string | null
          reminder_sent_at?: string | null
          reply_to_id?: string | null
          sender_id?: string
          sent_at?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
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
      notification_role_defaults: {
        Row: {
          category: string
          email_enabled: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          category: string
          email_enabled?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          category?: string
          email_enabled?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          body: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          priority: string
          read_at: string | null
          sent_at: string
          snoozed_until: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          priority?: string
          read_at?: string | null
          sent_at?: string
          snoozed_until?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          priority?: string
          read_at?: string | null
          sent_at?: string
          snoozed_until?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      officer_packet_links: {
        Row: {
          bucket: string
          created_at: string
          operator_id: string
          storage_path: string
          token: string
        }
        Insert: {
          bucket?: string
          created_at?: string
          operator_id: string
          storage_path: string
          token: string
        }
        Update: {
          bucket?: string
          created_at?: string
          operator_id?: string
          storage_path?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "officer_packet_links_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_packet_links_token_fkey"
            columns: ["token"]
            isOneToOne: true
            referencedRelation: "share_tokens"
            referencedColumns: ["token"]
          },
        ]
      }
      onboard_assignment_sheet_items: {
        Row: {
          created_at: string
          device_type: Database["public"]["Enums"]["osas_device_type"]
          driver_confirmed_at: string | null
          equipment_id: string | null
          id: string
          plate_assignment_id: string | null
          serial_snapshot: string
          sheet_id: string
        }
        Insert: {
          created_at?: string
          device_type: Database["public"]["Enums"]["osas_device_type"]
          driver_confirmed_at?: string | null
          equipment_id?: string | null
          id?: string
          plate_assignment_id?: string | null
          serial_snapshot: string
          sheet_id: string
        }
        Update: {
          created_at?: string
          device_type?: Database["public"]["Enums"]["osas_device_type"]
          driver_confirmed_at?: string | null
          equipment_id?: string | null
          id?: string
          plate_assignment_id?: string | null
          serial_snapshot?: string
          sheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboard_assignment_sheet_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboard_assignment_sheet_items_plate_assignment_id_fkey"
            columns: ["plate_assignment_id"]
            isOneToOne: false
            referencedRelation: "mo_plate_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboard_assignment_sheet_items_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "onboard_assignment_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      onboard_assignment_sheet_sends: {
        Row: {
          created_at: string
          id: string
          kind: string
          recipient_email: string | null
          sent_at: string
          sent_by: string | null
          sent_by_name: string | null
          sheet_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          recipient_email?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
          sheet_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          recipient_email?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
          sheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboard_assignment_sheet_sends_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "onboard_assignment_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      onboard_assignment_sheets: {
        Row: {
          access_token: string | null
          assignment_date: string
          bestpass_fee_cents: number | null
          bestpass_included: boolean
          cdl_expiration: string | null
          cdl_number: string | null
          cdl_state: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          driver_ip: string | null
          driver_signature_data_url: string | null
          driver_signature_name: string | null
          id: string
          is_paper_original: boolean
          operator_id: string
          paper_scan_name: string | null
          paper_scan_path: string | null
          recorded_at: string | null
          recorded_by: string | null
          recorded_by_name: string | null
          return_completed_at: string | null
          return_requested_at: string | null
          return_requested_by: string | null
          return_requested_by_name: string | null
          sent_at: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          status: Database["public"]["Enums"]["osas_status"]
          terms_version: string
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          assignment_date?: string
          bestpass_fee_cents?: number | null
          bestpass_included?: boolean
          cdl_expiration?: string | null
          cdl_number?: string | null
          cdl_state?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          driver_ip?: string | null
          driver_signature_data_url?: string | null
          driver_signature_name?: string | null
          id?: string
          is_paper_original?: boolean
          operator_id: string
          paper_scan_name?: string | null
          paper_scan_path?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          recorded_by_name?: string | null
          return_completed_at?: string | null
          return_requested_at?: string | null
          return_requested_by?: string | null
          return_requested_by_name?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["osas_status"]
          terms_version?: string
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          assignment_date?: string
          bestpass_fee_cents?: number | null
          bestpass_included?: boolean
          cdl_expiration?: string | null
          cdl_number?: string | null
          cdl_state?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          driver_ip?: string | null
          driver_signature_data_url?: string | null
          driver_signature_name?: string | null
          id?: string
          is_paper_original?: boolean
          operator_id?: string
          paper_scan_name?: string | null
          paper_scan_path?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          recorded_by_name?: string | null
          return_completed_at?: string | null
          return_requested_at?: string | null
          return_requested_by?: string | null
          return_requested_by_name?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["osas_status"]
          terms_version?: string
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboard_assignment_sheets_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_status: {
        Row: {
          bestpass_assignment_state: Database["public"]["Enums"]["equipment_assignment_state"]
          bestpass_awaiting_return_shipment: boolean
          bestpass_delivery_method: string | null
          bestpass_number: string | null
          bestpass_shipped_to_driver: boolean
          bestpass_verified_at: string | null
          bestpass_verified_by: string | null
          bg_check_notes: string | null
          ch_received_date: string | null
          ch_requested_date: string | null
          ch_status: Database["public"]["Enums"]["mvr_status"]
          cost_form_2290: number | null
          cost_mo_registration: number | null
          cost_notes: string | null
          cost_other: number | null
          cost_other_description: string | null
          dash_cam_assignment_state: Database["public"]["Enums"]["equipment_assignment_state"]
          dash_cam_awaiting_return_shipment: boolean
          dash_cam_delivery_method: string | null
          dash_cam_number: string | null
          dash_cam_shipped_to_driver: boolean
          dash_cam_verified_at: string | null
          dash_cam_verified_by: string | null
          decal_applied: Database["public"]["Enums"]["yes_no"]
          decal_assignment_state: Database["public"]["Enums"]["equipment_assignment_state"]
          decal_awaiting_return_shipment: boolean
          decal_delivery_method: string | null
          decal_method: Database["public"]["Enums"]["install_method"] | null
          decal_photo_ds_url: string | null
          decal_photo_ps_url: string | null
          decal_photos: Json
          decal_shipped_to_driver: boolean
          dispatch_ready_consortium: boolean
          dispatch_ready_first_assigned: boolean
          dispatch_ready_orientation: boolean
          doc_notes: string | null
          eld_assignment_state: Database["public"]["Enums"]["equipment_assignment_state"]
          eld_awaiting_return_shipment: boolean
          eld_delivery_method: string | null
          eld_exempt: boolean
          eld_exempt_reason: string | null
          eld_installed: Database["public"]["Enums"]["yes_no"]
          eld_method: Database["public"]["Enums"]["install_method"] | null
          eld_serial_number: string | null
          eld_shipped_to_driver: boolean
          eld_signature_image_url: string | null
          eld_signature_signed_at: string | null
          eld_signature_typed_name: string | null
          eld_verified_at: string | null
          eld_verified_by: string | null
          equipment_asset_sheet_ready_notified_at: string | null
          equipment_return_completed_at: string | null
          equipment_return_date: string | null
          equipment_return_notes: string | null
          exception_approved_at: string | null
          exception_approved_by: string | null
          exception_notes: string | null
          form_2290: Database["public"]["Enums"]["document_status"]
          form_2290_owner_provided: boolean
          fuel_card_assignment_state: Database["public"]["Enums"]["equipment_assignment_state"]
          fuel_card_awaiting_return_shipment: boolean
          fuel_card_delivery_method: string | null
          fuel_card_issued: Database["public"]["Enums"]["yes_no"]
          fuel_card_number: string | null
          fuel_card_shipped_to_driver: boolean
          fuel_card_verified_at: string | null
          fuel_card_verified_by: string | null
          fully_onboarded: boolean | null
          go_live_date: string | null
          ica_notes: string | null
          ica_sent_date: string | null
          ica_signed_date: string | null
          ica_status: Database["public"]["Enums"]["ica_status"]
          id: string
          ifta_decal_issued: string
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
          return_instructions_sent_at: string | null
          return_instructions_sent_by: string | null
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
          bestpass_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          bestpass_awaiting_return_shipment?: boolean
          bestpass_delivery_method?: string | null
          bestpass_number?: string | null
          bestpass_shipped_to_driver?: boolean
          bestpass_verified_at?: string | null
          bestpass_verified_by?: string | null
          bg_check_notes?: string | null
          ch_received_date?: string | null
          ch_requested_date?: string | null
          ch_status?: Database["public"]["Enums"]["mvr_status"]
          cost_form_2290?: number | null
          cost_mo_registration?: number | null
          cost_notes?: string | null
          cost_other?: number | null
          cost_other_description?: string | null
          dash_cam_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          dash_cam_awaiting_return_shipment?: boolean
          dash_cam_delivery_method?: string | null
          dash_cam_number?: string | null
          dash_cam_shipped_to_driver?: boolean
          dash_cam_verified_at?: string | null
          dash_cam_verified_by?: string | null
          decal_applied?: Database["public"]["Enums"]["yes_no"]
          decal_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          decal_awaiting_return_shipment?: boolean
          decal_delivery_method?: string | null
          decal_method?: Database["public"]["Enums"]["install_method"] | null
          decal_photo_ds_url?: string | null
          decal_photo_ps_url?: string | null
          decal_photos?: Json
          decal_shipped_to_driver?: boolean
          dispatch_ready_consortium?: boolean
          dispatch_ready_first_assigned?: boolean
          dispatch_ready_orientation?: boolean
          doc_notes?: string | null
          eld_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          eld_awaiting_return_shipment?: boolean
          eld_delivery_method?: string | null
          eld_exempt?: boolean
          eld_exempt_reason?: string | null
          eld_installed?: Database["public"]["Enums"]["yes_no"]
          eld_method?: Database["public"]["Enums"]["install_method"] | null
          eld_serial_number?: string | null
          eld_shipped_to_driver?: boolean
          eld_signature_image_url?: string | null
          eld_signature_signed_at?: string | null
          eld_signature_typed_name?: string | null
          eld_verified_at?: string | null
          eld_verified_by?: string | null
          equipment_asset_sheet_ready_notified_at?: string | null
          equipment_return_completed_at?: string | null
          equipment_return_date?: string | null
          equipment_return_notes?: string | null
          exception_approved_at?: string | null
          exception_approved_by?: string | null
          exception_notes?: string | null
          form_2290?: Database["public"]["Enums"]["document_status"]
          form_2290_owner_provided?: boolean
          fuel_card_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          fuel_card_awaiting_return_shipment?: boolean
          fuel_card_delivery_method?: string | null
          fuel_card_issued?: Database["public"]["Enums"]["yes_no"]
          fuel_card_number?: string | null
          fuel_card_shipped_to_driver?: boolean
          fuel_card_verified_at?: string | null
          fuel_card_verified_by?: string | null
          fully_onboarded?: boolean | null
          go_live_date?: string | null
          ica_notes?: string | null
          ica_sent_date?: string | null
          ica_signed_date?: string | null
          ica_status?: Database["public"]["Enums"]["ica_status"]
          id?: string
          ifta_decal_issued?: string
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
          return_instructions_sent_at?: string | null
          return_instructions_sent_by?: string | null
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
          bestpass_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          bestpass_awaiting_return_shipment?: boolean
          bestpass_delivery_method?: string | null
          bestpass_number?: string | null
          bestpass_shipped_to_driver?: boolean
          bestpass_verified_at?: string | null
          bestpass_verified_by?: string | null
          bg_check_notes?: string | null
          ch_received_date?: string | null
          ch_requested_date?: string | null
          ch_status?: Database["public"]["Enums"]["mvr_status"]
          cost_form_2290?: number | null
          cost_mo_registration?: number | null
          cost_notes?: string | null
          cost_other?: number | null
          cost_other_description?: string | null
          dash_cam_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          dash_cam_awaiting_return_shipment?: boolean
          dash_cam_delivery_method?: string | null
          dash_cam_number?: string | null
          dash_cam_shipped_to_driver?: boolean
          dash_cam_verified_at?: string | null
          dash_cam_verified_by?: string | null
          decal_applied?: Database["public"]["Enums"]["yes_no"]
          decal_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          decal_awaiting_return_shipment?: boolean
          decal_delivery_method?: string | null
          decal_method?: Database["public"]["Enums"]["install_method"] | null
          decal_photo_ds_url?: string | null
          decal_photo_ps_url?: string | null
          decal_photos?: Json
          decal_shipped_to_driver?: boolean
          dispatch_ready_consortium?: boolean
          dispatch_ready_first_assigned?: boolean
          dispatch_ready_orientation?: boolean
          doc_notes?: string | null
          eld_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          eld_awaiting_return_shipment?: boolean
          eld_delivery_method?: string | null
          eld_exempt?: boolean
          eld_exempt_reason?: string | null
          eld_installed?: Database["public"]["Enums"]["yes_no"]
          eld_method?: Database["public"]["Enums"]["install_method"] | null
          eld_serial_number?: string | null
          eld_shipped_to_driver?: boolean
          eld_signature_image_url?: string | null
          eld_signature_signed_at?: string | null
          eld_signature_typed_name?: string | null
          eld_verified_at?: string | null
          eld_verified_by?: string | null
          equipment_asset_sheet_ready_notified_at?: string | null
          equipment_return_completed_at?: string | null
          equipment_return_date?: string | null
          equipment_return_notes?: string | null
          exception_approved_at?: string | null
          exception_approved_by?: string | null
          exception_notes?: string | null
          form_2290?: Database["public"]["Enums"]["document_status"]
          form_2290_owner_provided?: boolean
          fuel_card_assignment_state?: Database["public"]["Enums"]["equipment_assignment_state"]
          fuel_card_awaiting_return_shipment?: boolean
          fuel_card_delivery_method?: string | null
          fuel_card_issued?: Database["public"]["Enums"]["yes_no"]
          fuel_card_number?: string | null
          fuel_card_shipped_to_driver?: boolean
          fuel_card_verified_at?: string | null
          fuel_card_verified_by?: string | null
          fully_onboarded?: boolean | null
          go_live_date?: string | null
          ica_notes?: string | null
          ica_sent_date?: string | null
          ica_signed_date?: string | null
          ica_status?: Database["public"]["Enums"]["ica_status"]
          id?: string
          ifta_decal_issued?: string
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
          return_instructions_sent_at?: string | null
          return_instructions_sent_by?: string | null
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
      operator_broadcast_recipients: {
        Row: {
          acknowledged_at: string | null
          broadcast_id: string
          created_at: string
          email: string
          error: string | null
          id: string
          opened_at: string | null
          operator_id: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          track_token: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          broadcast_id: string
          created_at?: string
          email: string
          error?: string | null
          id?: string
          opened_at?: string | null
          operator_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status: string
          track_token?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          broadcast_id?: string
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          opened_at?: string | null
          operator_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          track_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "operator_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_broadcast_recipients_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_broadcasts: {
        Row: {
          body: string
          completed_at: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          delivered_count: number
          failed_count: number
          id: string
          recipient_count: number
          recipient_scope: string
          requires_acknowledgment: boolean
          scheduled_at: string | null
          selected_operator_ids: Json | null
          sent_by: string | null
          skipped_count: number
          status: string
          subject: string
        }
        Insert: {
          body: string
          completed_at?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          delivered_count?: number
          failed_count?: number
          id?: string
          recipient_count?: number
          recipient_scope: string
          requires_acknowledgment?: boolean
          scheduled_at?: string | null
          selected_operator_ids?: Json | null
          sent_by?: string | null
          skipped_count?: number
          status?: string
          subject: string
        }
        Update: {
          body?: string
          completed_at?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          delivered_count?: number
          failed_count?: number
          id?: string
          recipient_count?: number
          recipient_scope?: string
          requires_acknowledgment?: boolean
          scheduled_at?: string | null
          selected_operator_ids?: Json | null
          sent_by?: string | null
          skipped_count?: number
          status?: string
          subject?: string
        }
        Relationships: []
      }
      operator_documents: {
        Row: {
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          document_type: Database["public"]["Enums"]["operator_doc_type"]
          file_name: string | null
          file_url: string | null
          id: string
          operator_id: string
          uploaded_at: string
        }
        Insert: {
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_type?: Database["public"]["Enums"]["operator_doc_type"]
          file_name?: string | null
          file_url?: string | null
          id?: string
          operator_id: string
          uploaded_at?: string
        }
        Update: {
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
      operator_offboarding_steps: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          metadata: Json | null
          operator_id: string
          skipped: boolean
          skipped_reason: string | null
          step_key: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          operator_id: string
          skipped?: boolean
          skipped_reason?: string | null
          step_key: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          operator_id?: string
          skipped?: boolean
          skipped_reason?: string | null
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_offboarding_steps_operator_id_fkey"
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
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          demo_label: string | null
          demo_owner_user_id: string | null
          demo_reset_at: string | null
          demo_scenario: string | null
          excluded_from_dispatch: boolean
          excluded_from_dispatch_at: string | null
          excluded_from_dispatch_by: string | null
          excluded_from_dispatch_reason: string | null
          home_terminal_timezone: string
          id: string
          is_active: boolean
          is_demo: boolean
          last_web_seen_at: string | null
          notes: string | null
          on_hold: boolean
          on_hold_date: string | null
          on_hold_reason: string | null
          pay_percentage: number
          pwa_installed_at: string | null
          safety_advisor_notified_at: string | null
          unit_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anticipated_start_date?: string | null
          application_id?: string | null
          assigned_onboarding_staff?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          demo_label?: string | null
          demo_owner_user_id?: string | null
          demo_reset_at?: string | null
          demo_scenario?: string | null
          excluded_from_dispatch?: boolean
          excluded_from_dispatch_at?: string | null
          excluded_from_dispatch_by?: string | null
          excluded_from_dispatch_reason?: string | null
          home_terminal_timezone?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_web_seen_at?: string | null
          notes?: string | null
          on_hold?: boolean
          on_hold_date?: string | null
          on_hold_reason?: string | null
          pay_percentage?: number
          pwa_installed_at?: string | null
          safety_advisor_notified_at?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anticipated_start_date?: string | null
          application_id?: string | null
          assigned_onboarding_staff?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          demo_label?: string | null
          demo_owner_user_id?: string | null
          demo_reset_at?: string | null
          demo_scenario?: string | null
          excluded_from_dispatch?: boolean
          excluded_from_dispatch_at?: string | null
          excluded_from_dispatch_by?: string | null
          excluded_from_dispatch_reason?: string | null
          home_terminal_timezone?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_web_seen_at?: string | null
          notes?: string | null
          on_hold?: boolean
          on_hold_date?: string | null
          on_hold_reason?: string | null
          pay_percentage?: number
          pwa_installed_at?: string | null
          safety_advisor_notified_at?: string | null
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
      parser_diagnostics: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string | null
          document_label: string | null
          failure: string | null
          field: string | null
          headings: string[]
          id: string
          kind: string
          label: string | null
          load_id: string | null
          load_number: string | null
          occurrences: number
          ordering: Json | null
          parser_contract: number | null
          reference_class: string | null
          resolved_at: string | null
          resolved_by: string | null
          stop_number: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          document_label?: string | null
          failure?: string | null
          field?: string | null
          headings?: string[]
          id?: string
          kind: string
          label?: string | null
          load_id?: string | null
          load_number?: string | null
          occurrences?: number
          ordering?: Json | null
          parser_contract?: number | null
          reference_class?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stop_number?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          document_label?: string | null
          failure?: string | null
          field?: string | null
          headings?: string[]
          id?: string
          kind?: string
          label?: string | null
          load_id?: string | null
          load_number?: string | null
          occurrences?: number
          ordering?: Json | null
          parser_contract?: number | null
          reference_class?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stop_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parser_diagnostics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parser_diagnostics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "load_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parser_diagnostics_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parser_diagnostics_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passenger_authorizations: {
        Row: {
          carrier_signature_url: string | null
          carrier_title: string | null
          carrier_typed_name: string | null
          contractor_read_acknowledged_at: string | null
          contractor_signature_url: string | null
          contractor_signed_at: string | null
          contractor_typed_name: string | null
          created_at: string
          destination_city_state: string | null
          driver_email: string
          driver_name: string
          effective_date: string | null
          executed_at: string | null
          executed_pdf_url: string | null
          expires_at: string | null
          filed_operator_document_id: string | null
          id: string
          opened_at: string | null
          operator_id: string | null
          origin_city_state: string | null
          parent_initials: string | null
          parent_signature_url: string | null
          parent_typed_name: string | null
          passenger_age: number | null
          passenger_dob: string | null
          passenger_initials: string | null
          passenger_name: string | null
          passenger_relationship: string | null
          passenger_signature_url: string | null
          passenger_signature_waived: boolean
          passenger_typed_name: string | null
          passenger_waiver_reason: string | null
          response_token: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          sent_at: string
          sent_by: string | null
          status: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          carrier_signature_url?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          contractor_read_acknowledged_at?: string | null
          contractor_signature_url?: string | null
          contractor_signed_at?: string | null
          contractor_typed_name?: string | null
          created_at?: string
          destination_city_state?: string | null
          driver_email: string
          driver_name: string
          effective_date?: string | null
          executed_at?: string | null
          executed_pdf_url?: string | null
          expires_at?: string | null
          filed_operator_document_id?: string | null
          id?: string
          opened_at?: string | null
          operator_id?: string | null
          origin_city_state?: string | null
          parent_initials?: string | null
          parent_signature_url?: string | null
          parent_typed_name?: string | null
          passenger_age?: number | null
          passenger_dob?: string | null
          passenger_initials?: string | null
          passenger_name?: string | null
          passenger_relationship?: string | null
          passenger_signature_url?: string | null
          passenger_signature_waived?: boolean
          passenger_typed_name?: string | null
          passenger_waiver_reason?: string | null
          response_token?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          carrier_signature_url?: string | null
          carrier_title?: string | null
          carrier_typed_name?: string | null
          contractor_read_acknowledged_at?: string | null
          contractor_signature_url?: string | null
          contractor_signed_at?: string | null
          contractor_typed_name?: string | null
          created_at?: string
          destination_city_state?: string | null
          driver_email?: string
          driver_name?: string
          effective_date?: string | null
          executed_at?: string | null
          executed_pdf_url?: string | null
          expires_at?: string | null
          filed_operator_document_id?: string | null
          id?: string
          opened_at?: string | null
          operator_id?: string | null
          origin_city_state?: string | null
          parent_initials?: string | null
          parent_signature_url?: string | null
          parent_typed_name?: string | null
          passenger_age?: number | null
          passenger_dob?: string | null
          passenger_initials?: string | null
          passenger_name?: string | null
          passenger_relationship?: string | null
          passenger_signature_url?: string | null
          passenger_signature_waived?: boolean
          passenger_typed_name?: string | null
          passenger_waiver_reason?: string | null
          response_token?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "passenger_authorizations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_policies: {
        Row: {
          charge_pay_classes: Json
          created_at: string
          created_by: string | null
          description: string | null
          detention_pct: number
          effective_date: string
          fsc_pct: number
          id: string
          is_active: boolean
          is_company_default: boolean
          layover_pct: number
          linehaul_pct: number
          loadout_pct: number
          lumper_reimbursement_pct: number
          name: string
          other_accessorial_pct: number
          per_ton_pct: number
          stopoff_pct: number
          tonu_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          charge_pay_classes?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          detention_pct?: number
          effective_date?: string
          fsc_pct?: number
          id?: string
          is_active?: boolean
          is_company_default?: boolean
          layover_pct?: number
          linehaul_pct?: number
          loadout_pct?: number
          lumper_reimbursement_pct?: number
          name: string
          other_accessorial_pct?: number
          per_ton_pct?: number
          stopoff_pct?: number
          tonu_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          charge_pay_classes?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          detention_pct?: number
          effective_date?: string
          fsc_pct?: number
          id?: string
          is_active?: boolean
          is_company_default?: boolean
          layover_pct?: number
          linehaul_pct?: number
          loadout_pct?: number
          lumper_reimbursement_pct?: number
          name?: string
          other_accessorial_pct?: number
          per_ton_pct?: number
          stopoff_pct?: number
          tonu_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pay_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_policy_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          effective_end_date: string | null
          effective_start_date: string
          id: string
          notes: string | null
          operator_id: string
          pay_policy_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_end_date?: string | null
          effective_start_date?: string
          id?: string
          notes?: string | null
          operator_id: string
          pay_policy_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_end_date?: string | null
          effective_start_date?: string
          id?: string
          notes?: string | null
          operator_id?: string
          pay_policy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_policy_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_policy_assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_policy_assignments_pay_policy_id_fkey"
            columns: ["pay_policy_id"]
            isOneToOne: false
            referencedRelation: "pay_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      pei_accidents: {
        Row: {
          accident_date: string | null
          created_at: string
          hazmat_spill: boolean | null
          id: string
          location_city_state: string | null
          number_of_fatalities: number | null
          number_of_injuries: number | null
          pei_response_id: string
        }
        Insert: {
          accident_date?: string | null
          created_at?: string
          hazmat_spill?: boolean | null
          id?: string
          location_city_state?: string | null
          number_of_fatalities?: number | null
          number_of_injuries?: number | null
          pei_response_id: string
        }
        Update: {
          accident_date?: string | null
          created_at?: string
          hazmat_spill?: boolean | null
          id?: string
          location_city_state?: string | null
          number_of_fatalities?: number | null
          number_of_injuries?: number | null
          pei_response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pei_accidents_pei_response_id_fkey"
            columns: ["pei_response_id"]
            isOneToOne: false
            referencedRelation: "pei_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      pei_request_events: {
        Row: {
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          occurred_at: string
          pei_request_id: string
          user_agent: string | null
        }
        Insert: {
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          pei_request_id: string
          user_agent?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          pei_request_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pei_request_events_pei_request_id_fkey"
            columns: ["pei_request_id"]
            isOneToOne: false
            referencedRelation: "pei_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pei_requests: {
        Row: {
          application_id: string
          auto_paused_reason: string | null
          auto_send_count: number
          created_at: string
          date_final_notice_sent: string | null
          date_follow_up_sent: string | null
          date_gfe_created: string | null
          date_response_received: string | null
          date_sent: string | null
          deadline_date: string | null
          employer_address: string | null
          employer_city: string | null
          employer_contact_email: string | null
          employer_contact_name: string | null
          employer_country: string | null
          employer_name: string
          employer_phone: string | null
          employer_postal_code: string | null
          employer_state: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          gfe_document_url: string | null
          gfe_other_reason: string | null
          gfe_reason: Database["public"]["Enums"]["pei_gfe_reason"] | null
          gfe_signed_by_name: string | null
          gfe_signed_by_staff_id: string | null
          id: string
          is_dot_regulated: boolean
          last_auto_send_at: string | null
          last_email_message_id: string | null
          manual_send_logged_by: string | null
          response_document_url: string | null
          response_token: string
          response_token_used: boolean
          send_method: string | null
          sent_by_staff_id: string | null
          staff_notes: Json
          status: Database["public"]["Enums"]["pei_request_status"]
          updated_at: string
        }
        Insert: {
          application_id: string
          auto_paused_reason?: string | null
          auto_send_count?: number
          created_at?: string
          date_final_notice_sent?: string | null
          date_follow_up_sent?: string | null
          date_gfe_created?: string | null
          date_response_received?: string | null
          date_sent?: string | null
          deadline_date?: string | null
          employer_address?: string | null
          employer_city?: string | null
          employer_contact_email?: string | null
          employer_contact_name?: string | null
          employer_country?: string | null
          employer_name: string
          employer_phone?: string | null
          employer_postal_code?: string | null
          employer_state?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          gfe_document_url?: string | null
          gfe_other_reason?: string | null
          gfe_reason?: Database["public"]["Enums"]["pei_gfe_reason"] | null
          gfe_signed_by_name?: string | null
          gfe_signed_by_staff_id?: string | null
          id?: string
          is_dot_regulated?: boolean
          last_auto_send_at?: string | null
          last_email_message_id?: string | null
          manual_send_logged_by?: string | null
          response_document_url?: string | null
          response_token?: string
          response_token_used?: boolean
          send_method?: string | null
          sent_by_staff_id?: string | null
          staff_notes?: Json
          status?: Database["public"]["Enums"]["pei_request_status"]
          updated_at?: string
        }
        Update: {
          application_id?: string
          auto_paused_reason?: string | null
          auto_send_count?: number
          created_at?: string
          date_final_notice_sent?: string | null
          date_follow_up_sent?: string | null
          date_gfe_created?: string | null
          date_response_received?: string | null
          date_sent?: string | null
          deadline_date?: string | null
          employer_address?: string | null
          employer_city?: string | null
          employer_contact_email?: string | null
          employer_contact_name?: string | null
          employer_country?: string | null
          employer_name?: string
          employer_phone?: string | null
          employer_postal_code?: string | null
          employer_state?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          gfe_document_url?: string | null
          gfe_other_reason?: string | null
          gfe_reason?: Database["public"]["Enums"]["pei_gfe_reason"] | null
          gfe_signed_by_name?: string | null
          gfe_signed_by_staff_id?: string | null
          id?: string
          is_dot_regulated?: boolean
          last_auto_send_at?: string | null
          last_email_message_id?: string | null
          manual_send_logged_by?: string | null
          response_document_url?: string | null
          response_token?: string
          response_token_used?: boolean
          send_method?: string | null
          sent_by_staff_id?: string | null
          staff_notes?: Json
          status?: Database["public"]["Enums"]["pei_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pei_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      pei_responses: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          created_at: string
          date_signed: string | null
          dates_accurate: boolean | null
          drug_alcohol_notes: string | null
          drug_alcohol_violation: boolean | null
          equipment_bus: boolean | null
          equipment_straight_truck: boolean | null
          equipment_tractor_semi: boolean | null
          failed_rehab: boolean | null
          had_accidents: boolean | null
          id: string
          pei_request_id: string
          post_rehab_violations: boolean | null
          rating_attitude:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_cooperation:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_driving_skills:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_personal_habits:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_quality_of_work:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_safety_habits:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          reason_detail: string | null
          reason_for_leaving:
            | Database["public"]["Enums"]["pei_leaving_reason"]
            | null
          responder_city: string | null
          responder_company: string | null
          responder_email: string | null
          responder_name: string
          responder_phone: string | null
          responder_postal_code: string | null
          responder_signature_data: string | null
          responder_state: string | null
          responder_title: string | null
          safe_and_efficient: boolean | null
          signed_at: string | null
          signed_ip: unknown
          signed_user_agent: string | null
          submission_method: string | null
          trailer_cargo_tank: boolean | null
          trailer_doubles: boolean | null
          trailer_flatbed: boolean | null
          trailer_na: boolean | null
          trailer_reefer: boolean | null
          trailer_triples: boolean | null
          trailer_van: boolean | null
          was_employed: boolean | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          date_signed?: string | null
          dates_accurate?: boolean | null
          drug_alcohol_notes?: string | null
          drug_alcohol_violation?: boolean | null
          equipment_bus?: boolean | null
          equipment_straight_truck?: boolean | null
          equipment_tractor_semi?: boolean | null
          failed_rehab?: boolean | null
          had_accidents?: boolean | null
          id?: string
          pei_request_id: string
          post_rehab_violations?: boolean | null
          rating_attitude?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_cooperation?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_driving_skills?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_personal_habits?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_quality_of_work?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_safety_habits?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          reason_detail?: string | null
          reason_for_leaving?:
            | Database["public"]["Enums"]["pei_leaving_reason"]
            | null
          responder_city?: string | null
          responder_company?: string | null
          responder_email?: string | null
          responder_name: string
          responder_phone?: string | null
          responder_postal_code?: string | null
          responder_signature_data?: string | null
          responder_state?: string | null
          responder_title?: string | null
          safe_and_efficient?: boolean | null
          signed_at?: string | null
          signed_ip?: unknown
          signed_user_agent?: string | null
          submission_method?: string | null
          trailer_cargo_tank?: boolean | null
          trailer_doubles?: boolean | null
          trailer_flatbed?: boolean | null
          trailer_na?: boolean | null
          trailer_reefer?: boolean | null
          trailer_triples?: boolean | null
          trailer_van?: boolean | null
          was_employed?: boolean | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          date_signed?: string | null
          dates_accurate?: boolean | null
          drug_alcohol_notes?: string | null
          drug_alcohol_violation?: boolean | null
          equipment_bus?: boolean | null
          equipment_straight_truck?: boolean | null
          equipment_tractor_semi?: boolean | null
          failed_rehab?: boolean | null
          had_accidents?: boolean | null
          id?: string
          pei_request_id?: string
          post_rehab_violations?: boolean | null
          rating_attitude?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_cooperation?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_driving_skills?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_personal_habits?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_quality_of_work?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          rating_safety_habits?:
            | Database["public"]["Enums"]["pei_performance_rating"]
            | null
          reason_detail?: string | null
          reason_for_leaving?:
            | Database["public"]["Enums"]["pei_leaving_reason"]
            | null
          responder_city?: string | null
          responder_company?: string | null
          responder_email?: string | null
          responder_name?: string
          responder_phone?: string | null
          responder_postal_code?: string | null
          responder_signature_data?: string | null
          responder_state?: string | null
          responder_title?: string | null
          safe_and_efficient?: boolean | null
          signed_at?: string | null
          signed_ip?: unknown
          signed_user_agent?: string | null
          submission_method?: string | null
          trailer_cargo_tank?: boolean | null
          trailer_doubles?: boolean | null
          trailer_flatbed?: boolean | null
          trailer_na?: boolean | null
          trailer_reefer?: boolean | null
          trailer_triples?: boolean | null
          trailer_van?: boolean | null
          was_employed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pei_responses_pei_request_id_fkey"
            columns: ["pei_request_id"]
            isOneToOne: true
            referencedRelation: "pei_requests"
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
      preview_sessions: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          revoked_at: string | null
          target_user_id: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          target_user_id: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          target_user_id?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          avatar_url: string | null
          birth_day: number | null
          birth_month: number | null
          created_at: string
          first_name: string | null
          home_country: string
          home_state: string | null
          id: string
          invited_by: string | null
          is_demo: boolean
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          birth_day?: number | null
          birth_month?: number | null
          created_at?: string
          first_name?: string | null
          home_country?: string
          home_state?: string | null
          id?: string
          invited_by?: string | null
          is_demo?: boolean
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          birth_day?: number | null
          birth_month?: number | null
          created_at?: string
          first_name?: string | null
          home_country?: string
          home_state?: string | null
          id?: string
          invited_by?: string | null
          is_demo?: boolean
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_con_ingest_queue: {
        Row: {
          attachment_bytes: number | null
          attachment_filename: string | null
          attachment_mime_type: string | null
          attachment_page_count: number | null
          attachment_sha256: string | null
          attachment_storage_path: string | null
          broker_load_number: string | null
          converted_load_id: string | null
          created_at: string
          created_by: string | null
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          from_address: string | null
          id: string
          matched_load_id: string | null
          parse_build: Json | null
          parse_error: string | null
          parse_status: string | null
          parsed: Json | null
          received_at: string
          resend_email_id: string | null
          sender_allowed: boolean
          status: Database["public"]["Enums"]["rate_con_ingest_status"]
          subject: string | null
          text_layer: string | null
          text_layer_available: boolean | null
          to_address: string | null
          updated_at: string
          updated_by: string | null
          verbatim_checks: Json | null
        }
        Insert: {
          attachment_bytes?: number | null
          attachment_filename?: string | null
          attachment_mime_type?: string | null
          attachment_page_count?: number | null
          attachment_sha256?: string | null
          attachment_storage_path?: string | null
          broker_load_number?: string | null
          converted_load_id?: string | null
          created_at?: string
          created_by?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          from_address?: string | null
          id?: string
          matched_load_id?: string | null
          parse_build?: Json | null
          parse_error?: string | null
          parse_status?: string | null
          parsed?: Json | null
          received_at?: string
          resend_email_id?: string | null
          sender_allowed?: boolean
          status?: Database["public"]["Enums"]["rate_con_ingest_status"]
          subject?: string | null
          text_layer?: string | null
          text_layer_available?: boolean | null
          to_address?: string | null
          updated_at?: string
          updated_by?: string | null
          verbatim_checks?: Json | null
        }
        Update: {
          attachment_bytes?: number | null
          attachment_filename?: string | null
          attachment_mime_type?: string | null
          attachment_page_count?: number | null
          attachment_sha256?: string | null
          attachment_storage_path?: string | null
          broker_load_number?: string | null
          converted_load_id?: string | null
          created_at?: string
          created_by?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          from_address?: string | null
          id?: string
          matched_load_id?: string | null
          parse_build?: Json | null
          parse_error?: string | null
          parse_status?: string | null
          parsed?: Json | null
          received_at?: string
          resend_email_id?: string | null
          sender_allowed?: boolean
          status?: Database["public"]["Enums"]["rate_con_ingest_status"]
          subject?: string | null
          text_layer?: string | null
          text_layer_available?: boolean | null
          to_address?: string | null
          updated_at?: string
          updated_by?: string | null
          verbatim_checks?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_con_ingest_queue_converted_load_id_fkey"
            columns: ["converted_load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_con_ingest_queue_matched_load_id_fkey"
            columns: ["matched_load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      release_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          flagged_faq_ids: string[]
          id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          flagged_faq_ids?: string[]
          id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          flagged_faq_ids?: string[]
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
      revert_courtesy_email_defaults: {
        Row: {
          role: Database["public"]["Enums"]["app_role"]
          send_by_default: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          role: Database["public"]["Enums"]["app_role"]
          send_by_default?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          role?: Database["public"]["Enums"]["app_role"]
          send_by_default?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rods_amendments: {
        Row: {
          created_at: string
          created_by: string | null
          field_path: string
          id: string
          log_date: string
          new_value: string | null
          old_value: string | null
          operator_id: string
          original_day_id: string | null
          reason: string
          rods_day_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_path: string
          id?: string
          log_date: string
          new_value?: string | null
          old_value?: string | null
          operator_id: string
          original_day_id?: string | null
          reason: string
          rods_day_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_path?: string
          id?: string
          log_date?: string
          new_value?: string | null
          old_value?: string | null
          operator_id?: string
          original_day_id?: string | null
          reason?: string
          rods_day_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rods_amendments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rods_amendments_original_day_id_fkey"
            columns: ["original_day_id"]
            isOneToOne: false
            referencedRelation: "rods_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rods_amendments_rods_day_id_fkey"
            columns: ["rods_day_id"]
            isOneToOne: false
            referencedRelation: "rods_days"
            referencedColumns: ["id"]
          },
        ]
      }
      rods_correction_requests: {
        Row: {
          created_at: string
          driver_response: string | null
          id: string
          is_demo: boolean
          issue: string
          log_date: string
          operator_id: string
          requested_at: string
          requested_by: string | null
          requested_by_name: string | null
          resolved_at: string | null
          resolved_by_day_id: string | null
          rods_day_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_response?: string | null
          id?: string
          is_demo?: boolean
          issue: string
          log_date: string
          operator_id: string
          requested_at?: string
          requested_by?: string | null
          requested_by_name?: string | null
          resolved_at?: string | null
          resolved_by_day_id?: string | null
          rods_day_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_response?: string | null
          id?: string
          is_demo?: boolean
          issue?: string
          log_date?: string
          operator_id?: string
          requested_at?: string
          requested_by?: string | null
          requested_by_name?: string | null
          resolved_at?: string | null
          resolved_by_day_id?: string | null
          rods_day_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rods_correction_requests_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rods_correction_requests_resolved_by_day_id_fkey"
            columns: ["resolved_by_day_id"]
            isOneToOne: false
            referencedRelation: "rods_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rods_correction_requests_rods_day_id_fkey"
            columns: ["rods_day_id"]
            isOneToOne: false
            referencedRelation: "rods_days"
            referencedColumns: ["id"]
          },
        ]
      }
      rods_days: {
        Row: {
          amendment_reason: string | null
          bol_photo_path: string | null
          carrier_mc: string | null
          carrier_name: string | null
          carrier_usdot: string | null
          certification_device_info: string | null
          certification_legal_name: string | null
          certification_signature_path: string | null
          certification_signature_validation: Json | null
          certification_token: string | null
          certified_at: string | null
          certified_by: string | null
          co_driver_name: string | null
          created_at: string
          display_conversion_failed: boolean
          display_document_path: string | null
          from_location: string | null
          home_terminal_address: string | null
          home_terminal_timezone: string | null
          id: string
          is_demo: boolean
          is_reconstructed: boolean
          locked: boolean
          log_date: string
          main_office_address: string | null
          operator_id: string
          pdf_path: string | null
          period_start_time: string
          recap_available_tomorrow: string | null
          recap_last_7_days: string | null
          recap_last_8_days: string | null
          recap_on_duty_today: string | null
          record_source: string
          shipping_document_no: string | null
          source_document_path: string | null
          status: string
          supersedes_day_id: string | null
          to_location: string | null
          total_driving_minutes: number
          total_mileage_today: number | null
          total_miles_driving_today: number | null
          total_off_duty_minutes: number
          total_on_duty_minutes: number
          total_sleeper_minutes: number
          trailer_numbers: string | null
          truck_number: string | null
          updated_at: string
        }
        Insert: {
          amendment_reason?: string | null
          bol_photo_path?: string | null
          carrier_mc?: string | null
          carrier_name?: string | null
          carrier_usdot?: string | null
          certification_device_info?: string | null
          certification_legal_name?: string | null
          certification_signature_path?: string | null
          certification_signature_validation?: Json | null
          certification_token?: string | null
          certified_at?: string | null
          certified_by?: string | null
          co_driver_name?: string | null
          created_at?: string
          display_conversion_failed?: boolean
          display_document_path?: string | null
          from_location?: string | null
          home_terminal_address?: string | null
          home_terminal_timezone?: string | null
          id?: string
          is_demo?: boolean
          is_reconstructed?: boolean
          locked?: boolean
          log_date: string
          main_office_address?: string | null
          operator_id: string
          pdf_path?: string | null
          period_start_time?: string
          recap_available_tomorrow?: string | null
          recap_last_7_days?: string | null
          recap_last_8_days?: string | null
          recap_on_duty_today?: string | null
          record_source?: string
          shipping_document_no?: string | null
          source_document_path?: string | null
          status?: string
          supersedes_day_id?: string | null
          to_location?: string | null
          total_driving_minutes?: number
          total_mileage_today?: number | null
          total_miles_driving_today?: number | null
          total_off_duty_minutes?: number
          total_on_duty_minutes?: number
          total_sleeper_minutes?: number
          trailer_numbers?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Update: {
          amendment_reason?: string | null
          bol_photo_path?: string | null
          carrier_mc?: string | null
          carrier_name?: string | null
          carrier_usdot?: string | null
          certification_device_info?: string | null
          certification_legal_name?: string | null
          certification_signature_path?: string | null
          certification_signature_validation?: Json | null
          certification_token?: string | null
          certified_at?: string | null
          certified_by?: string | null
          co_driver_name?: string | null
          created_at?: string
          display_conversion_failed?: boolean
          display_document_path?: string | null
          from_location?: string | null
          home_terminal_address?: string | null
          home_terminal_timezone?: string | null
          id?: string
          is_demo?: boolean
          is_reconstructed?: boolean
          locked?: boolean
          log_date?: string
          main_office_address?: string | null
          operator_id?: string
          pdf_path?: string | null
          period_start_time?: string
          recap_available_tomorrow?: string | null
          recap_last_7_days?: string | null
          recap_last_8_days?: string | null
          recap_on_duty_today?: string | null
          record_source?: string
          shipping_document_no?: string | null
          source_document_path?: string | null
          status?: string
          supersedes_day_id?: string | null
          to_location?: string | null
          total_driving_minutes?: number
          total_mileage_today?: number | null
          total_miles_driving_today?: number | null
          total_off_duty_minutes?: number
          total_on_duty_minutes?: number
          total_sleeper_minutes?: number
          trailer_numbers?: string | null
          truck_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rods_days_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rods_days_supersedes_day_id_fkey"
            columns: ["supersedes_day_id"]
            isOneToOne: false
            referencedRelation: "rods_days"
            referencedColumns: ["id"]
          },
        ]
      }
      rods_divergences: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledged_reason: string | null
          acknowledged_source: string | null
          created_at: string
          detected_at: string
          device_info: string | null
          differing_fields: string[]
          id: string
          idempotency_key: string
          is_demo: boolean
          local_row_id: string | null
          local_values: Json
          log_date: string
          operator_id: string
          server_row_id: string | null
          server_values: Json
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_reason?: string | null
          acknowledged_source?: string | null
          created_at?: string
          detected_at?: string
          device_info?: string | null
          differing_fields?: string[]
          id?: string
          idempotency_key: string
          is_demo?: boolean
          local_row_id?: string | null
          local_values?: Json
          log_date: string
          operator_id: string
          server_row_id?: string | null
          server_values?: Json
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_reason?: string | null
          acknowledged_source?: string | null
          created_at?: string
          detected_at?: string
          device_info?: string | null
          differing_fields?: string[]
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          local_row_id?: string | null
          local_values?: Json
          log_date?: string
          operator_id?: string
          server_row_id?: string | null
          server_values?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rods_divergences_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      rods_events: {
        Row: {
          city: string | null
          created_at: string
          duty_status: number | null
          end_minute: number | null
          id: string
          is_short_period: boolean | null
          remarks: string | null
          rods_day_id: string
          start_minute: number
          state: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          duty_status?: number | null
          end_minute?: number | null
          id?: string
          is_short_period?: boolean | null
          remarks?: string | null
          rods_day_id: string
          start_minute: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          duty_status?: number | null
          end_minute?: number | null
          id?: string
          is_short_period?: boolean | null
          remarks?: string | null
          rods_day_id?: string
          start_minute?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rods_events_rods_day_id_fkey"
            columns: ["rods_day_id"]
            isOneToOne: false
            referencedRelation: "rods_days"
            referencedColumns: ["id"]
          },
        ]
      }
      rods_unlock_events: {
        Row: {
          cancelled_entry_ids: Json
          cancelled_states: Json
          created_at: string
          device_info: string | null
          id: string
          idempotency_key: string
          local_certified_at: string | null
          log_date: string
          notification_error: string | null
          notification_state: string
          operator_id: string
          reason: string
          rods_day_id: string | null
          unlocked_at: string
        }
        Insert: {
          cancelled_entry_ids?: Json
          cancelled_states?: Json
          created_at?: string
          device_info?: string | null
          id?: string
          idempotency_key: string
          local_certified_at?: string | null
          log_date: string
          notification_error?: string | null
          notification_state?: string
          operator_id: string
          reason: string
          rods_day_id?: string | null
          unlocked_at?: string
        }
        Update: {
          cancelled_entry_ids?: Json
          cancelled_states?: Json
          created_at?: string
          device_info?: string | null
          id?: string
          idempotency_key?: string
          local_certified_at?: string | null
          log_date?: string
          notification_error?: string | null
          notification_state?: string
          operator_id?: string
          reason?: string
          rods_day_id?: string | null
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rods_unlock_events_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
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
          is_reference_only: boolean
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
          is_reference_only?: boolean
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
          is_reference_only?: boolean
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
      share_token_access_log: {
        Row: {
          accessed_at: string
          hash_version: string | null
          id: string
          ip_hash: string | null
          operator_id: string | null
          outcome: string
          resource_id: string | null
          scope: string | null
          token: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          hash_version?: string | null
          id?: string
          ip_hash?: string | null
          operator_id?: string | null
          outcome: string
          resource_id?: string | null
          scope?: string | null
          token?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          hash_version?: string | null
          id?: string
          ip_hash?: string | null
          operator_id?: string | null
          outcome?: string
          resource_id?: string | null
          scope?: string | null
          token?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_token_access_log_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          resource_id: string
          revoked_at: string | null
          scope: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          resource_id: string
          revoked_at?: string | null
          scope: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          resource_id?: string
          revoked_at?: string | null
          scope?: string
          token?: string
        }
        Relationships: []
      }
      staff_email_overrides: {
        Row: {
          category: string
          email_enabled: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          email_enabled: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          email_enabled?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_event_acknowledgments: {
        Row: {
          acknowledged_at: string
          event_date: string
          event_type: string
          id: string
          operator_id: string | null
          subject_user_id: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          event_date: string
          event_type: string
          id?: string
          operator_id?: string | null
          subject_user_id?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          event_date?: string
          event_type?: string
          id?: string
          operator_id?: string | null
          subject_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_event_acknowledgments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_help_knowledge: {
        Row: {
          content: string
          created_at: string
          embedding: string
          id: string
          metadata: Json
          route: string | null
          section: string | null
          source: string
          source_id: string
          title: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding: string
          id?: string
          metadata?: Json
          route?: string | null
          section?: string | null
          source: string
          source_id: string
          title: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          metadata?: Json
          route?: string | null
          section?: string | null
          source?: string
          source_id?: string
          title?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_help_messages: {
        Row: {
          content: string
          created_at: string
          follow_ups: string[]
          id: string
          role: string
          sources: Json
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          follow_ups?: string[]
          id?: string
          role: string
          sources?: Json
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          follow_ups?: string[]
          id?: string
          role?: string
          sources?: Json
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_help_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "staff_help_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_help_query_log: {
        Row: {
          answered_from: string
          created_at: string
          id: string
          matched_faq_ids: string[]
          matched_help_entry_ids: string[]
          query: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          answered_from: string
          created_at?: string
          id?: string
          matched_faq_ids?: string[]
          matched_help_entry_ids?: string[]
          query: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          answered_from?: string
          created_at?: string
          id?: string
          matched_faq_ids?: string[]
          matched_help_entry_ids?: string[]
          query?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_help_query_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "staff_help_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_help_threads: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_messaging_settings: {
        Row: {
          availability_mode: Database["public"]["Enums"]["staff_availability_mode"]
          availability_note: string | null
          staff_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          availability_mode?: Database["public"]["Enums"]["staff_availability_mode"]
          availability_note?: string | null
          staff_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          availability_mode?: Database["public"]["Enums"]["staff_availability_mode"]
          availability_note?: string | null
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_ui_preferences: {
        Row: {
          created_at: string
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          prefs?: Json
          updated_at?: string
          user_id?: string
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
      thread_participants: {
        Row: {
          id: string
          joined_at: string
          last_read_at: string | null
          role_in_thread: string
          thread_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role_in_thread?: string
          thread_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role_in_thread?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
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
      truck_owners: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          business_name: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          invite_accepted_at: string | null
          invited_at: string | null
          legal_first_name: string
          legal_last_name: string
          operator_id: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          invite_accepted_at?: string | null
          invited_at?: string | null
          legal_first_name: string
          legal_last_name: string
          operator_id: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          invite_accepted_at?: string | null
          invited_at?: string | null
          legal_first_name?: string
          legal_last_name?: string
          operator_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_owners_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: true
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_state_permits: {
        Row: {
          created_at: string
          document_id: string | null
          expires_at: string | null
          id: string
          operator_id: string
          permit_number: string | null
          registered: boolean
          state_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          expires_at?: string | null
          id?: string
          operator_id: string
          permit_number?: string | null
          registered?: boolean
          state_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          expires_at?: string | null
          id?: string
          operator_id?: string
          permit_number?: string | null
          registered?: boolean
          state_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_state_permits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "inspection_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_state_permits_operator_id_fkey"
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
      user_view_preferences: {
        Row: {
          created_at: string
          filters: Json | null
          id: string
          page_size: number | null
          sort_column: string | null
          sort_direction: string | null
          updated_at: string
          user_id: string
          view_key: string
          visible_columns: Json | null
        }
        Insert: {
          created_at?: string
          filters?: Json | null
          id?: string
          page_size?: number | null
          sort_column?: string | null
          sort_direction?: string | null
          updated_at?: string
          user_id: string
          view_key: string
          visible_columns?: Json | null
        }
        Update: {
          created_at?: string
          filters?: Json | null
          id?: string
          page_size?: number | null
          sort_column?: string | null
          sort_direction?: string | null
          updated_at?: string
          user_id?: string
          view_key?: string
          visible_columns?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      v_compliance_items: {
        Row: {
          days_until: number | null
          doc_key: string | null
          entity_kind: string | null
          expires_at: string | null
          expires_updated_at: string | null
          file_path: string | null
          inspection_doc_id: string | null
          operator_id: string | null
          operator_name: string | null
          uploaded_at: string | null
        }
        Relationships: []
      }
      v_operator_active_units: {
        Row: {
          added_on: string | null
          amendment_number: number | null
          operator_id: string | null
          source_id: string | null
          source_type: string | null
          trailer_number: string | null
          truck_make: string | null
          truck_model: string | null
          truck_plate: string | null
          truck_plate_state: string | null
          truck_vin: string | null
          truck_year: string | null
          unit_number: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _app_correction_editable_columns: { Args: never; Returns: string[] }
      _audit_actor_name: { Args: { _actor: string }; Returns: string }
      _gen_correction_token: { Args: never; Returns: string }
      _share_token_gate: {
        Args: { p_token: string }
        Returns: {
          outcome: string
          resource_id: string
          scope: string
        }[]
      }
      acknowledge_eld_sync_alert: {
        Args: { p_alert_id: string }
        Returns: undefined
      }
      acknowledge_rods_divergence: {
        Args: { p_divergence_id: string; p_reason: string }
        Returns: string
      }
      add_pei_staff_note: {
        Args: { _note: string; _request_id: string }
        Returns: Json
      }
      approve_application_correction: {
        Args: {
          p_meta: Json
          p_signature_url: string
          p_signed_name: string
          p_token: string
        }
        Returns: {
          application_id: string
          request_id: string
        }[]
      }
      archive_applicant_pei:
        | {
            Args: { _application_id: string; _reason: string }
            Returns: undefined
          }
        | {
            Args: {
              _application_id: string
              _archive_category: string
              _reason: string
            }
            Returns: undefined
          }
      assign_load_driver: {
        Args: {
          p_load_id: string
          p_operator_id: string
          p_override_reason?: string
        }
        Returns: Json
      }
      assign_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      can_driver_message_staff: {
        Args: { _driver: string; _staff: string }
        Returns: boolean
      }
      cancel_application_correction: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      canonical_equipment_serial: { Args: { _serial: string }; Returns: string }
      certify_rods_day:
        | {
            Args: {
              _day_id: string
              _device_info: string
              _legal_name: string
              _pdf_path: string
              _signature_path: string
              p_certification_token: string
              p_changes?: Json
            }
            Returns: Json
          }
        | {
            Args: {
              _day_id: string
              _device_info: string
              _legal_name: string
              _pdf_path: string
              _signature_path: string
              p_certification_token: string
              p_changes: Json
              p_signature_validation: Json
            }
            Returns: Json
          }
      check_application_email_taken: {
        Args: { p_email: string }
        Returns: boolean
      }
      check_driver_eligibility: {
        Args: { p_operator_id: string }
        Returns: Json
      }
      check_driver_eligibility_bulk: {
        Args: { p_operator_ids: string[] }
        Returns: Json
      }
      compliance_status: {
        Args: { days: number; window_days: number }
        Returns: string
      }
      consume_application_resume_token: {
        Args: { p_token: string }
        Returns: {
          application_id: string
          draft_token: string
        }[]
      }
      count_unused_resume_tokens: {
        Args: { _application_id: string }
        Returns: number
      }
      create_load_with_stops: {
        Args: { p_charges?: Json; p_load: Json; p_stops: Json }
        Returns: string
      }
      current_profile_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      discard_rods_amendment: { Args: { _day_id: string }; Returns: undefined }
      driver_load_pay_estimate: {
        Args: { _load_id: string }
        Returns: {
          amount: number
          incomplete: boolean
        }[]
      }
      eld_cron_status: {
        Args: never
        Returns: {
          active: boolean
          end_time: string
          jobid: number
          jobname: string
          return_message: string
          runid: number
          schedule: string
          start_time: string
          status: string
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      file_load_references: {
        Args: {
          p_document_id?: string
          p_document_label?: string
          p_load_id: string
          p_refs: Json
          p_removals?: Json
          p_source?: string
          p_summary?: string
        }
        Returns: undefined
      }
      generate_load_number: { Args: never; Returns: string }
      get_application_by_draft_token: {
        Args: { p_token: string }
        Returns: {
          address_city: string | null
          address_duration: string | null
          address_line2: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          approved_at: string | null
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
          current_step: number
          dl_front_url: string | null
          dl_rear_url: string | null
          dob: string | null
          document_retake_requests: Json
          dot_accidents: boolean | null
          dot_accidents_description: string | null
          dot_positive_test_past_2yr: boolean | null
          dot_return_to_duty_docs: boolean | null
          draft_token: string | null
          driver_rights_notice_acknowledged: boolean
          driver_rights_notice_date: string | null
          email: string
          employers: Json
          employment_gaps: boolean | null
          employment_gaps_explanation: string | null
          endorsements: string[] | null
          equipment_operated: string[] | null
          first_name: string | null
          id: string
          is_demo: boolean
          is_draft: boolean | null
          last_name: string | null
          medical_cert_expiration: string | null
          medical_cert_url: string | null
          moving_violations: boolean | null
          moving_violations_description: string | null
          mvr_status: Database["public"]["Enums"]["mvr_status"]
          pei_archive_category: string | null
          pei_archive_reason: string | null
          pei_archived_at: string | null
          pei_archived_by: string | null
          pei_archived_by_name: string | null
          pei_deadline: string | null
          pei_status: Database["public"]["Enums"]["pei_applicant_status"]
          phone: string | null
          pre_revision_status:
            | Database["public"]["Enums"]["review_status"]
            | null
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
          revision_count: number
          revision_request_message: string | null
          revision_requested_at: string | null
          revision_requested_by: string | null
          revisions_handled_by_staff_at: string | null
          revisions_handled_by_staff_id: string | null
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
      get_application_correction_by_token: {
        Args: { p_token: string }
        Returns: {
          applicant_first_name: string
          applicant_last_name: string
          application_id: string
          courtesy_message: string
          expires_at: string
          fields: Json
          reason_for_changes: string
          request_id: string
          requested_by_staff_name: string
          responded_at: string
          sent_at: string
          status: Database["public"]["Enums"]["application_correction_status"]
        }[]
      }
      get_application_pei_summary: {
        Args: { p_application_id: string }
        Returns: {
          date_sent: string
          days_remaining: number
          deadline_date: string
          employer_city: string
          employer_name: string
          employer_state: string
          employment_end_date: string
          employment_start_date: string
          gfe_reason: Database["public"]["Enums"]["pei_gfe_reason"]
          has_response: boolean
          is_dot_regulated: boolean
          request_id: string
          status: Database["public"]["Enums"]["pei_request_status"]
        }[]
      }
      get_eld_compliance_timeline: {
        Args: { _event_id: string }
        Returns: {
          artifact_id: string
          artifact_type: string
          detail: string
          label: string
          occurred_at: string
          seq: number
          stage: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      get_eld_escalation_ledger: {
        Args: { p_event_id: string }
        Returns: {
          channel: string
          created_at: string
          day_number: number
          event_id: string
          id: string
          is_override: boolean
          notification_type: string
          recipient_name: string
          recipient_user_id: string
          sent_on: string
        }[]
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
      get_ica_review_link: { Args: { _token: string }; Returns: Json }
      get_inspection_doc_by_token: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          file_url: string
          id: string
          name: string
        }[]
      }
      get_load_linked_messages: {
        Args: { p_load_id: string }
        Returns: {
          attachment_mime: string
          attachment_name: string
          attachment_size_bytes: number
          attachment_url: string
          body: string
          deleted_at: string
          edited_at: string
          id: string
          is_system: boolean
          load_id: string
          pinned_at: string
          pinned_by: string
          read_at: string
          recipient_id: string
          reply_to_id: string
          sender_id: string
          sender_name: string
          sent_at: string
          thread_id: string
        }[]
      }
      get_or_create_short_link: {
        Args: { _share_token: string }
        Returns: string
      }
      get_pei_queue: {
        Args: never
        Returns: {
          applicant_first_name: string
          applicant_last_name: string
          application_id: string
          date_gfe_created: string
          date_response_received: string
          date_sent: string
          days_remaining: number
          days_since_sent: number
          deadline_date: string
          employer_city: string
          employer_name: string
          employer_state: string
          gfe_reason: Database["public"]["Enums"]["pei_gfe_reason"]
          is_overdue: boolean
          pei_archive_category: string
          pei_archive_reason: string
          pei_archived_at: string
          pei_archived_by_name: string
          request_id: string
          send_method: string
          staff_notes: Json
          status: Database["public"]["Enums"]["pei_request_status"]
        }[]
      }
      get_pei_request_for_response: {
        Args: { p_token: string }
        Returns: {
          already_responded: boolean
          applicant_first_name: string
          applicant_last_name: string
          application_id: string
          deadline_date: string
          employer_city: string
          employer_name: string
          employer_state: string
          employment_end_date: string
          employment_start_date: string
          request_id: string
          status: Database["public"]["Enums"]["pei_request_status"]
        }[]
      }
      get_pei_requests_needing_action: {
        Args: never
        Returns: {
          action_needed: string
          applicant_first_name: string
          applicant_last_name: string
          application_id: string
          date_sent: string
          days_since_sent: number
          deadline_date: string
          employer_contact_email: string
          employer_name: string
          request_id: string
          status: Database["public"]["Enums"]["pei_request_status"]
        }[]
      }
      get_share_bundle_meta: {
        Args: { p_token: string }
        Returns: {
          doc_count: number
          driver_name: string
          unit_number: string
        }[]
      }
      get_staff_contact_info: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          first_name: string
          last_name: string
          primary_role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_thread_participants: {
        Args: { _thread_id: string }
        Returns: {
          avatar_url: string
          first_name: string
          last_name: string
          primary_role: string
          role_in_thread: string
          user_id: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      grant_parity_report: {
        Args: never
        Returns: {
          command: string
          detail: string
          issue: string
          role_name: string
          table_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_own_rods_operator: { Args: { _operator_id: string }; Returns: boolean }
      is_retention_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_thread_participant: {
        Args: { _thread: string; _user: string }
        Returns: boolean
      }
      is_truck_owner_for_operator: {
        Args: { _operator_id: string; _uid: string }
        Returns: boolean
      }
      is_valid_application_draft_token: {
        Args: { _token: string }
        Returns: boolean
      }
      list_driver_contacts: {
        Args: { _driver: string }
        Returns: {
          availability_mode: Database["public"]["Enums"]["staff_availability_mode"]
          availability_note: string
          avatar_url: string
          first_name: string
          full_name: string
          last_name: string
          role: string
          source: string
          staff_id: string
        }[]
      }
      list_my_group_threads: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          last_message: string
          last_message_at: string
          last_message_sender_id: string
          my_role_in_thread: string
          participant_count: number
          thread_id: string
          title: string
          unread_count: number
        }[]
      }
      list_staff_auto_assigned_drivers: {
        Args: { _staff: string }
        Returns: {
          driver_id: string
          full_name: string
          source: string
          suppressed: boolean
          unit_number: string
        }[]
      }
      log_ica_event: {
        Args: {
          p_action: string
          p_contract_id: string
          p_metadata?: Json
          p_operator_id: string
        }
        Returns: undefined
      }
      log_notification_delivery_failure: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_label: string
          p_entity_type: string
          p_error: string
          p_link: string
          p_subject: string
        }
        Returns: undefined
      }
      log_parser_diagnostics: { Args: { p_rows: Json }; Returns: number }
      log_pei_manual_send: {
        Args: {
          _date_sent: string
          _method: string
          _note?: string
          _request_id: string
        }
        Returns: undefined
      }
      log_pei_phone_attempt: {
        Args: {
          _attempt_date: string
          _outcome: string
          _request_id: string
          _spoke_with: string
        }
        Returns: undefined
      }
      manage_claim_flag: {
        Args: {
          p_action: string
          p_actual_amount?: number
          p_claim_id?: string
          p_claim_type?: Database["public"]["Enums"]["claim_type"]
          p_description?: string
          p_documentation_url?: string
          p_estimated_amount?: number
          p_flag_level?: Database["public"]["Enums"]["claim_flag_level"]
          p_load_id?: string
          p_reason?: string
          p_reported_by_contact?: string
          p_resolution?: string
          p_resolution_notes?: string
        }
        Returns: string
      }
      mark_operator_seen: { Args: { _standalone: boolean }; Returns: undefined }
      mark_thread_read: { Args: { _thread_id: string }; Returns: undefined }
      match_staff_help_knowledge: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          route: string
          section: string
          similarity: number
          source: string
          source_id: string
          title: string
        }[]
      }
      move_revisions_to_pending: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      operator_awaiting_return: {
        Args: { _operator_id: string }
        Returns: boolean
      }
      operator_has_truck_owner: {
        Args: { _operator_id: string }
        Returns: boolean
      }
      operator_return_requested: {
        Args: { _operator_id: string }
        Returns: boolean
      }
      purge_rods_day:
        | { Args: { _day_id: string; _reason: string }; Returns: Json }
        | {
            Args: { _day_id: string; _reason: string; _storage_owner: string }
            Returns: Json
          }
        | {
            Args: {
              _actor_id?: string
              _day_id: string
              _reason: string
              _storage_owner: string
            }
            Returns: Json
          }
      raise_eld_sync_alert: {
        Args: {
          p_detail: string
          p_kind: string
          p_log_date: string
          p_operator_id: string
        }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_eld_extension_projection: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      record_duplicate_broker_reference: {
        Args: {
          p_existing_load_id: string
          p_new_load_id: string
          p_reason: string
        }
        Returns: undefined
      }
      record_loadout_damage_flag: {
        Args: { _load_id: string; _note: string }
        Returns: string
      }
      record_retention_export: {
        Args: {
          _artifact_count: number
          _from: string
          _include_demo: boolean
          _kind: string
          _label: string
          _metadata?: Json
          _operator_ids: string[]
          _parts: number
          _to: string
        }
        Returns: string
      }
      record_revoked_list_check: {
        Args: {
          _fmcsa_list_date?: string
          _model_id: string
          _notes?: string
          _replacement_deadline?: string
          _result: string
          _revocation_date?: string
        }
        Returns: string
      }
      record_rods_divergence: {
        Args: {
          p_detected_at: string
          p_device_info: string
          p_differing_fields: string[]
          p_idempotency_key: string
          p_local_row_id: string
          p_local_values: Json
          p_log_date: string
          p_operator_id: string
          p_server_row_id: string
          p_server_values: Json
        }
        Returns: string
      }
      record_rods_purge_storage_result: {
        Args: {
          _audit_id: string
          _failed?: Json
          _late?: boolean
          _removed: string[]
        }
        Returns: undefined
      }
      record_rods_unlock: {
        Args: {
          p_cancelled_entry_ids: Json
          p_cancelled_states: Json
          p_device_info: string
          p_idempotency_key: string
          p_local_certified_at: string
          p_log_date: string
          p_operator_id: string
          p_reason: string
          p_rods_day_id: string
          p_unlocked_at: string
        }
        Returns: string
      }
      reject_application_correction: {
        Args: { p_meta: Json; p_reason: string; p_token: string }
        Returns: {
          request_id: string
        }[]
      }
      remove_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      resolve_officer_packet_token: {
        Args: { p_token: string }
        Returns: {
          bucket: string
          expires_at: string
          operator_id: string
          outcome: string
          storage_path: string
        }[]
      }
      resolve_parser_diagnostic: { Args: { p_id: string }; Returns: undefined }
      resolve_share_bundle: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          file_url: string
          id: string
          name: string
          share_token: string
        }[]
      }
      resolve_share_token: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          file_url: string
          id: string
          name: string
          outcome: string
        }[]
      }
      resolve_short_link: { Args: { _code: string }; Returns: string }
      restore_applicant_pei: {
        Args: { _application_id: string }
        Returns: undefined
      }
      revoke_share_token: { Args: { p_token: string }; Returns: boolean }
      save_application_draft: {
        Args: { p_payload: Json; p_token: string }
        Returns: {
          current_step: number
          id: string
        }[]
      }
      search_audit_log:
        | {
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
        | {
            Args: {
              p_action?: string
              p_actor_id?: string
              p_entity_id?: string
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
      search_retention_archive: {
        Args: {
          _event_id?: string
          _from?: string
          _include_demo?: boolean
          _operator_ids?: string[]
          _status?: string
          _to?: string
          _truck?: string
        }
        Returns: {
          artifact_id: string
          artifact_type: string
          event_id: string
          is_demo: boolean
          label: string
          log_date: string
          occurred_at: string
          operator_id: string
          status: string
          storage_bucket: string
          storage_path: string
          supersedes_day_id: string
          truck_number: string
        }[]
      }
      search_staff_faqs: {
        Args: { q: string }
        Returns: {
          answer: string
          category: Database["public"]["Enums"]["faq_category"]
          headline: string
          id: string
          is_published: boolean
          last_verified_at: string
          question: string
          rank: number
          tags: string[]
        }[]
      }
      set_go_live_with_override: {
        Args: { _go_live_date: string; _operator_id: string; _reason?: string }
        Returns: undefined
      }
      set_load_verbatim_verification: {
        Args: { p_load_id: string; p_records: Json }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_application_correction: {
        Args: {
          p_application_id: string
          p_courtesy_message: string
          p_fields: Json
          p_reason: string
        }
        Returns: {
          request_id: string
          token: string
        }[]
      }
      submit_application_draft: {
        Args: { p_payload: Json; p_ssn_encrypted?: string; p_token: string }
        Returns: string
      }
      submit_pei_response:
        | {
            Args: { p_accidents?: Json; p_response: Json; p_token: string }
            Returns: string
          }
        | {
            Args: {
              p_accidents?: Json
              p_meta?: Json
              p_response: Json
              p_token: string
            }
            Returns: string
          }
      try_notify: {
        Args: {
          p_body: string
          p_channel?: string
          p_entity_id?: string
          p_entity_label?: string
          p_entity_type?: string
          p_link?: string
          p_priority?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: boolean
      }
      try_notify_http: {
        Args: {
          p_bearer: string
          p_body: Json
          p_entity_id?: string
          p_entity_type?: string
          p_subject: string
          p_url: string
        }
        Returns: boolean
      }
      unacked_go_live_blockers: {
        Args: { _operator_id: string }
        Returns: {
          document_id: string
          title: string
          version: number
        }[]
      }
      unassign_load_driver: {
        Args: { p_load_id: string; p_reason?: string }
        Returns: Json
      }
      update_load_status: {
        Args: {
          p_load_id: string
          p_new_status: Database["public"]["Enums"]["load_status"]
          p_note?: string
        }
        Returns: undefined
      }
      update_load_with_stops: {
        Args: {
          p_ack_stop_data_loss?: boolean
          p_charges?: Json
          p_financial_unlock_reason?: string
          p_load: Json
          p_load_id: string
          p_reason?: string
          p_stops: Json
        }
        Returns: string
      }
      update_pei_archive_category: {
        Args: {
          _application_id: string
          _archive_category: string
          _note?: string
        }
        Returns: undefined
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
        | "truck_owner"
      application_correction_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "expired"
      approval_status: "pending" | "approved" | "denied"
      broker_contact_role:
        | "dispatch"
        | "accounts_payable"
        | "claims"
        | "after_hours"
        | "other"
      broker_factoring_status:
        | "approved"
        | "not_approved"
        | "unknown"
        | "pending"
      claim_flag_level: "watch" | "hold" | "cleared"
      claim_type:
        | "damaged_goods"
        | "late_delivery"
        | "shortage"
        | "service_failure"
        | "rate_dispute"
        | "documentation_issue"
        | "other"
      company_document_category:
        | "authority_registration"
        | "tax_financial"
        | "insurance"
        | "operating"
        | "contract_template"
        | "company_policy"
        | "other"
      daily_dispatch_status:
        | "dispatched"
        | "home"
        | "truck_down"
        | "not_dispatched"
      detention_claim_status:
        | "open"
        | "notified"
        | "in_discussion"
        | "resolved_revision"
        | "denied"
        | "abandoned"
      detention_clock_start: "appointment" | "arrival" | "gate_checkin"
      detention_notification_method: "email" | "phone" | "text" | "load_board"
      dispatch_status: "not_dispatched" | "dispatched" | "home" | "truck_down"
      doc_review_status: "pending" | "approved" | "rejected"
      document_exception_reason:
        | "shipper_did_not_provide"
        | "receiver_refused_to_sign"
        | "lost_or_damaged"
        | "will_be_emailed_later"
        | "electronic_bol_no_paper"
        | "facility_closed_no_contact"
        | "other"
      document_exception_status: "pending" | "approved" | "resolved" | "denied"
      document_status: "not_started" | "requested" | "received"
      document_upload_channel:
        | "driver_app"
        | "email_forward"
        | "office_upload"
        | "fax_forward"
        | "system_generated"
      driver_upload_category:
        | "roadside_inspection_report"
        | "repairs_maintenance_receipt"
        | "miscellaneous"
      driver_upload_status: "pending_review" | "reviewed" | "needs_attention"
      equipment_assignment_state: "prior" | "during" | "not_assigned"
      equipment_type: "dry_van" | "reefer" | "flatbed" | "hopper_bottom"
      faq_audience: "owner_operator" | "staff"
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
      load_document_type:
        | "rate_confirmation"
        | "revised_rate_confirmation"
        | "bol"
        | "pod"
        | "scale_ticket"
        | "lumper_receipt"
        | "detention_documentation"
        | "loadout_pickup_inspection"
        | "loadout_delivery_inspection"
        | "permit"
        | "broker_correspondence"
        | "other"
        | "reimbursement_proof"
      load_handling_type: "live_load_unload" | "drop_and_hook"
      load_status:
        | "available"
        | "covered"
        | "dispatched"
        | "in_transit"
        | "at_delivery"
        | "delivered"
        | "pod_received"
        | "accessorials_approved"
        | "ready_to_invoice"
        | "invoiced"
        | "factored"
        | "paid"
        | "settled"
        | "closed"
        | "tonu"
        | "cancelled"
      load_type: "standard" | "per_ton" | "loadout"
      loadout_sticker_state: "recorded" | "unreadable" | "not_found"
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
      osas_device_type:
        | "eld"
        | "dash_cam"
        | "bestpass"
        | "license_plate"
        | "registration"
        | "ifta_decal"
      osas_status: "draft" | "sent" | "signed" | "void"
      pandadoc_status: "sent" | "viewed" | "completed"
      pei_applicant_status: "not_started" | "in_progress" | "complete"
      pei_gfe_reason:
        | "no_response"
        | "refused"
        | "not_located"
        | "no_longer_in_business"
        | "not_dot_regulated"
        | "owner_of_company"
        | "other"
      pei_leaving_reason: "discharged" | "laid_off" | "resigned" | "other"
      pei_performance_rating: "excellent" | "good" | "poor"
      pei_request_status:
        | "pending"
        | "sent"
        | "follow_up_sent"
        | "final_notice_sent"
        | "completed"
        | "gfe_documented"
      rate_con_ingest_status:
        | "received"
        | "pending_parse"
        | "parsed"
        | "needs_manual"
        | "auto_handled"
        | "converted"
        | "dismissed"
      rate_type: "flat" | "per_mile" | "per_ton" | "percentage_of_load"
      registration_type: "own_registration" | "needs_mo_reg"
      resource_category:
        | "user_manuals"
        | "decal_files"
        | "forms_compliance"
        | "dot_general"
        | "payroll"
      review_status: "pending" | "approved" | "denied" | "revisions_requested"
      screening_result: "pending" | "clear" | "non_clear"
      screening_status: "not_started" | "scheduled" | "results_in"
      staff_availability_mode: "all_drivers" | "specific_drivers" | "none"
      stop_time_source: "driver_app" | "dispatcher_entry"
      stop_type: "pickup" | "delivery" | "drop_and_hook"
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
        "truck_owner",
      ],
      application_correction_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "expired",
      ],
      approval_status: ["pending", "approved", "denied"],
      broker_contact_role: [
        "dispatch",
        "accounts_payable",
        "claims",
        "after_hours",
        "other",
      ],
      broker_factoring_status: [
        "approved",
        "not_approved",
        "unknown",
        "pending",
      ],
      claim_flag_level: ["watch", "hold", "cleared"],
      claim_type: [
        "damaged_goods",
        "late_delivery",
        "shortage",
        "service_failure",
        "rate_dispute",
        "documentation_issue",
        "other",
      ],
      company_document_category: [
        "authority_registration",
        "tax_financial",
        "insurance",
        "operating",
        "contract_template",
        "company_policy",
        "other",
      ],
      daily_dispatch_status: [
        "dispatched",
        "home",
        "truck_down",
        "not_dispatched",
      ],
      detention_claim_status: [
        "open",
        "notified",
        "in_discussion",
        "resolved_revision",
        "denied",
        "abandoned",
      ],
      detention_clock_start: ["appointment", "arrival", "gate_checkin"],
      detention_notification_method: ["email", "phone", "text", "load_board"],
      dispatch_status: ["not_dispatched", "dispatched", "home", "truck_down"],
      doc_review_status: ["pending", "approved", "rejected"],
      document_exception_reason: [
        "shipper_did_not_provide",
        "receiver_refused_to_sign",
        "lost_or_damaged",
        "will_be_emailed_later",
        "electronic_bol_no_paper",
        "facility_closed_no_contact",
        "other",
      ],
      document_exception_status: ["pending", "approved", "resolved", "denied"],
      document_status: ["not_started", "requested", "received"],
      document_upload_channel: [
        "driver_app",
        "email_forward",
        "office_upload",
        "fax_forward",
        "system_generated",
      ],
      driver_upload_category: [
        "roadside_inspection_report",
        "repairs_maintenance_receipt",
        "miscellaneous",
      ],
      driver_upload_status: ["pending_review", "reviewed", "needs_attention"],
      equipment_assignment_state: ["prior", "during", "not_assigned"],
      equipment_type: ["dry_van", "reefer", "flatbed", "hopper_bottom"],
      faq_audience: ["owner_operator", "staff"],
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
      load_document_type: [
        "rate_confirmation",
        "revised_rate_confirmation",
        "bol",
        "pod",
        "scale_ticket",
        "lumper_receipt",
        "detention_documentation",
        "loadout_pickup_inspection",
        "loadout_delivery_inspection",
        "permit",
        "broker_correspondence",
        "other",
        "reimbursement_proof",
      ],
      load_handling_type: ["live_load_unload", "drop_and_hook"],
      load_status: [
        "available",
        "covered",
        "dispatched",
        "in_transit",
        "at_delivery",
        "delivered",
        "pod_received",
        "accessorials_approved",
        "ready_to_invoice",
        "invoiced",
        "factored",
        "paid",
        "settled",
        "closed",
        "tonu",
        "cancelled",
      ],
      load_type: ["standard", "per_ton", "loadout"],
      loadout_sticker_state: ["recorded", "unreadable", "not_found"],
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
      osas_device_type: [
        "eld",
        "dash_cam",
        "bestpass",
        "license_plate",
        "registration",
        "ifta_decal",
      ],
      osas_status: ["draft", "sent", "signed", "void"],
      pandadoc_status: ["sent", "viewed", "completed"],
      pei_applicant_status: ["not_started", "in_progress", "complete"],
      pei_gfe_reason: [
        "no_response",
        "refused",
        "not_located",
        "no_longer_in_business",
        "not_dot_regulated",
        "owner_of_company",
        "other",
      ],
      pei_leaving_reason: ["discharged", "laid_off", "resigned", "other"],
      pei_performance_rating: ["excellent", "good", "poor"],
      pei_request_status: [
        "pending",
        "sent",
        "follow_up_sent",
        "final_notice_sent",
        "completed",
        "gfe_documented",
      ],
      rate_con_ingest_status: [
        "received",
        "pending_parse",
        "parsed",
        "needs_manual",
        "auto_handled",
        "converted",
        "dismissed",
      ],
      rate_type: ["flat", "per_mile", "per_ton", "percentage_of_load"],
      registration_type: ["own_registration", "needs_mo_reg"],
      resource_category: [
        "user_manuals",
        "decal_files",
        "forms_compliance",
        "dot_general",
        "payroll",
      ],
      review_status: ["pending", "approved", "denied", "revisions_requested"],
      screening_result: ["pending", "clear", "non_clear"],
      screening_status: ["not_started", "scheduled", "results_in"],
      staff_availability_mode: ["all_drivers", "specific_drivers", "none"],
      stop_time_source: ["driver_app", "dispatcher_entry"],
      stop_type: ["pickup", "delivery", "drop_and_hook"],
      yes_no: ["no", "yes"],
    },
  },
} as const
