import lista from "./municipios.json";

// Lista oficial de municípios do IBGE por estado (gerada de servicodados.ibge.gov.br).
const MUN = lista as Record<string, string[]>;
export const UFS = Object.keys(MUN);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Devolve o nome oficial da cidade (com acentos certos) se ela existir no estado; senão null. */
export function cidadeOficial(uf: string, cidade: string): string | null {
  const nomes = MUN[uf.toUpperCase()];
  if (!nomes) return null;
  const alvo = norm(cidade);
  return nomes.find((n) => norm(n) === alvo) ?? null;
}
