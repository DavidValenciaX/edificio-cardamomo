import { FormEvent, useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { FaqItem, NearbyPlace, PublicContent, PublicPolicies } from "../types";
import { Plus, Save, Trash2 } from "lucide-react";

interface PublicContentEditorProps {
  content: PublicContent;
  onSaved: (content: PublicContent) => void;
}

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

export default function PublicContentEditor({ content, onSaved }: PublicContentEditorProps) {
  const [draft, setDraft] = useState<PublicContent>(content);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
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
  };

  const updateFaqItem = (id: string, key: "question" | "answer", value: string) => {
    setDraft((current) => ({
      ...current,
      faqItems: current.faqItems.map((item) => (
        item.id === id ? { ...item, [key]: value } : item
      )),
    }));
  };

  const updateNearbyPlace = (id: string, key: keyof Omit<NearbyPlace, "id">, value: string) => {
    setDraft((current) => ({
      ...current,
      nearbyPlaces: current.nearbyPlaces.map((place) => (
        place.id === id ? { ...place, [key]: value } : place
      )),
    }));
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    const normalizedDraft: PublicContent = {
      ...draft,
      intro: draft.intro.trim(),
      policies: policyFields.reduce<PublicPolicies>((policies, { key }) => ({
        ...policies,
        [key]: draft.policies[key].trim(),
      }), {} as PublicPolicies),
      faqItems: draft.faqItems
        .map((item) => ({
          ...item,
          question: item.question.trim(),
          answer: item.answer.trim(),
        }))
        .filter((item) => item.question && item.answer),
      nearbyPlaces: draft.nearbyPlaces
        .map((place) => ({
          ...place,
          category: place.category.trim(),
          name: place.name.trim(),
          description: place.description.trim(),
          address: place.address.trim(),
          distance: place.distance.trim(),
          mapUrl: place.mapUrl.trim(),
        }))
        .filter((place) => place.name),
    };

    try {
      await setDoc(doc(db, "publicContent", "global"), normalizedDraft);
      setDraft(normalizedDraft);
      onSaved(normalizedDraft);
      alert("Información pública actualizada correctamente.");
    } catch (error) {
      console.error("Public content save failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, "publicContent/global");
      setSaveError("No se pudo guardar la información pública. Verifica los permisos de Firestore.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-warm-border rounded-xl p-4 shadow-sm space-y-4">
      <div>
        <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dark leading-none">
          Información pública y preguntas frecuentes
        </h3>
        <p className="text-[9px] text-dark-muted font-medium mt-1">
          Este contenido aparece en la página pública. Las respuestas se guardan separadas de la configuración interna.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5 text-xs font-medium">
        <div>
          <label htmlFor="public-content-intro" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1">
            Introducción
          </label>
          <textarea
            id="public-content-intro"
            required
            rows={3}
            maxLength={500}
            value={draft.intro}
            onChange={(event) => setDraft((current) => ({ ...current, intro: event.target.value }))}
            className="w-full bg-warm-card border border-warm-border rounded-lg p-2 text-[10px] text-dark leading-relaxed focus:outline-none focus:border-secondary"
          />
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-[9px] text-secondary font-mono uppercase font-bold tracking-widest">Información importante</span>
            <p className="text-[8px] text-dark-muted mt-1">Edita aquí las políticas generales del edificio.</p>
          </div>
          <div className="space-y-3">
            {policyFields.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`public-policy-${key}`} className="text-[8px] font-bold text-dark-muted uppercase block mb-1">
                  {label}
                </label>
                <textarea
                  id={`public-policy-${key}`}
                  required
                  rows={3}
                  maxLength={2000}
                  value={draft.policies[key]}
                  onChange={(event) => updatePolicy(key, event.target.value)}
                  className="w-full bg-white border border-warm-border rounded-lg p-2 text-[10px] text-dark leading-relaxed focus:outline-none focus:border-secondary"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-warm-border pt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[9px] text-secondary font-mono uppercase font-bold tracking-widest">Preguntas frecuentes</span>
              <p className="text-[8px] text-dark-muted mt-1">Agrega respuestas ampliadas para las dudas que más recibes.</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft((current) => ({ ...current, faqItems: [...current.faqItems, emptyFaqItem()] }))}
              className="inline-flex items-center gap-1 bg-secondary hover:bg-secondary-hover text-warm-bg px-2 py-1.5 rounded text-[9px] font-bold shrink-0"
            >
              <Plus className="w-3 h-3" />
              Añadir FAQ
            </button>
          </div>

          {draft.faqItems.length === 0 ? (
            <p className="text-[9px] text-dark-muted bg-warm-card border border-dashed border-warm-border rounded-lg p-3 text-center">
              Todavía no hay preguntas ampliadas.
            </p>
          ) : (
            <div className="space-y-3">
              {draft.faqItems.map((item, index) => (
                <div key={item.id} className="bg-warm-card border border-warm-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-dark uppercase">Pregunta {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setDraft((current) => ({
                        ...current,
                        faqItems: current.faqItems.filter((faq) => faq.id !== item.id),
                      }))}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-[9px] font-bold"
                    >
                      <Trash2 className="w-3 h-3" />
                      Quitar
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    placeholder="Ej: ¿Puedo llegar antes del horario establecido?"
                    value={item.question}
                    onChange={(event) => updateFaqItem(item.id, "question", event.target.value)}
                    className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark focus:outline-none focus:border-secondary"
                  />
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    placeholder="Escribe una respuesta clara para los huéspedes."
                    value={item.answer}
                    onChange={(event) => updateFaqItem(item.id, "answer", event.target.value)}
                    className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark leading-relaxed focus:outline-none focus:border-secondary"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-warm-border pt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[9px] text-secondary font-mono uppercase font-bold tracking-widest">Guía del sector</span>
              <p className="text-[8px] text-dark-muted mt-1">Agrega restaurantes, tiendas, cajeros, gimnasios, transporte y otros lugares útiles.</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft((current) => ({ ...current, nearbyPlaces: [...current.nearbyPlaces, emptyNearbyPlace()] }))}
              className="inline-flex items-center gap-1 bg-secondary hover:bg-secondary-hover text-warm-bg px-2 py-1.5 rounded text-[9px] font-bold shrink-0"
            >
              <Plus className="w-3 h-3" />
              Añadir lugar
            </button>
          </div>

          {draft.nearbyPlaces.length === 0 ? (
            <p className="text-[9px] text-dark-muted bg-warm-card border border-dashed border-warm-border rounded-lg p-3 text-center">
              Todavía no hay lugares en la guía.
            </p>
          ) : (
            <div className="space-y-3">
              {draft.nearbyPlaces.map((place, index) => (
                <div key={place.id} className="bg-warm-card border border-warm-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-dark uppercase">Lugar {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setDraft((current) => ({
                        ...current,
                        nearbyPlaces: current.nearbyPlaces.filter((nearbyPlace) => nearbyPlace.id !== place.id),
                      }))}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-[9px] font-bold"
                    >
                      <Trash2 className="w-3 h-3" />
                      Quitar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      maxLength={80}
                      placeholder="Categoría"
                      value={place.category}
                      onChange={(event) => updateNearbyPlace(place.id, "category", event.target.value)}
                      className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark focus:outline-none focus:border-secondary"
                    />
                    <input
                      type="text"
                      required
                      maxLength={150}
                      placeholder="Nombre del lugar"
                      value={place.name}
                      onChange={(event) => updateNearbyPlace(place.id, "name", event.target.value)}
                      className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Descripción breve"
                    value={place.description}
                    onChange={(event) => updateNearbyPlace(place.id, "description", event.target.value)}
                    className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark leading-relaxed focus:outline-none focus:border-secondary"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      maxLength={250}
                      placeholder="Dirección o ubicación"
                      value={place.address}
                      onChange={(event) => updateNearbyPlace(place.id, "address", event.target.value)}
                      className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark focus:outline-none focus:border-secondary"
                    />
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="Distancia o tiempo aproximado"
                      value={place.distance}
                      onChange={(event) => updateNearbyPlace(place.id, "distance", event.target.value)}
                      className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <input
                    type="url"
                    maxLength={1000}
                    placeholder="https://www.google.com/maps/..."
                    value={place.mapUrl}
                    onChange={(event) => updateNearbyPlace(place.id, "mapUrl", event.target.value)}
                    className="w-full bg-white border border-warm-border rounded p-2 text-[10px] text-dark font-mono focus:outline-none focus:border-secondary"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {saveError && (
          <p className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            {saveError}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-warm-bg py-2.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all font-sans"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Guardando..." : "Guardar información pública"}</span>
        </button>
      </form>
    </section>
  );
}
