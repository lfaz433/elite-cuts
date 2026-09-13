const MAX_SERVICE_NAME_LENGTH = 64;

function serviceId(name) {
  return name
    .trim()
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SERVICE_NAME_LENGTH);
}

export function displayFreelancerService(id) {
  const words = id
    .split('-')
    .filter(Boolean)
    .map(word => word.toLocaleLowerCase('fr-FR'));
  return words.map((word, index) => (
    index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
  )).join(' ');
}

export function addFreelancerService(profile, name) {
  const id = serviceId(name);
  if (!id || profile.serviceIds.includes(id)) return null;
  return {
    serviceIds: [...profile.serviceIds, id],
    servicePricesMinor: { ...profile.servicePricesMinor, [id]: 0 },
  };
}

export function setFreelancerServicePrice(profile, id, priceMinor) {
  if (!profile.serviceIds.includes(id) || !Number.isInteger(priceMinor) || priceMinor < 0) return null;
  return {
    serviceIds: profile.serviceIds,
    servicePricesMinor: { ...profile.servicePricesMinor, [id]: priceMinor },
  };
}

export function removeFreelancerService(profile, id) {
  if (!profile.serviceIds.includes(id)) return null;
  const { [id]: _removed, ...servicePricesMinor } = profile.servicePricesMinor;
  return {
    serviceIds: profile.serviceIds.filter(item => item !== id),
    servicePricesMinor,
  };
}
