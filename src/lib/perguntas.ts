// Perguntas da pousada: perguntas extras configuradas por cada pousada e respondidas no check-in online.
// Sem dependências de servidor: usado na tela de configuração, na ficha do hóspede e na validação do servidor.

export type TipoPergunta = "texto" | "paragrafo" | "unica" | "multipla" | "data" | "hora" | "data_hora";
export type Pergunta = {
  id: string; texto: string; tipo: TipoPergunta; obrigatoria: boolean;
  opcoes: string[]; max: number | null; ajuda: string;
};
export type Resposta = { id: string; pergunta: string; resposta: string };

export const TIPOS: { id: TipoPergunta; label: string }[] = [
  { id: "texto", label: "Texto curto" },
  { id: "paragrafo", label: "Texto longo" },
  { id: "unica", label: "Escolha uma opção" },
  { id: "multipla", label: "Escolha várias opções" },
  { id: "data", label: "Data" },
  { id: "hora", label: "Horário" },
  { id: "data_hora", label: "Data e horário" },
];
export const temOpcoes = (t: TipoPergunta) => t === "unica" || t === "multipla";
export const MAX_PERGUNTAS = 15;

const limpa = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Confere e limpa a lista vinda da tela de configuração ou do banco (nunca confia no formato). */
export function normalizarPerguntas(bruto: unknown): Pergunta[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const lista: Pergunta[] = [];
  for (const x of bruto.slice(0, MAX_PERGUNTAS)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const texto = limpa(o.texto, 200);
    if (!texto) continue;
    const tipo = (TIPOS.some((t) => t.id === o.tipo) ? o.tipo : "texto") as TipoPergunta;
    let id = limpa(o.id, 40).replace(/[^a-z0-9_-]/gi, "");
    if (!id || vistos.has(id)) id = `p${Date.now().toString(36)}${lista.length}`;
    vistos.add(id);
    const opcoes = temOpcoes(tipo)
      ? [...new Set((Array.isArray(o.opcoes) ? o.opcoes : String(o.opcoes ?? "").split("\n")).map((v) => limpa(v, 100)).filter(Boolean))].slice(0, 30)
      : [];
    if (temOpcoes(tipo) && opcoes.length < 2) continue; // escolha precisa de pelo menos 2 opções
    const maxN = Number(o.max);
    const max = tipo === "multipla" && maxN >= 1 && maxN < opcoes.length ? Math.floor(maxN) : null;
    lista.push({ id, texto, tipo, obrigatoria: !!o.obrigatoria, opcoes, max, ajuda: limpa(o.ajuda, 200) });
  }
  return lista;
}

/** Valida as respostas do hóspede contra as perguntas da pousada. Devolve a lista para gravar ou o erro. */
export function validarRespostas(perguntas: Pergunta[], bruto: unknown): { ok: true; respostas: Resposta[] } | { ok: false; erro: string } {
  const entrada = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const respostas: Resposta[] = [];
  for (const q of perguntas) {
    const v = entrada[q.id];
    let resposta = "";
    if (q.tipo === "multipla") {
      const marcadas = (Array.isArray(v) ? v : []).map((x) => String(x)).filter((x) => q.opcoes.includes(x));
      const unicas = [...new Set(marcadas)];
      if (q.max && unicas.length > q.max) return { ok: false, erro: `Em “${q.texto}”, escolha no máximo ${q.max}.` };
      resposta = unicas.join("; ");
    } else if (q.tipo === "unica") {
      resposta = q.opcoes.includes(String(v ?? "")) ? String(v) : "";
    } else if (q.tipo === "data") {
      resposta = /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v).split("-").reverse().join("/") : "";
    } else if (q.tipo === "hora") {
      resposta = /^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : "";
    } else if (q.tipo === "data_hora") {
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(String(v ?? ""));
      resposta = m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : "";
    } else {
      resposta = String(v ?? "").trim().slice(0, q.tipo === "paragrafo" ? 1000 : 200);
    }
    if (q.obrigatoria && !resposta) return { ok: false, erro: `Responda: “${q.texto}”.` };
    if (resposta) respostas.push({ id: q.id, pergunta: q.texto, resposta });
  }
  return { ok: true, respostas };
}

/** Modelo pronto com as perguntas mais comuns (o dono edita ou apaga). */
export const SUGESTOES: Omit<Pergunta, "id">[] = [
  { texto: "Onde nos encontrou?", tipo: "unica", obrigatoria: true, opcoes: ["Google", "Instagram/Facebook", "Booking", "Airbnb", "Expedia", "Indicação", "Já sou cliente"], max: null, ajuda: "" },
  { texto: "O que mais influenciou na escolha?", tipo: "multipla", obrigatoria: false, opcoes: ["Avaliações", "Preço", "Fotos e descrição", "Localização", "Estrutura dos chalés", "Área de lazer"], max: 2, ajuda: "Escolha até 2" },
  { texto: "Composição do grupo", tipo: "unica", obrigatoria: false, opcoes: ["Casal", "Casal com crianças", "Família", "Grupo de amigos", "Sozinho(a)"], max: null, ajuda: "" },
  { texto: "Pedidos especiais", tipo: "paragrafo", obrigatoria: false, opcoes: [], max: null, ajuda: "Ex.: berço, comemoração, alergias" },
];
