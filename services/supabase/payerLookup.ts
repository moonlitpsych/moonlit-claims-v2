/**
 * Payer Lookup Service
 * Queries Supabase for payer information and Office Ally IDs
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export interface Payer {
  id: string;
  name: string;
  office_ally_payer_id_837p: string; // For claim submissions
  office_ally_payer_id_835?: string; // For remittance advice
  requires_supervising_npi: boolean;
  is_active: boolean;
}

/**
 * Get payer by name (fuzzy match)
 */
export async function getPayerByName(payerName: string): Promise<Payer | null> {
  try {
    logger.info('Looking up payer', { payerName });

    const { data, error } = await supabase
      .from('payers')
      .select('*')
      .ilike('name', `%${payerName}%`)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error) {
      logger.warn('Payer lookup failed', {
        payerName,
        error: error.message,
      });
      return null;
    }

    logger.info('Payer found', {
      payerName: data.name,
      payerId: data.office_ally_payer_id_837p,
    });

    return data;
  } catch (error) {
    logger.error('Error in payer lookup', {
      payerName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get all active payers
 */
export async function getAllPayers(): Promise<Payer[]> {
  try {
    const { data, error } = await supabase
      .from('payers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('Failed to fetch payers', { error: error.message });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Error fetching payers', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Get Office Ally Payer ID for a specific insurance company
 */
export async function getOfficeAllyPayerId(
  insuranceCompanyName: string
): Promise<string | null> {
  const payer = await getPayerByName(insuranceCompanyName);
  return payer?.office_ally_payer_id_837p || null;
}

/**
 * Check if payer requires supervising physician NPI
 */
export async function requiresSupervisingNPI(
  insuranceCompanyName: string
): Promise<boolean> {
  const payer = await getPayerByName(insuranceCompanyName);
  return payer?.requires_supervising_npi || false;
}
