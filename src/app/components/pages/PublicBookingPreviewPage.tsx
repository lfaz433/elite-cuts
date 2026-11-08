import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Scissors,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Link } from "react-router";
import {
  advancePublicBookingWizard,
  createPreviewState,
  createPublicBookingRequest,
  getPublicBookingTravelQuote,
  listPublicBookingOptions,
  PREVIEW_WEEK,
  publicBookingSlotKey,
  type PublicBookingConfirmation,
} from "../freelancer/preview/freelancerPreviewModel";

const previewState = createPreviewState();
const bookingSteps = ["Prestation", "Lieu & créneau", "Confirmation"];
const bookingModes = [
  {
    id: "chair",
    label: "Au salon",
    detail: "Atelier République",
  },
  {
    id: "home",
    label: "À domicile",
    detail: "Chez vous, selon la zone du barbier",
  },
] as const;
const price = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    value / 100,
  );
const dayLabel = (day: string) =>
  PREVIEW_WEEK.find((item) => item.key === day)?.label ?? day;

function downloadBookingCalendar(confirmation: PublicBookingConfirmation) {
  const formatDateTime = (day: string, time: string) =>
    `${day.replaceAll("-", "")}T${time.replace(":", "")}00`;
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barberboard//Réservation locale//FR",
    "BEGIN:VEVENT",
    `DTSTART:${formatDateTime(confirmation.day, confirmation.start)}`,
    `DTEND:${formatDateTime(confirmation.day, confirmation.end)}`,
    `SUMMARY:${confirmation.serviceName} · Amine Fade Studio`,
    "LOCATION:À confirmer avec le barbier",
    "DESCRIPTION:Demande en attente de validation.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([calendar], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "rendez-vous-amine-fade-studio.ics";
  link.click();
  URL.revokeObjectURL(url);
}

export default function PublicBookingPreviewPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [serviceId, setServiceId] = useState("");
  const [appointmentMode, setAppointmentMode] = useState<"chair" | "home" | "">(
    "",
  );
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [selectedDay, setSelectedDay] = useState(PREVIEW_WEEK[0].key);
  const [homeAddressLine, setHomeAddressLine] = useState("");
  const [homePostalCode, setHomePostalCode] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeAddressDetails, setHomeAddressDetails] = useState("");
  const [clientName, setClientName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<PublicBookingConfirmation | null>(null);
  const allOptions = useMemo(
    () => listPublicBookingOptions(previewState, serviceId),
    [serviceId],
  );
  const options = useMemo(
    () =>
      listPublicBookingOptions(
        previewState,
        serviceId,
        appointmentMode || undefined,
      ),
    [appointmentMode, serviceId],
  );
  const selectedService = options.services.find(
    (service) => service.id === serviceId,
  );
  const selectedSlot = options.slots.find(
    (slot) => publicBookingSlotKey(slot) === selectedSlotKey,
  );
  const dates = [...new Set(options.slots.map((slot) => slot.day))];
  const slotsForDay = options.slots.filter((slot) => slot.day === selectedDay);
  const availableModes = bookingModes.filter((mode) =>
    allOptions.slots.some((slot) => slot.mode === mode.id),
  );
  const homeAddress = {
    line1: homeAddressLine,
    postalCode: homePostalCode,
    city: homeCity,
    details: homeAddressDetails,
  };
  const travelQuote = getPublicBookingTravelQuote(
    appointmentMode === "home" ? "home" : "chair",
    homePostalCode,
  );
  const travelFeeMinor =
    appointmentMode === "home" && travelQuote.available
      ? travelQuote.feeMinor
      : 0;
  const totalMinor = (selectedService?.priceMinor ?? 0) + travelFeeMinor;
  const homeLocation = [
    homeAddressLine,
    [homePostalCode, homeCity].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  const selectedLocation =
    appointmentMode === "home"
      ? homeLocation || "À domicile"
      : appointmentMode === "chair"
        ? "Atelier République"
        : "À choisir";

  const clearHomeAddress = () => {
    setHomeAddressLine("");
    setHomePostalCode("");
    setHomeCity("");
    setHomeAddressDetails("");
  };

  const selectService = (nextServiceId: string) => {
    const nextOptions = listPublicBookingOptions(previewState, nextServiceId);
    setServiceId(nextServiceId);
    setAppointmentMode("");
    setSelectedSlotKey("");
    setSelectedDay(nextOptions.slots[0]?.day ?? "");
    clearHomeAddress();
    setError(null);
  };

  const selectAppointmentMode = (nextMode: "chair" | "home") => {
    const nextOptions = listPublicBookingOptions(
      previewState,
      serviceId,
      nextMode,
    );
    setAppointmentMode(nextMode);
    setSelectedSlotKey("");
    setSelectedDay(nextOptions.slots[0]?.day ?? "");
    if (nextMode === "chair") clearHomeAddress();
    setError(null);
  };

  const continueBooking = () => {
    const transition = advancePublicBookingWizard(previewState, {
      step,
      serviceId,
      selectedSlotKey,
      homeAddress,
    });
    setError(transition.error);
    setStep(transition.step);
  };

  const goBack = () => {
    setStep((currentStep) =>
      currentStep === 1 ? 1 : ((currentStep - 1) as 1 | 2),
    );
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSlot) {
      setStep(2);
      setError("Ce créneau n’est plus disponible. Choisissez-en un autre.");
      return;
    }
    const result = createPublicBookingRequest(previewState, {
      clientName,
      contact,
      serviceId,
      day: selectedSlot.day,
      start: selectedSlot.start,
      mode: selectedSlot.mode,
      homeAddress,
    });
    setError(result.error);
    if (result.booking) setConfirmation(result.booking);
  };

  if (confirmation) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090909] p-5 text-white">
        <section className="w-full max-w-xl rounded-[2rem] border border-emerald-300/25 bg-[#131414] p-7 text-center shadow-2xl sm:p-10">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-300/15 text-emerald-300">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-emerald-300">
            Demande en attente
          </p>
          <h1 className="mt-3 text-3xl font-black">Votre demande est prête.</h1>
          <p className="mt-4 text-sm leading-6 text-white/60">
            {confirmation.serviceName} · {dayLabel(confirmation.day)} à{" "}
            {confirmation.start} · {confirmation.end}
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 text-left text-sm">
            <p className="flex items-center justify-between gap-4">
              <span className="text-white/55">Statut</span>
              <strong className="text-amber-200">
                En attente de validation du barbier
              </strong>
            </p>
            <p className="mt-3 flex items-center justify-between gap-4">
              <span className="text-white/55">Total à régler sur place</span>
              <strong>{price(confirmation.totalMinor)}</strong>
            </p>
          </div>
          <div className="mt-7 rounded-2xl border border-white/10 bg-black/25 p-4 text-left text-sm leading-6 text-white/60">
            <ShieldCheck className="mr-2 inline h-4 w-4 text-[#D4AF37]" />
            Ceci est une démo locale : aucune réservation réelle, aucun e-mail,
            aucun paiement, aucune coordonnée et aucune adresse ne sont
            enregistrés.
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => downloadBookingCalendar(confirmation)}
              className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white/80 transition hover:border-white/35"
            >
              Ajouter au calendrier
            </button>
            <span className="grid place-items-center rounded-xl border border-white/10 px-4 py-3 text-center text-xs font-bold text-white/45">
              WhatsApp bientôt disponible
            </span>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setConfirmation(null);
                setStep(1);
                setAppointmentMode("");
                setSelectedSlotKey("");
                clearHomeAddress();
                setClientName("");
                setContact("");
              }}
              className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white/80"
            >
              Modifier la démo
            </button>
            <Link
              to="/freelancer-preview"
              className="flex-1 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black"
            >
              Voir l’espace barbier
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#090909] text-white">
      <header className="border-b border-white/10 bg-[#090909]/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
          <Link
            to="/freelancer-preview"
            className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Espace du barbier</span>
          </Link>
          <span className="shrink-0 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-black text-[#E4C76B]">
            Démo locale
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7 pb-32 sm:py-10 lg:pb-10">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#151516]">
          <div className="grid lg:grid-cols-[1.1fr_.9fr]">
            <div className="p-7 sm:p-10">
              <p className="text-xs font-black uppercase tracking-[.2em] text-[#D4AF37]">
                Barbier indépendant · Paris 11e
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                Amine Fade Studio
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/60">
                Dégradés précis, barbe soignée et rendez-vous simple à réserver.
                Choisissez votre prestation, votre lieu, votre créneau, puis
                confirmez.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 font-bold text-white/75">
                  <Star className="h-4 w-4 fill-[#D4AF37] text-[#D4AF37]" /> 4,9
                  · 38 avis
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 font-bold text-white/75">
                  <MapPin className="h-4 w-4 text-[#D4AF37]" /> Atelier
                  République
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 font-bold text-white/75">
                  <ShieldCheck className="h-4 w-4 text-[#D4AF37]" /> Paiement
                  sur place
                </span>
              </div>
            </div>
            <img
              src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1000&q=85"
              alt="Barbier réalisant une coupe"
              className="h-72 w-full object-cover lg:h-full"
            />
          </div>
        </section>

        <section
          id="reserver"
          className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#151516] shadow-2xl shadow-black/30"
        >
          <div className="border-b border-white/10 bg-black/15 px-5 py-5 sm:px-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[.2em] text-[#D4AF37]">
                  Réservation
                </p>
                <h2 className="mt-1 text-xl font-black">Étape {step} sur 3</h2>
              </div>
              <p className="text-right text-xs font-bold text-white/45">
                {bookingSteps[step - 1]}
              </p>
            </div>
            <ol
              aria-label="Progression de la réservation"
              className="mt-5 grid grid-cols-3 gap-2"
            >
              {bookingSteps.map((label, index) => {
                const currentStep = index + 1;
                const isCurrent = currentStep === step;
                const isComplete = currentStep < step;
                return (
                  <li key={label} className="min-w-0">
                    <div
                      className={`h-1.5 rounded-full ${isComplete || isCurrent ? "bg-[#D4AF37]" : "bg-white/10"}`}
                    />
                    <p
                      className={`mt-2 truncate text-[10px] font-black uppercase tracking-[.13em] ${isCurrent ? "text-[#E4C76B]" : isComplete ? "text-white/65" : "text-white/30"}`}
                    >
                      {currentStep}. {label}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="p-5 sm:p-8">
            {step === 1 && (
              <section aria-labelledby="booking-service-title">
                <p className="text-sm leading-6 text-white/60">
                  Commencez par la prestation que vous souhaitez réserver.
                </p>
                <h3
                  id="booking-service-title"
                  className="mt-3 text-2xl font-black"
                >
                  Quelle prestation vous convient ?
                </h3>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {options.services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => selectService(service.id)}
                      aria-pressed={serviceId === service.id}
                      className={`rounded-2xl border p-5 text-left transition ${serviceId === service.id ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-lg shadow-[#D4AF37]/5" : "border-white/10 bg-black/20 hover:border-white/25"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[.06] text-[#D4AF37]">
                          <Scissors className="h-5 w-5" />
                        </span>
                        <span className="text-lg font-black">
                          {price(service.priceMinor)}
                        </span>
                      </div>
                      <p className="mt-5 font-black">{service.name}</p>
                      <p className="mt-1 text-sm text-white/50">
                        {service.durationMinutes} min
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="booking-slot-title">
                <p className="text-sm leading-6 text-white/60">
                  {selectedService?.name} ·{" "}
                  {selectedService && price(selectedService.priceMinor)} ·{" "}
                  {selectedService?.durationMinutes} min
                </p>
                <h3
                  id="booking-slot-title"
                  className="mt-3 text-2xl font-black"
                >
                  Choisissez votre créneau
                </h3>
                <div className="mt-6">
                  <p className="text-sm font-black text-white/75">
                    Où souhaitez-vous le rendez-vous ?
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {availableModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => selectAppointmentMode(mode.id)}
                        aria-pressed={appointmentMode === mode.id}
                        className={`rounded-2xl border p-4 text-left transition ${appointmentMode === mode.id ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-lg shadow-[#D4AF37]/5" : "border-white/10 bg-black/20 hover:border-white/25"}`}
                      >
                        <span className="text-sm font-black">{mode.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/50">
                          {mode.detail}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {appointmentMode ? (
                  <div className="mt-7">
                    {appointmentMode === "home" && (
                      <fieldset className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[.06] p-4">
                        <legend className="px-1 text-sm font-black text-white/85">
                          Adresse du rendez-vous
                        </legend>
                        <p className="mt-1 text-xs leading-5 text-white/55">
                          Nécessaire pour permettre au barbier de vous
                          rejoindre. Zone desservie : Paris 11e et 12e ·
                          supplément domicile : {price(travelQuote.feeMinor)}.
                        </p>
                        <label className="mt-4 block text-xs font-bold text-white/65">
                          Adresse
                          <input
                            required
                            value={homeAddressLine}
                            onChange={(event) => {
                              setHomeAddressLine(event.currentTarget.value);
                              setError(null);
                            }}
                            placeholder="Ex. 12 rue Oberkampf"
                            autoComplete="street-address"
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D4AF37]"
                          />
                        </label>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[.7fr_1.3fr]">
                          <label className="block text-xs font-bold text-white/65">
                            Code postal
                            <input
                              required
                              value={homePostalCode}
                              onChange={(event) => {
                                setHomePostalCode(event.currentTarget.value);
                                setError(null);
                              }}
                              inputMode="numeric"
                              autoComplete="postal-code"
                              placeholder="75011"
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D4AF37]"
                            />
                          </label>
                          <label className="block text-xs font-bold text-white/65">
                            Ville
                            <input
                              required
                              value={homeCity}
                              onChange={(event) => {
                                setHomeCity(event.currentTarget.value);
                                setError(null);
                              }}
                              autoComplete="address-level2"
                              placeholder="Paris"
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D4AF37]"
                            />
                          </label>
                        </div>
                        <label className="mt-3 block text-xs font-bold text-white/65">
                          Complément d’adresse{" "}
                          <span className="font-medium text-white/35">
                            (facultatif)
                          </span>
                          <input
                            value={homeAddressDetails}
                            onChange={(event) =>
                              setHomeAddressDetails(event.currentTarget.value)
                            }
                            placeholder="Bâtiment, étage, digicode…"
                            autoComplete="address-line2"
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D4AF37]"
                          />
                        </label>
                        {homePostalCode && !travelQuote.available && (
                          <p
                            role="status"
                            className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs leading-5 text-rose-100"
                          >
                            Hors zone pour cette démo. Les rendez-vous à
                            domicile sont disponibles à Paris 11e et 12e.
                          </p>
                        )}
                        {homePostalCode && travelQuote.available && (
                          <p
                            role="status"
                            className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs leading-5 text-emerald-100"
                          >
                            Adresse dans la zone desservie · supplément
                            déplacement {price(travelQuote.feeMinor)}.
                          </p>
                        )}
                        <p className="mt-3 text-[11px] leading-5 text-white/40">
                          Démo locale : l’adresse reste dans ce navigateur et
                          n’est envoyée à personne.
                        </p>
                      </fieldset>
                    )}
                    <p className="text-sm font-black text-white/75">
                      Quand souhaitez-vous venir ?
                    </p>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {dates.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSelectedDay(day);
                            setSelectedSlotKey("");
                            setError(null);
                          }}
                          aria-pressed={selectedDay === day}
                          className={`min-w-24 rounded-xl border px-3 py-3 text-xs font-black transition ${selectedDay === day ? "border-[#D4AF37] bg-[#D4AF37] text-black" : "border-white/10 bg-black/20 text-white/60 hover:text-white"}`}
                        >
                          {dayLabel(day)}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {slotsForDay.map((slot) => {
                        const slotKey = publicBookingSlotKey(slot);
                        return (
                          <button
                            key={slotKey}
                            type="button"
                            onClick={() => {
                              setSelectedSlotKey(slotKey);
                              setError(null);
                            }}
                            aria-pressed={selectedSlotKey === slotKey}
                            className={`rounded-xl border px-3 py-3 text-sm font-black transition ${selectedSlotKey === slotKey ? "border-[#D4AF37] bg-[#D4AF37] text-black" : "border-white/10 bg-black/20 text-white/75 hover:border-white/25"}`}
                          >
                            <Clock3 className="mr-1 inline h-4 w-4" />
                            {slot.start}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                    Choisissez d’abord le lieu du rendez-vous pour voir les
                    disponibilités.
                  </p>
                )}
              </section>
            )}

            {selectedService && (
              <aside
                aria-label="Récapitulatif de la demande"
                className="mt-7 hidden rounded-2xl border border-white/10 bg-black/20 p-5 lg:block"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[#D4AF37]">
                    Votre récapitulatif
                  </p>
                  <strong className="text-lg">{price(totalMinor)}</strong>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-white/45">Prestation</dt>
                    <dd className="mt-1 font-bold">{selectedService.name}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Lieu</dt>
                    <dd className="mt-1 font-bold">{selectedLocation}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Créneau</dt>
                    <dd className="mt-1 font-bold">
                      {selectedSlot
                        ? `${dayLabel(selectedSlot.day)} · ${selectedSlot.start}`
                        : "À choisir"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Déplacement</dt>
                    <dd className="mt-1 font-bold">
                      {appointmentMode === "home"
                        ? travelQuote.available
                          ? price(travelFeeMinor)
                          : "Hors zone"
                        : "Inclus"}
                    </dd>
                  </div>
                </dl>
              </aside>
            )}

            {step === 3 && (
              <form onSubmit={submit} aria-labelledby="booking-details-title">
                <p className="text-sm leading-6 text-white/60">
                  Vérifiez votre demande puis ajoutez vos coordonnées.
                </p>
                <h3
                  id="booking-details-title"
                  className="mt-3 text-2xl font-black"
                >
                  Dernière étape
                </h3>
                <div className="mt-6 space-y-3 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[.06] p-4 text-sm">
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Prestation</span>
                    <strong className="text-right">
                      {selectedService?.name}
                    </strong>
                  </p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Horaire</span>
                    <strong className="text-right">
                      {selectedSlot &&
                        `${dayLabel(selectedSlot.day)} · ${selectedSlot.start}`}
                    </strong>
                  </p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Lieu</span>
                    <strong className="text-right">{selectedLocation}</strong>
                  </p>
                  {selectedSlot?.mode === "home" && (
                    <p className="flex items-center justify-between gap-4">
                      <span className="text-white/55">Déplacement</span>
                      <strong className="text-right">
                        {price(travelFeeMinor)}
                      </strong>
                    </p>
                  )}
                  <p className="flex items-center justify-between gap-4 border-t border-white/10 pt-3 text-base">
                    <span className="font-bold text-white/75">
                      Total sur place
                    </span>
                    <strong className="text-right">{price(totalMinor)}</strong>
                  </p>
                </div>
                <label className="mt-5 block text-xs font-bold text-white/60">
                  Votre prénom
                  <input
                    required
                    value={clientName}
                    onChange={(event) =>
                      setClientName(event.currentTarget.value)
                    }
                    placeholder="Ex. Amine"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D4AF37]"
                  />
                </label>
                <label className="mt-4 block text-xs font-bold text-white/60">
                  Téléphone
                  <input
                    required
                    value={contact}
                    onChange={(event) => setContact(event.currentTarget.value)}
                    inputMode="tel"
                    placeholder="06 …"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-white/25 focus:border-[#D4AF37]"
                  />
                </label>
                {error && (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm text-rose-100"
                  >
                    {error}
                  </p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-3 pb-24 sm:flex-row sm:justify-between lg:pb-0">
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white/80"
                  >
                    <ChevronLeft className="h-4 w-4" /> Retour
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3.5 text-sm font-black text-black transition hover:bg-[#ecd36e]"
                  >
                    Confirmer ma demande <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-4 text-xs leading-5 text-white/45">
                  Aucun paiement n’est demandé. Dans cette démo, votre demande
                  n’est envoyée à personne et vos coordonnées, y compris votre
                  adresse, restent dans cette page.
                </p>
              </form>
            )}

            {step < 3 && (
              <>
                {error && (
                  <p
                    role="alert"
                    className="mt-5 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm text-rose-100"
                  >
                    {error}
                  </p>
                )}
                <div className="mt-7 flex flex-col-reverse gap-3 pb-24 sm:flex-row sm:justify-between lg:pb-0">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={goBack}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white/80"
                    >
                      <ChevronLeft className="h-4 w-4" /> Retour
                    </button>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <button
                    type="button"
                    onClick={continueBooking}
                    disabled={step === 1 ? !serviceId : !selectedSlotKey}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3.5 text-sm font-black text-black transition hover:bg-[#ecd36e] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {step === 1 ? "Choisir un créneau" : "Continuer"}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {selectedService && (
          <aside
            aria-label="Récapitulatif mobile"
            className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-[#D4AF37]/35 bg-[#151516]/95 p-4 shadow-2xl shadow-black/70 backdrop-blur lg:hidden"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">
                  {selectedService.name}
                </p>
                <p className="mt-1 truncate text-xs text-white/55">
                  {selectedLocation} ·{" "}
                  {selectedSlot
                    ? `${dayLabel(selectedSlot.day)} · ${selectedSlot.start}`
                    : "Créneau à choisir"}
                </p>
              </div>
              <strong className="shrink-0 text-lg text-[#E4C76B]">
                {price(totalMinor)}
              </strong>
            </div>
          </aside>
        )}

        <section className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-[#151516] p-5">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#D4AF37]">
              Zone
            </p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Les rendez-vous à domicile sont proposés à Paris 11e et 12e.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-[#151516] p-5">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#D4AF37]">
              Paiement
            </p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Aucun paiement en ligne : réglez directement sur place.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-[#151516] p-5">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#D4AF37]">
              Annulation
            </p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Prévenez le barbier au moins 24 h avant le rendez-vous.
            </p>
          </article>
        </section>

        <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-white/10 bg-[#151516] p-5 sm:p-6">
          <h2 className="font-black">Des clients satisfaits</h2>
          <blockquote className="mt-4 text-sm leading-6 text-white/65">
            « Très ponctuel, dégradé impeccable et super accueil. »{" "}
            <footer className="mt-2 text-xs font-black text-[#D4AF37]">
              Yanis · Dégradé signature
            </footer>
          </blockquote>
        </section>
      </main>
    </div>
  );
}
