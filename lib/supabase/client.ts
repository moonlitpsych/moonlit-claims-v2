/**
 * Supabase Client Configuration
 * HIPAA-compliant database client for browser and server contexts
 */

import { createClient } from '@supabase/supabase-js';

// Check for Supabase environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(
    supabaseUrl &&
    supabaseUrl !== 'your_supabase_project_url' &&
    supabaseAnonKey &&
    supabaseAnonKey !== 'your_supabase_anon_key'
  );
};

/**
 * Client-side Supabase client
 * Uses anonymous key with Row Level Security (RLS) policies
 * Returns null if Supabase is not configured
 */
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * Server-side Supabase client with service role key
 * Bypasses RLS - use carefully and only for server-side operations
 * Returns null if Supabase is not configured
 */
export const getServiceRoleClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isSupabaseConfigured() || !serviceRoleKey || serviceRoleKey === 'your_supabase_service_role_key') {
    return null;
  }

  return createClient(supabaseUrl!, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * Type-safe database types
 * Generated from Supabase schema
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      providers: {
        Row: {
          id: string;
          name: string;
          npi: string;
          type: 'individual' | 'organization';
          phone: string;
          address: Json;
          email: string | null;
          is_supervising: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['providers']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['providers']['Insert']>;
      };
      payers: {
        Row: {
          id: string;
          name: string;
          office_ally_payer_id_837p: string;
          office_ally_payer_id_835: string | null;
          requires_supervising_npi: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payers']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['payers']['Insert']>;
      };
      claims: {
        Row: {
          id: string;
          intakeq_appointment_id: string;
          intakeq_client_id: string;
          intakeq_practitioner_id: string;
          patient_info: Json;
          insurance_info: Json;
          rendering_provider_id: string;
          billing_provider_id: string;
          payer_id: string;
          diagnosis_codes: Json;
          service_lines: Json;
          claim_status: 'draft' | 'validated' | 'submitted' | 'accepted' | 'rejected' | 'paid';
          submission_date: string | null;
          edi_file_path: string | null;
          edi_content: string | null;
          office_ally_transaction_id: string | null;
          validation_errors: Json | null;
          ai_coding_used: boolean;
          ai_coding_details: Json | null;
          manual_overrides: Json | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['claims']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['claims']['Insert']>;
      };
      // Add other table types as needed
    };
  };
}
