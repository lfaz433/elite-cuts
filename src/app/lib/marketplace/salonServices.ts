export interface ServiceDraftRow { id: string; label: string; price: string; duration: string }
export interface SalonService { id: string; label: string; priceMinor: number; durationMinutes: number }
export function serviceDraftPayload(rows: ServiceDraftRow[]): SalonService[] {
  if (rows.length > 50) throw new Error('Vous pouvez ajouter jusqu’à 50 prestations.');
  const ids = new Set<string>();
  return rows.map((row, index) => {
    const label = row.label.trim();
    const price = row.price.trim().replace(',', '.');
    const duration = Number(row.duration);
    if (!/^[\w-]{1,128}$/.test(row.id) || ids.has(row.id)) throw new Error('Une prestation est en double ou invalide.');
    ids.add(row.id);
    if (!label || label.length > 80) throw new Error(`Prestation ${index + 1} : indiquez un nom (80 caractères maximum).`);
    if (!/^\d+(?:\.\d{1,2})?$/.test(price) || Number(price) > 1000) throw new Error(`${label} : indiquez un prix entre 0 et 1 000 €, avec deux décimales maximum.`);
    if (!Number.isSafeInteger(duration) || duration < 5 || duration > 480) throw new Error(`${label} : indiquez une durée entre 5 et 480 minutes.`);
    return { id: row.id, label, priceMinor: Math.round(Number(price) * 100), durationMinutes: duration };
  });
}
export function parseSalonCatalog(value: unknown): { revision: number; rows: ServiceDraftRow[] } {
  if (value === undefined) return { revision: 0, rows: [] };
  const data = value as { revision?: unknown; currency?: unknown; services?: unknown };
  if (!data || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0 || data.currency !== 'EUR' || !Array.isArray(data.services)) {
    throw new Error('Impossible de lire les prestations enregistrées.');
  }
  const rows = data.services.map(item => {
    const service = item as SalonService;
    if (!service || typeof service.id !== 'string' || typeof service.label !== 'string' || !Number.isSafeInteger(service.priceMinor) || !Number.isSafeInteger(service.durationMinutes)) throw new Error('Une prestation enregistrée est invalide.');
    return { id: service.id, label: service.label, price: (service.priceMinor / 100).toFixed(2), duration: String(service.durationMinutes) };
  });
  serviceDraftPayload(rows);
  return { revision: data.revision as number, rows };
}
