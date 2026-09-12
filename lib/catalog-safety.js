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

function hasTerm(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

export function validateCatalogQuery(query, type) {
  if (type !== "supplement") return { ok: true };

  const q = normalizeText(query);

  if (hasTerm(q, BLOCKED_SUPPLEMENT_TERMS)) {
    return {
      ok: false,
      message:
        "Esta sección compara suplementos básicos como proteína, creatina, electrolitos y vitaminas.",
    };
  }

  if (!hasTerm(q, SAFE_SUPPLEMENT_TERMS)) {
    return {
      ok: false,
      message:
        "Busca un suplemento básico, por ejemplo creatina monohidratada, proteína whey o electrolitos.",
    };
  }

  return { ok: true };
}

export function isAllowedCatalogOffer(title, type) {
  if (type !== "supplement") return true;
  if (hasTerm(title, BLOCKED_SUPPLEMENT_TERMS)) return false;
  return hasTerm(title, SAFE_SUPPLEMENT_TERMS);
}
