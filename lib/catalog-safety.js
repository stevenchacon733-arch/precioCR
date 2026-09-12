import { normalizeText } from "@/lib/car";

const SAFE_SUPPLEMENT_TERMS = [
  "creatina",
  "creatine",
  "proteina",
  "protein",
  "whey",
  "electrolito",
  "electrolyte",
  "colageno",
  "collagen",
  "multivitamin",
  "multivitaminico",
  "magnesio",
  "magnesium",
  "vitamina",
  "vitamin",
  "barra proteica",
  "protein bar",
];

const BLOCKED_SUPPLEMENT_TERMS = [
  "pre workout",
  "preworkout",
  "pre entreno",
  "preentreno",
  "fat burner",
  "quemador",
  "termogenico",
  "testosterone",
  "testosterona",
  "hormonal",
  "prohormone",
  "prohormona",
  "sarm",
  "sarms",
  "steroid",
  "esteroide",
  "anabolic",
  "anabolico",
  "dmaa",
  "dmha",
  "efedrina",
  "ephedra",
];

// PrecioCR solo compara medicamentos de venta libre (OTC) y de síntomas
// comunes. Cualquier medicamento controlado, de receta estricta, hormonal
// fuerte o de abuso queda bloqueado, sin importar que aparezca mencionado
// junto a un término permitido.
const SAFE_MEDICATION_TERMS = [
  "acetaminofen",
  "acetaminofén",
  "paracetamol",
  "ibuprofeno",
  "ibuprofen",
  "aspirina",
  "acido acetilsalicilico",
  "naproxeno",
  "diclofenaco",
  "loratadina",
  "cetirizina",
  "clorfenamina",
  "clorfeniramina",
  "difenhidramina",
  "desloratadina",
  "omeprazol",
  "ranitidina",
  "esomeprazol",
  "simeticona",
  "loperamida",
  "dimenhidrinato",
  "dextrometorfano",
  "guaifenesina",
  "suero oral",
  "sales de rehidratacion",
  "electrolito",
  "electrolyte",
  "vitamina c",
  "vitamina d",
  "complejo b",
  "acido folico",
  "multivitaminico",
  "multivitamin",
  "melatonina",
  "hidrocortisona",
  "clotrimazol",
  "antiacido",
  "alka seltzer",
  "panadol",
  "tylenol",
  "advil",
  "aleve",
  "vick",
  "curita",
  "gasa",
  "alcohol en gel",
  "alcohol antiseptico",
  "suero fisiologico",
  "jarabe para la tos",
  "antigripal",
];

const BLOCKED_MEDICATION_TERMS = [
  "receta",
  "prescripcion",
  "morfina",
  "codeina",
  "fentanilo",
  "fentanyl",
  "oxicodona",
  "oxycontin",
  "tramadol",
  "metadona",
  "diazepam",
  "alprazolam",
  "clonazepam",
  "lorazepam",
  "midazolam",
  "benzodiazepina",
  "anfetamina",
  "metilfenidato",
  "ritalin",
  "adderall",
  "esteroide",
  "anabolico",
  "anabolic",
  "testosterona",
  "insulina",
  "quimioterapia",
  "citostatico",
  "sildenafil",
  "viagra",
  "tadalafil",
  "misoprostol",
  "anticonceptivo",
  "levotiroxina",
  "warfarina",
  "clopidogrel",
  "antipsicotico",
  "antidepresivo",
  "ozempic",
  "mounjaro",
  "semaglutida",
  "tirzepatida",
];

function hasTerm(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

const CATALOG_TERMS = {
  supplement: {
    safe: SAFE_SUPPLEMENT_TERMS,
    blocked: BLOCKED_SUPPLEMENT_TERMS,
    blockedMessage:
      "Esta sección compara suplementos básicos como proteína, creatina, electrolitos y vitaminas.",
    unsafeMessage:
      "Busca un suplemento básico, por ejemplo creatina monohidratada, proteína whey o electrolitos.",
  },
  medication: {
    safe: SAFE_MEDICATION_TERMS,
    blocked: BLOCKED_MEDICATION_TERMS,
    blockedMessage:
      "Esta sección solo compara medicamentos de venta libre (dolor, fiebre, alergias, resfrío, digestivos). No incluye medicamentos con receta, controlados ni de uso delicado.",
    unsafeMessage:
      "Busca un medicamento de venta libre, por ejemplo acetaminofén, ibuprofeno, loratadina u omeprazol.",
  },
};

export function validateCatalogQuery(query, type) {
  const config = CATALOG_TERMS[type];
  if (!config) return { ok: true };

  const q = normalizeText(query);

  if (hasTerm(q, config.blocked)) {
    return { ok: false, message: config.blockedMessage };
  }

  if (!hasTerm(q, config.safe)) {
    return { ok: false, message: config.unsafeMessage };
  }

  return { ok: true };
}

export function isAllowedCatalogOffer(title, type) {
  const config = CATALOG_TERMS[type];
  if (!config) return true;
  if (hasTerm(title, config.blocked)) return false;
  return hasTerm(title, config.safe);
}
