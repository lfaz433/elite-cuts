export const PREVIEW_VIEWS = [
  "today",
  "planning",
  "bookings",
  "services",
  "showcase",
  "analytics",
  "settings",
] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

export type PreviewService = {
  id: string;
  name: string;
  priceMinor: number;
  durationMinutes: number;
  active: boolean;
};

export type PreviewSlot = {
  id: string;
  day: string;
  start: string;
  end: string;
  mode: "chair" | "home";
  status: "available" | "booked" | "pending" | "blocked";
};

export type PreviewBooking = {
  id: string;
  clientName: string;
  serviceId: string;
  day: string;
  start: string;
  end: string;
  mode: "chair" | "home";
  status: "pending" | "confirmed" | "declined" | "completed";
  approximateArea: string;
};

export type PreviewNotification = {
  id: string;
  title: string;
  detail: string;
  view: PreviewView;
  read: boolean;
};

export type PreviewState = {
  activeView: PreviewView;
  services: PreviewService[];
  slots: PreviewSlot[];
  bookings: PreviewBooking[];
  notifications: PreviewNotification[];
  nextAvailabilityId: number;
  nextServiceId: number;
};

export type PreviewAvailabilityInput = Pick<
  PreviewSlot,
  "day" | "start" | "end" | "mode"
>;
export type PreviewMutation = { state: PreviewState; error: string | null };
export type PublicBookingSlot = Pick<
  PreviewSlot,
  "day" | "start" | "end" | "mode"
>;
export type PublicBookingRequest = Pick<
  PublicBookingSlot,
  "day" | "start" | "mode"
> & {
  clientName: string;
  contact: string;
  serviceId: string;
  homeAddress?: PublicBookingAddress;
};
export type PublicBookingAddress = {
  line1: string;
  postalCode: string;
  city: string;
  details?: string;
};
export type PublicBookingConfirmation = PublicBookingSlot & {
  serviceName: string;
  travelFeeMinor: number;
  totalMinor: number;
  status: "pending";
};
export type PublicBookingWizardStep = 1 | 2 | 3;
export type PublicBookingWizardProgress = {
  step: PublicBookingWizardStep;
  serviceId: string;
  selectedSlotKey: string;
  homeAddress?: PublicBookingAddress;
};

const HOME_SERVICE_POSTAL_CODES = new Set(["75011", "75012"]);
export const HOME_TRAVEL_FEE_MINOR = 500;

export const PREVIEW_WEEK = [
  { key: "2026-11-10", label: "Lun. 10" },
  { key: "2026-11-11", label: "Mar. 11" },
  { key: "2026-11-12", label: "Mer. 12" },
  { key: "2026-11-13", label: "Jeu. 13" },
  { key: "2026-11-14", label: "Ven. 14" },
  { key: "2026-11-15", label: "Sam. 15" },
];

export function createPreviewState(): PreviewState {
  return {
    activeView: "today",
    services: [
      {
        id: "fade",
        name: "Dégradé signature",
        priceMinor: 3000,
        durationMinutes: 45,
        active: true,
      },
      {
        id: "beard",
        name: "Barbe & contours",
        priceMinor: 1800,
        durationMinutes: 30,
        active: true,
      },
      {
        id: "full",
        name: "Coupe + barbe",
        priceMinor: 4500,
        durationMinutes: 75,
        active: true,
      },
    ],
    slots: [
      {
        id: "booking-confirmed",
        day: "2026-11-10",
        start: "09:30",
        end: "10:15",
        mode: "chair",
        status: "booked",
      },
      {
        id: "booking-pending",
        day: "2026-11-10",
        start: "13:00",
        end: "13:45",
        mode: "home",
        status: "pending",
      },
      {
        id: "available-monday",
        day: "2026-11-10",
        start: "15:00",
        end: "17:00",
        mode: "chair",
        status: "available",
      },
      {
        id: "blocked-monday",
        day: "2026-11-10",
        start: "18:00",
        end: "19:00",
        mode: "chair",
        status: "blocked",
      },
      {
        id: "available-tuesday",
        day: "2026-11-11",
        start: "10:00",
        end: "12:00",
        mode: "chair",
        status: "available",
      },
      {
        id: "available-wednesday",
        day: "2026-11-12",
        start: "14:00",
        end: "18:00",
        mode: "home",
        status: "available",
      },
    ],
    bookings: [
      {
        id: "booking-amine",
        clientName: "Sofiane B.",
        serviceId: "fade",
        day: "2026-11-10",
        start: "09:30",
        end: "10:15",
        mode: "chair",
        status: "confirmed",
        approximateArea: "Atelier République",
      },
      {
        id: "booking-lea",
        clientName: "Nora M.",
        serviceId: "beard",
        day: "2026-11-10",
        start: "13:00",
        end: "13:45",
        mode: "home",
        status: "pending",
        approximateArea: "Paris 11e",
      },
      {
        id: "booking-ibrahim",
        clientName: "Ibrahim K.",
        serviceId: "full",
        day: "2026-11-12",
        start: "16:00",
        end: "17:15",
        mode: "home",
        status: "confirmed",
        approximateArea: "Paris 12e",
      },
    ],
    notifications: [
      {
        id: "notice-booking",
        title: "Nouvelle demande",
        detail: "Nora souhaite réserver Barbe & contours à 13:00.",
        view: "bookings",
        read: false,
      },
      {
        id: "notice-slot",
        title: "Créneau à compléter",
        detail: "Votre après-midi de mardi est encore disponible.",
        view: "planning",
        read: false,
      },
      {
        id: "notice-showcase",
        title: "Vitrine prête",
        detail: "Votre lien de réservation est actif dans cette démonstration.",
        view: "showcase",
        read: true,
      },
    ],
    nextAvailabilityId: 1,
    nextServiceId: 1,
  };
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return Number.NaN;
  return hour * 60 + minute;
}

function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function overlaps(
  slot: Pick<PreviewSlot, "start" | "end">,
  candidate: Pick<PreviewSlot, "start" | "end">,
) {
  return (
    minutes(slot.start) < minutes(candidate.end) &&
    minutes(candidate.start) < minutes(slot.end)
  );
}

export function setPreviewView(
  state: PreviewState,
  activeView: PreviewView,
): PreviewState {
  return { ...state, activeView };
}

export function addPreviewAvailability(
  state: PreviewState,
  input: PreviewAvailabilityInput,
): PreviewMutation {
  const start = minutes(input.start);
  const end = minutes(input.end);
  if (!input.day || Number.isNaN(start) || Number.isNaN(end) || start >= end) {
    return { state, error: "Choisissez une plage horaire valide." };
  }
  if (
    state.slots.some((slot) => slot.day === input.day && overlaps(slot, input))
  ) {
    return {
      state,
      error:
        "Ce créneau chevauche déjà une réservation, une disponibilité ou un blocage.",
    };
  }
  const slot: PreviewSlot = {
    id: `availability-${state.nextAvailabilityId}`,
    ...input,
    status: "available",
  };
  return {
    state: {
      ...state,
      slots: [...state.slots, slot],
      nextAvailabilityId: state.nextAvailabilityId + 1,
    },
    error: null,
  };
}

export function blockPreviewSlot(
  state: PreviewState,
  input: Pick<PreviewSlot, "day" | "start" | "end">,
): PreviewMutation {
  const result = addPreviewAvailability(state, { ...input, mode: "chair" });
  if (result.error) return result;
  return {
    error: null,
    state: {
      ...result.state,
      slots: result.state.slots.map((slot) =>
        slot.id === `availability-${state.nextAvailabilityId}`
          ? { ...slot, status: "blocked" }
          : slot,
      ),
    },
  };
}

export function removePreviewSlot(
  state: PreviewState,
  slotId: string,
): PreviewState {
  return { ...state, slots: state.slots.filter((slot) => slot.id !== slotId) };
}

export function respondToPreviewBooking(
  state: PreviewState,
  bookingId: string,
  response: "confirmed" | "declined",
): PreviewState {
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking || booking.status !== "pending") return state;
  return {
    ...state,
    bookings: state.bookings.map((item) =>
      item.id === bookingId ? { ...item, status: response } : item,
    ),
    slots: state.slots.map((slot) =>
      slot.id === "booking-pending" && response === "declined"
        ? { ...slot, status: "available" }
        : slot.id === "booking-pending"
          ? { ...slot, status: "booked" }
          : slot,
    ),
    notifications: state.notifications.map((item) =>
      item.view === "bookings" ? { ...item, read: true } : item,
    ),
  };
}

export function markPreviewNotificationsRead(
  state: PreviewState,
): PreviewState {
  return {
    ...state,
    notifications: state.notifications.map((item) => ({ ...item, read: true })),
  };
}

export function addPreviewService(
  state: PreviewState,
  input: Pick<PreviewService, "name" | "priceMinor" | "durationMinutes">,
): PreviewMutation {
  if (
    !input.name.trim() ||
    input.priceMinor <= 0 ||
    input.durationMinutes <= 0
  ) {
    return { state, error: "Indiquez un nom, un prix et une durée valides." };
  }
  const service: PreviewService = {
    id: `service-${state.nextServiceId}`,
    ...input,
    name: input.name.trim(),
    active: true,
  };
  return {
    state: {
      ...state,
      services: [...state.services, service],
      nextServiceId: state.nextServiceId + 1,
    },
    error: null,
  };
}

export function togglePreviewService(
  state: PreviewState,
  serviceId: string,
): PreviewState {
  return {
    ...state,
    services: state.services.map((service) =>
      service.id === serviceId
        ? { ...service, active: !service.active }
        : service,
    ),
  };
}

export function listPublicBookingOptions(
  state: PreviewState,
  serviceId: string,
  mode?: PublicBookingSlot["mode"],
) {
  const services = state.services.filter((service) => service.active);
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  if (!service) return { services, slots: [] as PublicBookingSlot[] };

  const slots = state.slots
    .filter(
      (slot) => slot.status === "available" && (!mode || slot.mode === mode),
    )
    .flatMap((slot) => {
      const starts: PublicBookingSlot[] = [];
      const first = minutes(slot.start);
      const lastStart = minutes(slot.end) - service.durationMinutes;
      for (let start = first; start <= lastStart; start += 15) {
        starts.push({
          day: slot.day,
          start: timeFromMinutes(start),
          end: timeFromMinutes(start + service.durationMinutes),
          mode: slot.mode,
        });
      }
      return starts;
    });
  return { services, slots };
}

export function publicBookingSlotKey(
  slot: Pick<PublicBookingSlot, "day" | "start" | "mode">,
) {
  return [slot.day, slot.start, slot.mode].join("|");
}

function hasCompleteHomeAddress(address?: PublicBookingAddress) {
  return Boolean(
    address?.line1.trim() && address.postalCode.trim() && address.city.trim(),
  );
}

export function getPublicBookingTravelQuote(
  mode: PublicBookingSlot["mode"],
  postalCode: string,
) {
  if (mode === "chair") return { available: true, feeMinor: 0 };
  return HOME_SERVICE_POSTAL_CODES.has(postalCode.trim())
    ? { available: true, feeMinor: HOME_TRAVEL_FEE_MINOR }
    : { available: false, feeMinor: 0 };
}

export function advancePublicBookingWizard(
  state: PreviewState,
  progress: PublicBookingWizardProgress,
): { step: PublicBookingWizardStep; error: string | null } {
  if (progress.step === 1) {
    const isAvailableService = state.services.some(
      (service) => service.id === progress.serviceId && service.active,
    );
    return isAvailableService
      ? { step: 2, error: null }
      : { step: 1, error: "Choisissez une prestation disponible." };
  }

  if (progress.step === 2) {
    const isAvailableSlot = listPublicBookingOptions(
      state,
      progress.serviceId,
    ).slots.some(
      (slot) => publicBookingSlotKey(slot) === progress.selectedSlotKey,
    );
    if (!isAvailableSlot)
      return { step: 2, error: "Choisissez un créneau pour continuer." };
    const selectedSlot = listPublicBookingOptions(
      state,
      progress.serviceId,
    ).slots.find(
      (slot) => publicBookingSlotKey(slot) === progress.selectedSlotKey,
    );
    if (
      selectedSlot?.mode === "home" &&
      !hasCompleteHomeAddress(progress.homeAddress)
    )
      return {
        step: 2,
        error: "Indiquez l’adresse complète du rendez-vous à domicile.",
      };
    if (
      selectedSlot?.mode === "home" &&
      !getPublicBookingTravelQuote(
        "home",
        progress.homeAddress?.postalCode ?? "",
      ).available
    )
      return {
        step: 2,
        error:
          "Les rendez-vous à domicile sont disponibles à Paris 11e et 12e.",
      };
    return { step: 3, error: null };
  }

  return { step: 3, error: null };
}

export function createPublicBookingRequest(
  state: PreviewState,
  request: PublicBookingRequest,
): { booking: PublicBookingConfirmation | null; error: string | null } {
  if (!request.clientName.trim())
    return { booking: null, error: "Indiquez votre nom pour continuer." };
  if (!request.contact.trim())
    return { booking: null, error: "Indiquez votre téléphone pour continuer." };
  if (request.mode === "home" && !hasCompleteHomeAddress(request.homeAddress))
    return {
      booking: null,
      error: "Indiquez l’adresse complète du rendez-vous à domicile.",
    };
  const travelQuote = getPublicBookingTravelQuote(
    request.mode,
    request.homeAddress?.postalCode ?? "",
  );
  if (!travelQuote.available)
    return {
      booking: null,
      error: "Les rendez-vous à domicile sont disponibles à Paris 11e et 12e.",
    };
  const service = state.services.find(
    (item) => item.id === request.serviceId && item.active,
  );
  if (!service)
    return { booking: null, error: "Cette prestation n’est plus disponible." };
  const slot = listPublicBookingOptions(state, request.serviceId).slots.find(
    (item) =>
      item.day === request.day &&
      item.start === request.start &&
      item.mode === request.mode,
  );
  if (!slot)
    return { booking: null, error: "Ce créneau n’est plus disponible." };
  return {
    booking: {
      ...slot,
      serviceName: service.name,
      travelFeeMinor: travelQuote.feeMinor,
      totalMinor: service.priceMinor + travelQuote.feeMinor,
      status: "pending",
    },
    error: null,
  };
}
