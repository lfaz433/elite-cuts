import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "../../../../../functions/node_modules/typescript/lib/typescript.js";

const require = createRequire(import.meta.url);

function loadPreviewModel() {
  const filename = resolve(import.meta.dirname, "./freelancerPreviewModel.ts");
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(
    require,
    module,
    module.exports,
  );
  return module.exports;
}

test("adds an availability slot only when its interval is valid and free", () => {
  const { addPreviewAvailability, createPreviewState } = loadPreviewModel();
  const initial = createPreviewState();
  const result = addPreviewAvailability(initial, {
    day: "2026-11-11",
    start: "16:00",
    end: "17:00",
    mode: "chair",
  });

  assert.equal(result.error, null);
  assert.equal(result.state.slots.length, initial.slots.length + 1);
  assert.deepEqual(result.state.slots.at(-1), {
    id: "availability-1",
    day: "2026-11-11",
    start: "16:00",
    end: "17:00",
    mode: "chair",
    status: "available",
  });
});

test("rejects a slot that overlaps an occupied or available interval", () => {
  const { addPreviewAvailability, createPreviewState } = loadPreviewModel();
  const initial = createPreviewState();
  const result = addPreviewAvailability(initial, {
    day: "2026-11-10",
    start: "09:45",
    end: "10:30",
    mode: "chair",
  });

  assert.equal(result.state, initial);
  assert.match(result.error, /créneau/i);
});

test("responds to a pending booking and clears its unread booking notice", () => {
  const { createPreviewState, respondToPreviewBooking } = loadPreviewModel();
  const result = respondToPreviewBooking(
    createPreviewState(),
    "booking-lea",
    "confirmed",
  );

  assert.equal(
    result.bookings.find((booking) => booking.id === "booking-lea")?.status,
    "confirmed",
  );
  assert.equal(
    result.slots.find((slot) => slot.id === "booking-pending")?.status,
    "booked",
  );
  assert.equal(
    result.notifications.find(
      (notification) => notification.id === "notice-booking",
    )?.read,
    true,
  );
});

test("offers public clients only active services and bookable appointment starts", () => {
  const { createPreviewState, listPublicBookingOptions } = loadPreviewModel();
  const state = createPreviewState();
  state.services[1].active = false;

  const result = listPublicBookingOptions(state, "fade");

  assert.deepEqual(
    result.services.map((service) => service.id),
    ["fade", "full"],
  );
  assert.deepEqual(
    result.slots.map((slot) => `${slot.day} ${slot.start}-${slot.end}`),
    [
      "2026-11-10 15:00-15:45",
      "2026-11-10 15:15-16:00",
      "2026-11-10 15:30-16:15",
      "2026-11-10 15:45-16:30",
      "2026-11-10 16:00-16:45",
      "2026-11-10 16:15-17:00",
      "2026-11-11 10:00-10:45",
      "2026-11-11 10:15-11:00",
      "2026-11-11 10:30-11:15",
      "2026-11-11 10:45-11:30",
      "2026-11-11 11:00-11:45",
      "2026-11-11 11:15-12:00",
      "2026-11-12 14:00-14:45",
      "2026-11-12 14:15-15:00",
      "2026-11-12 14:30-15:15",
      "2026-11-12 14:45-15:30",
      "2026-11-12 15:00-15:45",
      "2026-11-12 15:15-16:00",
      "2026-11-12 15:30-16:15",
      "2026-11-12 15:45-16:30",
      "2026-11-12 16:00-16:45",
      "2026-11-12 16:15-17:00",
      "2026-11-12 16:30-17:15",
      "2026-11-12 16:45-17:30",
      "2026-11-12 17:00-17:45",
      "2026-11-12 17:15-18:00",
    ],
  );
});

test("filters public booking times by the client’s chosen appointment location", () => {
  const { createPreviewState, listPublicBookingOptions } = loadPreviewModel();
  const state = createPreviewState();

  const salon = listPublicBookingOptions(state, "fade", "chair");
  const home = listPublicBookingOptions(state, "fade", "home");

  assert.deepEqual(
    [...new Set(salon.slots.map((slot) => slot.day))],
    ["2026-11-10", "2026-11-11"],
  );
  assert.deepEqual(
    [...new Set(home.slots.map((slot) => slot.day))],
    ["2026-11-12"],
  );
  assert.ok(salon.slots.every((slot) => slot.mode === "chair"));
  assert.ok(home.slots.every((slot) => slot.mode === "home"));
});

test("quotes a flat home visit fee only within the demo service zone", () => {
  const { getPublicBookingTravelQuote } = loadPreviewModel();

  assert.deepEqual(getPublicBookingTravelQuote("chair", "75011"), {
    available: true,
    feeMinor: 0,
  });
  assert.deepEqual(getPublicBookingTravelQuote("home", "75011"), {
    available: true,
    feeMinor: 500,
  });
  assert.deepEqual(getPublicBookingTravelQuote("home", "75012"), {
    available: true,
    feeMinor: 500,
  });
  assert.deepEqual(getPublicBookingTravelQuote("home", "75015"), {
    available: false,
    feeMinor: 0,
  });
});

test("creates a local booking confirmation only for a valid public client request", () => {
  const { createPreviewState, createPublicBookingRequest } = loadPreviewModel();
  const state = createPreviewState();

  const rejected = createPublicBookingRequest(state, {
    clientName: "",
    serviceId: "fade",
    day: "2026-11-10",
    start: "15:00",
    mode: "chair",
  });
  const accepted = createPublicBookingRequest(state, {
    clientName: "Nassim",
    contact: "06 12 34 56 78",
    serviceId: "fade",
    day: "2026-11-10",
    start: "15:00",
    mode: "chair",
  });

  assert.match(rejected.error, /nom/i);
  assert.equal(accepted.error, null);
  assert.deepEqual(accepted.booking, {
    serviceName: "Dégradé signature",
    day: "2026-11-10",
    start: "15:00",
    end: "15:45",
    mode: "chair",
    travelFeeMinor: 0,
    totalMinor: 3000,
    status: "pending",
  });
});

test("adds the demo travel fee to an in-zone home booking confirmation", () => {
  const { createPreviewState, createPublicBookingRequest } = loadPreviewModel();
  const result = createPublicBookingRequest(createPreviewState(), {
    clientName: "Nassim",
    contact: "06 12 34 56 78",
    serviceId: "fade",
    day: "2026-11-12",
    start: "14:00",
    mode: "home",
    homeAddress: {
      line1: "12 rue des Fleurs",
      postalCode: "75011",
      city: "Paris",
    },
  });

  assert.deepEqual(result.booking, {
    serviceName: "Dégradé signature",
    day: "2026-11-12",
    start: "14:00",
    end: "14:45",
    mode: "home",
    travelFeeMinor: 500,
    totalMinor: 3500,
    status: "pending",
  });
  assert.equal(result.error, null);
});

test("rejects a home booking confirmation outside the demo service zone", () => {
  const { createPreviewState, createPublicBookingRequest } = loadPreviewModel();
  const result = createPublicBookingRequest(createPreviewState(), {
    clientName: "Nassim",
    contact: "06 12 34 56 78",
    serviceId: "fade",
    day: "2026-11-12",
    start: "14:00",
    mode: "home",
    homeAddress: {
      line1: "12 rue des Fleurs",
      postalCode: "75015",
      city: "Paris",
    },
  });

  assert.equal(result.booking, null);
  assert.equal(
    result.error,
    "Les rendez-vous à domicile sont disponibles à Paris 11e et 12e.",
  );
});

test("rejects a home booking request without a complete address", () => {
  const { createPreviewState, createPublicBookingRequest } = loadPreviewModel();
  const result = createPublicBookingRequest(createPreviewState(), {
    clientName: "Nassim",
    contact: "06 12 34 56 78",
    serviceId: "fade",
    day: "2026-11-12",
    start: "14:00",
    mode: "home",
    homeAddress: {
      line1: "12 rue Oberkampf",
      postalCode: "",
      city: "Paris",
    },
  });

  assert.equal(result.booking, null);
  assert.equal(
    result.error,
    "Indiquez l’adresse complète du rendez-vous à domicile.",
  );
});

test("rejects a public booking request without a contact phone number", () => {
  const { createPreviewState, createPublicBookingRequest } = loadPreviewModel();
  const result = createPublicBookingRequest(createPreviewState(), {
    clientName: "Nassim",
    contact: "",
    serviceId: "fade",
    day: "2026-11-10",
    start: "15:00",
    mode: "chair",
  });

  assert.equal(result.booking, null);
  assert.equal(result.error, "Indiquez votre téléphone pour continuer.");
});

test("moves a public booking wizard forward only after valid choices", () => {
  const {
    advancePublicBookingWizard,
    createPreviewState,
    listPublicBookingOptions,
    publicBookingSlotKey,
  } = loadPreviewModel();
  const state = createPreviewState();
  const validSlot = listPublicBookingOptions(state, "fade").slots[0];

  assert.deepEqual(
    advancePublicBookingWizard(state, {
      step: 1,
      serviceId: "not-available",
      selectedSlotKey: "",
    }),
    { step: 1, error: "Choisissez une prestation disponible." },
  );
  assert.deepEqual(
    advancePublicBookingWizard(state, {
      step: 1,
      serviceId: "fade",
      selectedSlotKey: "",
    }),
    { step: 2, error: null },
  );
  assert.deepEqual(
    advancePublicBookingWizard(state, {
      step: 2,
      serviceId: "fade",
      selectedSlotKey: "",
    }),
    { step: 2, error: "Choisissez un créneau pour continuer." },
  );
  assert.deepEqual(
    advancePublicBookingWizard(state, {
      step: 2,
      serviceId: "fade",
      selectedSlotKey: publicBookingSlotKey(validSlot),
    }),
    { step: 3, error: null },
  );
});

test("requires a complete address before a home appointment can leave step 2", () => {
  const {
    advancePublicBookingWizard,
    createPreviewState,
    listPublicBookingOptions,
    publicBookingSlotKey,
  } = loadPreviewModel();
  const state = createPreviewState();
  const homeSlot = listPublicBookingOptions(state, "fade", "home").slots[0];

  const rejected = advancePublicBookingWizard(state, {
    step: 2,
    serviceId: "fade",
    selectedSlotKey: publicBookingSlotKey(homeSlot),
    homeAddress: {
      line1: "",
      postalCode: "75011",
      city: "Paris",
    },
  });
  const accepted = advancePublicBookingWizard(state, {
    step: 2,
    serviceId: "fade",
    selectedSlotKey: publicBookingSlotKey(homeSlot),
    homeAddress: {
      line1: "12 rue Oberkampf",
      postalCode: "75011",
      city: "Paris",
    },
  });

  assert.deepEqual(rejected, {
    step: 2,
    error: "Indiquez l’adresse complète du rendez-vous à domicile.",
  });
  assert.deepEqual(accepted, { step: 3, error: null });
});

test("keeps a home appointment on step 2 when its postal code is outside the demo zone", () => {
  const {
    advancePublicBookingWizard,
    createPreviewState,
    listPublicBookingOptions,
    publicBookingSlotKey,
  } = loadPreviewModel();
  const state = createPreviewState();
  const homeSlot = listPublicBookingOptions(state, "fade", "home").slots[0];

  const result = advancePublicBookingWizard(state, {
    step: 2,
    serviceId: "fade",
    selectedSlotKey: publicBookingSlotKey(homeSlot),
    homeAddress: {
      line1: "12 rue des Fleurs",
      postalCode: "75015",
      city: "Paris",
    },
  });

  assert.deepEqual(result, {
    step: 2,
    error: "Les rendez-vous à domicile sont disponibles à Paris 11e et 12e.",
  });
});
