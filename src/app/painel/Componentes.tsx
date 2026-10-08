"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { enviarSemApagar } from "@/lib/enviarSemApagar";
import { CAMPOS } from "@/lib/camposPlanilha";
import { criarReserva, importarReservas, marcarLinkEnviado } from "./actions";

type Unidade = { id: string; nome: string };

export function NovaReserva({ unidades }: { unidades: Unidade[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, acao, pendente] = useActionState(criarReserva, "");
  // reserva criada: o painel abre o card novo (?r=…); fecha e limpa o formulário
  const criada = useSearchParams().get("r");
  useEffect(() => { setAberto(false); }, [criada]);
  if (!aberto)
    return <button className="btn primary" type="button" onClick={() => setAberto(true)}>+ Nova reserva</button>;
  return (
    <form onSubmit={enviarSemApagar(acao)} className="newform" style={{ width: "100%" }}>
      <div className="field"><label htmlFor="titular">Nome do titular</label><input id="titular" name="titular" type="text" required /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" type="tel" placeholder="(11) 90000-0000" /></div>
        <div className="field"><label htmlFor="unidade">Chalé</label>
          <select id="unidade" name="unidade">{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="check_in">Check-in</label><input id="check_in" name="check_in" type="date" required /></div>
        <div className="field"><label htmlFor="check_out">Check-out</label><input id="check_out" name="check_out" type="date" required /></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="adultos">Adultos</label><input id="adultos" name="adultos" type="number" min={1} max={12} defaultValue={2} /></div>
        <div className="field"><label htmlFor="criancas">Crianças</label><input id="criancas" name="criancas" type="number" min={0} max={12} defaultValue={0} /></div>
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="button" onClick={() => setAberto(false)}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={pendente} style={{ flex: 1 }}>{pendente ? "Criando…" : "Criar reserva e gerar link"}</button>
      </div>
    </form>
  );
}

/** Abre o WhatsApp do colaborador com a mensagem pronta; ele só aperta enviar. Registra o envio no card. */
function linkWhatsApp(telefone: string | null, mensagem: string) {
  let numero = (telefone ?? "").replace(/\D/g, "");
  if (numero && numero.length <= 11) numero = "55" + numero;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export type ItemFila = { id: string; titular: string; unidade: string; chegada: string; telefone: string; mensagem: string };

/** Modo fila: envia os links de check-in um atrás do outro. Cada envio continua sendo um clique da recepção
 *  (nada de disparo automático), para o número da pousada não ser visto como spam pelo WhatsApp. */
export function FilaWhatsApp({ itens, semTelefone }: { itens: ItemFila[]; semTelefone: number }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(0);
  const [enviados, setEnviados] = useState(0);
  if (!itens.length) return null;
  if (!aberto)
    return <button className="btn" type="button" onClick={() => { setPos(0); setEnviados(0); setAberto(true); }}>Enviar links em fila ({itens.length})</button>;
  const atual = itens[pos];
  const proximo = () => setPos((p) => p + 1);
  return (
    <div className="newform" style={{ width: "100%" }}>
      {atual ? (
        <>
          <span className="label">{pos + 1} de {itens.length} · {enviados} enviado(s)</span>
          <div>
            <b>{atual.titular}</b>
            <div className="muted small">{atual.unidade} · chega {atual.chegada} · <span className="mono">{atual.telefone}</span></div>
          </div>
          <div className="msg">{atual.mensagem}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => setAberto(false)}>Fechar</button>
            <button className="btn" type="button" onClick={proximo}>Pular</button>
            <a className="btn primary" style={{ flex: 1, textAlign: "center" }} href={linkWhatsApp(atual.telefone, atual.mensagem)} target="_blank" rel="noopener noreferrer"
              onClick={() => { marcarLinkEnviado(atual.id).catch(() => {}); setEnviados((n) => n + 1); proximo(); }}>
              Abrir WhatsApp e ir para o próximo
            </a>
          </div>
          <span className="hint">Envie no WhatsApp e volte para esta tela: o próximo hóspede já estará pronto. Em dias de muito volume, divida em blocos (ex.: 20 de manhã e 20 à tarde).</span>
        </>
      ) : (
        <>
          <p role="status"><b>Fila concluída.</b> {enviados} link(s) enviado(s).</p>
          <button className="btn" type="button" onClick={() => { setAberto(false); window.location.reload(); }}>Fechar e atualizar</button>
        </>
      )}
      {semTelefone > 0 && <span className="hint">{semTelefone} reserva(s) sem WhatsApp cadastrado ficaram fora da fila.</span>}
    </div>
  );
}

export function BotoesMensagem({ reservaId, mensagem, telefone }: { reservaId: string; mensagem: string; telefone: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const wa = linkWhatsApp(telefone, mensagem);
  const registrar = () => { marcarLinkEnviado(reservaId).catch(() => {}); };

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      registrar();
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a className="btn primary" href={wa} target="_blank" rel="noopener noreferrer" onClick={registrar}>Enviar no WhatsApp</a>
      <button className="btn" type="button" onClick={copiar}>{copiado ? "Copiado" : "Copiar mensagem"}</button>
    </div>
  );
}

/** Importa a planilha de reservas (modelo do A Chegada ou exportação do sistema) e cria os cards. */
/** Relatório de hóspedes em Excel: período opcional, planilha completa ou só a lista de marketing. */
export function BaixarHospedes() {
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  if (!aberto)
    return <button className="btn ghost" type="button" onClick={() => setAberto(true)}>Baixar hóspedes (Excel)</button>;
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    const s = p.toString();
    return "/painel/exportar" + (s ? `?${s}` : "");
  };
  return (
    <div className="newform" style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="exp-de">Check-in de</label>
          <input id="exp-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="exp-ate">até</label>
          <input id="exp-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      <span className="hint">Deixe as datas em branco para baixar tudo. A planilha completa tem duas abas: “Estadias” (uma linha por pessoa em cada reserva) e “Clientes” (uma linha por pessoa, com quantas vezes já veio). A lista para marketing traz só quem autorizou receber ofertas.</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={() => setAberto(false)}>Fechar</button>
        <a className="btn" href={q({ tipo: "marketing" })}>Lista para marketing</a>
        <a className="btn primary" href={q({})} style={{ flex: 1, textAlign: "center" }}>Planilha completa</a>
      </div>
    </div>
  );
}

type PorEmail = { email: string; ultima: { em: string; ok: boolean; mensagem: string; arquivo?: string; de?: string } | null } | null;

/** Endereço de e-mail da pousada para mandar a planilha pelo celular (sem escolher arquivo). */
function ImportarPorEmail({ porEmail }: { porEmail: PorEmail }) {
  const [copiado, setCopiado] = useState(false);
  if (!porEmail) return null;
  const { email, ultima } = porEmail;
  const quando = ultima ? new Date(ultima.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="por-email">
      <span className="label">Pelo celular: mande por e-mail</span>
      <span className="hint">Encaminhe o arquivo de reservas (anexado) para o endereço abaixo. As reservas entram sozinhas em até 1 minuto. Funciona pelo WhatsApp, Mail ou Gmail: abra o arquivo, toque em Compartilhar e escolha o e-mail.</span>
      <div className="por-email-linha">
        <code>{email}</code>
        <button className="btn" type="button" onClick={() => { navigator.clipboard?.writeText(email).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }); }}>{copiado ? "Copiado ✓" : "Copiar"}</button>
      </div>
      {ultima && (
        <p className={ultima.ok ? "ok small" : "err small"} role="status">
          Último e-mail ({quando}{ultima.arquivo ? `, ${ultima.arquivo}` : ""}): {ultima.mensagem}
        </p>
      )}
    </div>
  );
}

export function ImportarReservas({ porEmail = null }: { porEmail?: PorEmail }) {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resposta, acao, pendente] = useActionState(importarReservas, null);
  const [descartada, setDescartada] = useState<typeof resposta>(null);
  const res = resposta === descartada ? null : resposta; // trocou de arquivo: esquece a resposta anterior
  if (!aberto)
    return <button className="btn" type="button" onClick={() => setAberto(true)}>Importar reservas</button>;

  // envio manual (sem o "action" do form) para o arquivo continuar escolhido na tela de ligar colunas
  function enviar(e: React.FormEvent<HTMLFormElement>, extra: Record<string, string> = {}) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (arquivo) fd.set("arquivo", arquivo);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(() => acao(fd));
  }
  const mapear = res?.mapear;
  return (
    <form onSubmit={(e) => enviar(e, mapear ? { mapear: "1" } : {})} className="newform" style={{ width: "100%" }}>
      <ImportarPorEmail porEmail={porEmail} />
      <div className="field">
        <span className="label">Planilha de reservas</span>
        <label htmlFor="arquivo" className={`arquivo-btn${arquivo ? " escolhido" : ""}`}>
          <input id="arquivo" name="arquivo" type="file" required={!arquivo} onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setDescartada(resposta); }} />
          <span aria-hidden="true">📄</span> {arquivo ? "Trocar planilha" : "Escolher planilha"}
        </label>
        {arquivo && <span className="arquivo-nome">✓ {arquivo.name} — agora toque em “Importar reservas”</span>}
        <span className="hint">Envie a lista de reservas exportada do seu sistema (.xlsx, .xls ou .csv). Na primeira vez, o A Chegada pergunta em qual coluna está cada informação e guarda a resposta. Se preferir, use a <a href="/painel/modelo-reservas">planilha modelo</a>. Reservas já importadas não duplicam.</span>
      </div>
      {res && <p className={res.ok ? "" : mapear ? "" : "err"} role="status">{res.mensagem}</p>}

      {mapear && (
        <div className="field" key={mapear.colunas.join("|")}>
          <span className="label">Ligar colunas</span>
          {CAMPOS.map((c) => (
            <div className="field" key={c.id}>
              <label htmlFor={`col_${c.id}`}>{c.rotulo}{c.obrigatorio ? " *" : ""}</label>
              <select id={`col_${c.id}`} name={`col_${c.id}`} defaultValue={mapear.sugestao[c.id] !== undefined ? String(mapear.sugestao[c.id]) : ""} required={c.obrigatorio}>
                <option value="">{c.obrigatorio ? "Escolha a coluna" : "Minha planilha não tem"}</option>
                {mapear.colunas.map((nome, k) => (
                  <option key={k} value={k}>{nome}{mapear.amostras[k]?.length ? ` · ex.: ${mapear.amostras[k].slice(0, 2).join(", ")}` : ""}</option>
                ))}
              </select>
            </div>
          ))}
          <span className="hint">* obrigatórios. Sem a coluna de situação, todas as reservas entram como confirmadas. Sem o código da reserva, o A Chegada usa nome + datas para não duplicar.</span>
        </div>
      )}

      {res?.detalhes && res.detalhes.length > 0 && (
        <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>{res.detalhes.map((d) => <li key={d}>{d}</li>)}</ul>
      )}
      {res?.ok && res.ligacaoSalva && (
        <button className="btn ghost" type="button" disabled={pendente || !arquivo} onClick={(e) => {
          const form = (e.currentTarget as HTMLButtonElement).form!;
          const fd = new FormData(form); if (arquivo) fd.set("arquivo", arquivo); fd.set("refazer", "1");
          startTransition(() => acao(fd));
        }}>Colunas erradas? Ligar de novo</button>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="button" onClick={() => setAberto(false)}>Fechar</button>
        <button className="btn primary" type="submit" disabled={pendente} style={{ flex: 1 }}>{pendente ? "Importando…" : mapear ? "Importar com estas colunas" : "Importar reservas"}</button>
      </div>
    </form>
  );
}
