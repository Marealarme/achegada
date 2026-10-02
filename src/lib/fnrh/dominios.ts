// Listas oficiais da API FNRH v2 (documentação v2.4, 19/06/2026).
// Os "id" são os valores enviados ao governo; o texto é o que o hóspede vê.

export const GENEROS = [
  { id: "MULHER", label: "Feminino" },
  { id: "HOMEM", label: "Masculino" },
  { id: "OUTRO", label: "Outro" },
  { id: "NAOINFORMADO", label: "Prefiro não informar" },
] as const;

export const RACAS = [
  { id: "BRANCA", label: "Branca" },
  { id: "PRETA", label: "Preta" },
  { id: "PARDA", label: "Parda" },
  { id: "AMARELA", label: "Amarela" },
  { id: "INDIGENA", label: "Indígena" },
  { id: "NAOINFORMAR", label: "Prefiro não informar" },
] as const;

export const DEFICIENCIA = [
  { id: "NAO", label: "Não" },
  { id: "SIM", label: "Sim" },
  { id: "NAOINFORMAR", label: "Prefiro não informar" },
] as const;

export const TIPOS_DEFICIENCIA = [
  { id: "FISICA", label: "Física" },
  { id: "AUDITIVA_SURDEZ", label: "Auditiva / surdez" },
  { id: "VISUAL", label: "Visual" },
  { id: "INTELECTUAL", label: "Intelectual" },
  { id: "MULTIPLA", label: "Múltipla" },
] as const;

export const MEIOS_TRANSPORTE = [
  { id: "AUTOMOVEL", label: "Carro" },
  { id: "ONIBUS", label: "Ônibus" },
  { id: "MOTO", label: "Moto" },
  { id: "AVIAO", label: "Avião" },
  { id: "NAVIO_BARCO", label: "Barco" },
  { id: "BICICLETA", label: "Bicicleta" },
  { id: "PE", label: "A pé" },
  { id: "TREM", label: "Trem" },
] as const;

export const MOTIVOS_VIAGEM = [
  { id: "LAZER_FERIAS", label: "Lazer / férias" },
  { id: "PARENTES_AMIGOS", label: "Visitar parentes / amigos" },
  { id: "NEGOCIOS", label: "Negócios" },
  { id: "CONGRESSO_FEIRA", label: "Congresso / feira" },
  { id: "ESTUDOS_CURSOS", label: "Estudos / cursos" },
  { id: "SAUDE", label: "Saúde" },
  { id: "RELIGIAO", label: "Religião" },
  { id: "COMPRAS", label: "Compras" },
] as const;

// Países mais comuns entre hóspedes de Maresias (ISO 3166-1 alpha-2). "Outro" pede o código.
export const PAISES = [
  { id: "BR", label: "Brasil" },
  { id: "AR", label: "Argentina" },
  { id: "UY", label: "Uruguai" },
  { id: "PY", label: "Paraguai" },
  { id: "CL", label: "Chile" },
  { id: "US", label: "Estados Unidos" },
  { id: "PT", label: "Portugal" },
  { id: "IT", label: "Itália" },
  { id: "DE", label: "Alemanha" },
  { id: "FR", label: "França" },
  { id: "ES", label: "Espanha" },
  { id: "GB", label: "Reino Unido" },
] as const;

export const ids = (lista: readonly { id: string }[]) => lista.map((x) => x.id) as string[];
