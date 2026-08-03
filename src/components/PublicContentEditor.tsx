import { FormEvent, useEffect, useRef, useState } from "react";
import { doc, runTransaction } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { buildDefaultPublicContent, normalizePublicContent } from "../data";
import { FaqItem, NearbyPlace, PublicContent, PublicPolicies } from "../types";
import { CircleHelp, Info, MapPinned, Plus, Save, Trash2, type LucideIcon } from "lucide-react";

interface PublicContentEditorProps {
  content: PublicContent;
  onSaved: (content: PublicContent) => void;
}

type ContentEditorSection = "information" | "faq" | "nearby";

const contentSections: Array<{ id: ContentEditorSection; label: string; description: string; icon: LucideIcon }> = [
  { id: "information", label: "Información", description: "Políticas y condiciones", icon: Info },
  { id: "faq", label: "Preguntas frecuentes", description: "Respuestas para huéspedes", icon: CircleHelp },
  { id: "nearby", label: "Guía del sector", description: "Lugares y rutas cercanas", icon: MapPinned },
];

const policyFields: Array<{ key: keyof PublicPolicies; label: string }> = [
  { key: "parking", label: "Parqueadero" },
  { key: "breakfast", label: "Desayuno" },
  { key: "checkIn", label: "Horario de check-in" },
  { key: "checkOut", label: "Horario de checkout" },
  { key: "earlyArrival", label: "Llegada anticipada" },
  { key: "lateDeparture", label: "Salida tardía" },
  { key: "partialStayDiscount", label: "Llegada tarde o salida temprano" },
  { key: "reception", label: "Recepción" },
  { key: "selfCheckIn", label: "Llegada autónoma" },
  { key: "electronicInvoice", label: "Factura electrónica" },
];

const createEditorId = (prefix: string): string => (
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

const emptyFaqItem = (): FaqItem => ({
  id: createEditorId("faq"),
  question: "",
  answer: "",
});

const emptyNearbyPlace = (): NearbyPlace => ({
  id: createEditorId("place"),
  category: "",
  name: "",
  description: "",
  address: "",
  distance: "",
  mapUrl: "",
});

const fieldClassName = "w-full rounded-xl border border-warm-border bg-white px-4 py-3 text-sm leading-6 text-dark placeholder:text-dark-muted/70";
const compactFieldClassName = "min-h-11 w-full rounded-xl border border-warm-border bg-white px-4 text-sm text-dark placeholder:text-dark-muted/70";

export default function PublicContentEditor({ content, onSaved }: PublicContentEditorProps) {
  const [draft, setDraft] = useState<PublicContent>(content);
  const [activeSection, setActiveSection] = useState<ContentEditorSection>("information");
  const [savingSection, setSavingSection] = useState<ContentEditorSection | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const skipNextContentSync = useRef(false);

  useEffect(() => {
    if (skipNextContentSync.current) {
      skipNextContentSync.current = false;
      return;
    }
    setDraft(content);
  }, [content]);

  const updatePolicy = (key: keyof PublicPolicies, value: string) => {
    setDraft((current) => ({
      ...current,
      policies: {
        ...current.policies,
        [key]: value,
      },
    }));
    setSaveFeedback("");
  };

  const updateFaqItem = (id: string, key: "question" | "answer", value: string) => {
    setDraft((current) => ({
      ...current,
      faqItems: current.faqItems.map((item) => (
        item.id === id ? { ...item, [key]: value } : item
      )),
    }));
    setSaveFeedback("");
  };

  const updateNearbyPlace = (id: string, key: keyof Omit<NearbyPlace, "id">, value: string) => {
    setDraft((current) => ({
      ...current,
      nearbyPlaces: current.nearbyPlaces.map((place) => (
        place.id === id ? { ...place, [key]: value } : place
      )),
    }));
    setSaveFeedback("");
  };

  const saveContentSection = async (
    section: ContentEditorSection,
    buildNextContent: (persistedContent: PublicContent) => PublicContent,
    successMessage: string,
  ) => {
    setSavingSection(section);
    setSaveError("");
    setSaveFeedback("");

    try {
      const contentRef = doc(db, "publicContent", "global");
      const savedContent = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(contentRef);
        const persistedContent = snapshot.exists()
          ? normalizePublicContent(snapshot.data())
          : buildDefaultPublicContent();
        const nextContent = buildNextContent(persistedContent);

        transaction.set(contentRef, nextContent);
        return nextContent;
      });

      const normalizedSavedContent = normalizePublicContent(savedContent);
      setDraft((current) => {
        if (section === "information") {
          return { ...current, intro: normalizedSavedContent.intro, policies: normalizedSavedContent.policies };
        }
        if (section === "faq") {
          return { ...current, faqItems: normalizedSavedContent.faqItems };
        }
        return { ...current, nearbyPlaces: normalizedSavedContent.nearbyPlaces };
      });
      skipNextContentSync.current = true;
      onSaved(normalizedSavedContent);
      setSaveFeedback(successMessage);
    } catch (error) {
      console.error("Public content save failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, "publicContent/global");
      setSaveError("No se pudo guardar esta sección. Verifica los permisos de Firestore e inténtalo de nuevo.");
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveInformation = (event: FormEvent) => {
    event.preventDefault();
    const normalizedInformation = {
      intro: draft.intro.trim(),
      policies: policyFields.reduce<PublicPolicies>((policies, { key }) => ({
        ...policies,
        [key]: draft.policies[key].trim(),
      }), {} as PublicPolicies),
    };

    void saveContentSection(
      "information",
      (persistedContent) => ({ ...persistedContent, ...normalizedInformation }),
      "Información guardada correctamente.",
    );
  };

  const handleSaveFaq = (event: FormEvent) => {
    event.preventDefault();
    const faqItems = draft.faqItems
      .map((item) => ({
        ...item,
        question: item.question.trim(),
        answer: item.answer.trim(),
      }))
      .filter((item) => item.question && item.answer);

    void saveContentSection(
      "faq",
      (persistedContent) => ({ ...persistedContent, faqItems }),
      "Preguntas frecuentes guardadas correctamente.",
    );
  };

  const handleSaveNearby = (event: FormEvent) => {
    event.preventDefault();
    const nearbyPlaces = draft.nearbyPlaces
      .map((place) => ({
        ...place,
        category: place.category.trim(),
        name: place.name.trim(),
        description: place.description.trim(),
        address: place.address.trim(),
        distance: place.distance.trim(),
        mapUrl: place.mapUrl.trim(),
      }))
      .filter((place) => place.name);

    void saveContentSection(
      "nearby",
      (persistedContent) => ({ ...persistedContent, nearbyPlaces }),
      "Guía del sector guardada correctamente.",
    );
  };

  const isSaving = (section: ContentEditorSection) => savingSection === section;

  return (
    <section className="space-y-6 rounded-3xl border border-warm-border bg-white p-5 shadow-sm md:p-8" aria-labelledby="public-content-title">
      <header className="border-b border-warm-border pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Contenido público</p>
        <h3 id="public-content-title" className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em] text-dark">
          Información que verá el huésped
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-dark-muted">
          Edita una sección a la vez. Cada botón guarda únicamente la información de la sección activa.
        </p>
      </header>

      <nav className="grid gap-2 rounded-2xl border border-warm-border bg-warm-card/60 p-2 sm:grid-cols-3" role="tablist" aria-label="Secciones de contenido público">
        {contentSections.map((section) => {
          const SectionIcon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              id={`public-content-tab-${section.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`public-content-panel-${section.id}`}
              onClick={() => {
                setActiveSection(section.id);
                setSaveError("");
                setSaveFeedback("");
              }}
              className={`flex min-h-16 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                isActive ? "bg-secondary text-warm-bg shadow-sm" : "text-dark-muted hover:bg-white hover:text-dark"
              }`}
            >
              <SectionIcon className={`h-5 w-5 shrink-0 ${isActive ? "text-accent" : "text-secondary"}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{section.label}</span>
                <span className={`mt-0.5 block truncate text-xs ${isActive ? "text-warm-bg/70" : "text-dark-muted"}`}>{section.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {saveFeedback && <p className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary" role="status" aria-live="polite">{saveFeedback}</p>}
      {saveError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{saveError}</p>}

      {activeSection === "information" && (
        <form id="public-content-panel-information" onSubmit={handleSaveInformation} className="space-y-6" role="tabpanel" aria-labelledby="public-content-tab-information">
          <div>
            <label htmlFor="public-content-intro" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Introducción</label>
            <textarea
              id="public-content-intro"
              name="publicIntro"
              autoComplete="off"
              required
              rows={3}
              maxLength={500}
              value={draft.intro}
              onChange={(event) => {
                setDraft((current) => ({ ...current, intro: event.target.value }));
                setSaveFeedback("");
              }}
              className={fieldClassName}
            />
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-display text-2xl font-semibold text-dark">Políticas del edificio</h4>
              <p className="mt-1 text-sm leading-6 text-dark-muted">Estas respuestas aparecen en la sección de información antes de reservar.</p>
            </div>
            <div className="grid gap-4">
              {policyFields.map(({ key, label }) => (
                <div key={key}>
                  <label htmlFor={`public-policy-${key}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">{label}</label>
                  <textarea
                    id={`public-policy-${key}`}
                    name={`policy-${key}`}
                    autoComplete="off"
                    required
                    rows={4}
                    maxLength={2000}
                    value={draft.policies[key]}
                    onChange={(event) => updatePolicy(key, event.target.value)}
                    className={fieldClassName}
                  />
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={savingSection !== null} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-warm-bg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving("information") ? "Guardando información…" : "Guardar información"}
          </button>
        </form>
      )}

      {activeSection === "faq" && (
        <form id="public-content-panel-faq" onSubmit={handleSaveFaq} className="space-y-6" role="tabpanel" aria-labelledby="public-content-tab-faq">
          <div className="flex flex-col gap-4 border-b border-warm-border pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="font-display text-2xl font-semibold text-dark">Preguntas frecuentes</h4>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-dark-muted">Crea respuestas claras para las dudas que más reciben los huéspedes.</p>
            </div>
            <button type="button" onClick={() => setDraft((current) => ({ ...current, faqItems: [...current.faqItems, emptyFaqItem()] }))} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold text-warm-bg transition-colors hover:bg-secondary-hover">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Añadir pregunta
            </button>
          </div>

          {draft.faqItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-warm-border bg-warm-card p-6 text-center text-sm leading-6 text-dark-muted">Todavía no hay preguntas. Añade la primera para publicarla en la landing.</p>
          ) : (
            <div className="space-y-4">
              {draft.faqItems.map((item, index) => (
                <article key={item.id} className="space-y-4 rounded-2xl border border-warm-border bg-warm-card/60 p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-bold uppercase tracking-[0.12em] text-dark">Pregunta {index + 1}</h5>
                    <button type="button" onClick={() => setDraft((current) => ({ ...current, faqItems: current.faqItems.filter((faq) => faq.id !== item.id) }))} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-50">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Quitar
                    </button>
                  </div>
                  <div>
                    <label htmlFor={`faq-question-${item.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Pregunta</label>
                    <input id={`faq-question-${item.id}`} name={`faqQuestion-${item.id}`} autoComplete="off" type="text" required maxLength={200} placeholder="Ej: ¿Puedo llegar antes del horario establecido?" value={item.question} onChange={(event) => updateFaqItem(item.id, "question", event.target.value)} className={compactFieldClassName} />
                  </div>
                  <div>
                    <label htmlFor={`faq-answer-${item.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Respuesta</label>
                    <textarea id={`faq-answer-${item.id}`} name={`faqAnswer-${item.id}`} autoComplete="off" required rows={4} maxLength={2000} placeholder="Escribe una respuesta clara para los huéspedes…" value={item.answer} onChange={(event) => updateFaqItem(item.id, "answer", event.target.value)} className={fieldClassName} />
                  </div>
                </article>
              ))}
            </div>
          )}

          <button type="submit" disabled={savingSection !== null} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-warm-bg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving("faq") ? "Guardando preguntas…" : "Guardar preguntas frecuentes"}
          </button>
        </form>
      )}

      {activeSection === "nearby" && (
        <form id="public-content-panel-nearby" onSubmit={handleSaveNearby} className="space-y-6" role="tabpanel" aria-labelledby="public-content-tab-nearby">
          <div className="flex flex-col gap-4 border-b border-warm-border pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="font-display text-2xl font-semibold text-dark">Guía del sector</h4>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-dark-muted">Administra los lugares útiles que aparecen alrededor de Cardamomo.</p>
            </div>
            <button type="button" onClick={() => setDraft((current) => ({ ...current, nearbyPlaces: [...current.nearbyPlaces, emptyNearbyPlace()] }))} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold text-warm-bg transition-colors hover:bg-secondary-hover">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Añadir lugar
            </button>
          </div>

          {draft.nearbyPlaces.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-warm-border bg-warm-card p-6 text-center text-sm leading-6 text-dark-muted">Todavía no hay lugares en la guía. Añade el primero para mostrarlo en la landing.</p>
          ) : (
            <div className="space-y-4">
              {draft.nearbyPlaces.map((place, index) => (
                <article key={place.id} className="space-y-4 rounded-2xl border border-warm-border bg-warm-card/60 p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-bold uppercase tracking-[0.12em] text-dark">Lugar {index + 1}</h5>
                    <button type="button" onClick={() => setDraft((current) => ({ ...current, nearbyPlaces: current.nearbyPlaces.filter((nearbyPlace) => nearbyPlace.id !== place.id) }))} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-50">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Quitar
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`nearby-category-${place.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Categoría</label>
                      <input id={`nearby-category-${place.id}`} name={`nearbyCategory-${place.id}`} autoComplete="off" type="text" required maxLength={80} placeholder="Ej: Compras" value={place.category} onChange={(event) => updateNearbyPlace(place.id, "category", event.target.value)} className={compactFieldClassName} />
                    </div>
                    <div>
                      <label htmlFor={`nearby-name-${place.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Nombre del lugar</label>
                      <input id={`nearby-name-${place.id}`} name={`nearbyName-${place.id}`} autoComplete="off" type="text" required maxLength={150} placeholder="Ej: Centro Comercial Único" value={place.name} onChange={(event) => updateNearbyPlace(place.id, "name", event.target.value)} className={compactFieldClassName} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`nearby-description-${place.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Descripción</label>
                    <textarea id={`nearby-description-${place.id}`} name={`nearbyDescription-${place.id}`} autoComplete="off" rows={3} maxLength={500} placeholder="Descripción breve del lugar…" value={place.description} onChange={(event) => updateNearbyPlace(place.id, "description", event.target.value)} className={fieldClassName} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`nearby-address-${place.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Dirección o ubicación</label>
                      <input id={`nearby-address-${place.id}`} name={`nearbyAddress-${place.id}`} autoComplete="street-address" type="text" maxLength={250} placeholder="Ej: Neiva, Huila" value={place.address} onChange={(event) => updateNearbyPlace(place.id, "address", event.target.value)} className={compactFieldClassName} />
                    </div>
                    <div>
                      <label htmlFor={`nearby-distance-${place.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Distancia o tiempo</label>
                      <input id={`nearby-distance-${place.id}`} name={`nearbyDistance-${place.id}`} autoComplete="off" type="text" maxLength={100} placeholder="Ej: 8 minutos en carro" value={place.distance} onChange={(event) => updateNearbyPlace(place.id, "distance", event.target.value)} className={compactFieldClassName} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`nearby-map-${place.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-dark-muted">Enlace de Google Maps</label>
                    <input id={`nearby-map-${place.id}`} name={`nearbyMap-${place.id}`} autoComplete="url" type="url" maxLength={1000} placeholder="https://www.google.com/maps/…" value={place.mapUrl} onChange={(event) => updateNearbyPlace(place.id, "mapUrl", event.target.value)} className={`${compactFieldClassName} font-mono`} />
                  </div>
                </article>
              ))}
            </div>
          )}

          <button type="submit" disabled={savingSection !== null} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-warm-bg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving("nearby") ? "Guardando guía…" : "Guardar guía del sector"}
          </button>
        </form>
      )}
    </section>
  );
}
