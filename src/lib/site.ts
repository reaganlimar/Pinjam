export const UNIVERSITY = process.env.NEXT_PUBLIC_UNIVERSITY_NAME ?? "Binus University";
export const CAMPUS = process.env.NEXT_PUBLIC_CAMPUS_NAME ?? "Alam Sutera";
export const CAMPUS_LABEL = `${UNIVERSITY} · ${CAMPUS}`;

/** Common handover spots shown as suggestions in the listing form (free text is allowed). */
export const PICKUP_SUGGESTIONS = ["Atrium", "Canteen", "LKC", "Booth Pinjam", "Library", "Lobby"];
