/** Set NEXT_PUBLIC_CONTACT_EMAIL (and optionally NEXT_PUBLIC_COMPANY_NAME) in Vercel; they are inlined at build time. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
export const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME || "acezilla";
export const SITE = "https://acezilla.vercel.app";
export const EFFECTIVE = "30 October 2026";
