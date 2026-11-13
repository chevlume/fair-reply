/**
 * Engineering assumptions for Spain Ley 10/2025.
 * These numbers are product parameters, not a quotation of the statute.
 * A human confirms the period that applies to the organisation.
 */
export const TIMEZONE = 'Europe/Madrid';

/** General complaints: business days after fields.created. */
export const GENERAL_BUSINESS_DAYS = 15;

/**
 * Billing: the statute says five days and does not call them business days.
 * Default operational target: five Madrid calendar days. Needs legal or sectoral review.
 */
export const BILLING_CALENDAR_DAYS = 5;

/** Basic-service outage continuity notices: clock hours, not business hours. */
export const OUTAGE_HOURS = 2;

export type ComplaintCategory = 'general' | 'billing' | 'outage' | 'none';
