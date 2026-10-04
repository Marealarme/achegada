import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessaoEquipe, podeConfigurar } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import Cabecalho from "../Cabecalho";
import Form from "./Form";
import CampoCidade from "../../CampoCidade";
import BotaoAcao from "../BotaoAcao";
import { adicionarChale, adicionarMembro, enviarLogo, removerChale, removerMembro, salvarDados, salvarFnrh } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

const PAPEIS: Record<string, string> = { dono: "Dono", gerente: "Gerência", recepcao: "Recepção" };

export default async function Config() {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) redirect("/painel");
  const db = supabaseServico();
  const [{ data: p }, { data: unidades }, { data: equipe }, { data: seg }] = await Promise.all([
    db.from("pousadas").select("*").eq("id", s.pousada.id).single(),
    db.from("unidades").select("id, nome").eq("pousada_id", s.pousada.id).order("nome"),
    db.from("perfis").select("user_id, nome, papel").eq("pousada_id", s.pousada.id).order("nome"),
    db.from("pousada_segredos").select("fnrh_usuario, fnrh_ambiente, updated_at").eq("pousada_id", s.pousada.id).maybeSingle(),
  ]);
  const v = (k: string) => (p?.[k] ?? "") as string;
  const usaVariaveis = !seg?.fnrh_usuario && p?.slug === (process.env.FNRH_POUSADA_PILOTO ?? "lua") && !!process.env.FNRH_USUARIO;

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="config" />
      <div className="desk unica">

        <section className="panel">
          <h2>Dados da pousada</h2>
          <Form action={salvarDados} botao="Salvar dados">
            <div className="grid2">
              <div className="field"><label htmlFor="nome">Nome</label><input id="nome" name="nome" type="text" defaultValue={v("nome")} required /></div>
              <CampoCidade uf={v("uf")} cidade={v("cidade")} />
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="whatsapp">WhatsApp da pousada</label><input id="whatsapp" name="whatsapp" type="tel" defaultValue={v("whatsapp")} /></div>
              <div className="field"><label htmlFor="qtd_unidades">Chalés / quartos</label><input id="qtd_unidades" name="qtd_unidades" type="number" min={1} max={200} defaultValue={p?.qtd_unidades ?? ""} /></div>
            </div>
            <div className="field"><label htmlFor="endereco_mapa">Busca do “Como chegar” no Google Maps</label><input id="endereco_mapa" name="endereco_mapa" type="text" defaultValue={v("endereco_mapa")} placeholder="Nome da pousada + cidade, ou o endereço" /></div>
            <label className="check"><input id="cafe_incluso" name="cafe_incluso" type="checkbox" defaultChecked={p?.cafe_incluso ?? true} /><span>Café da manhã incluso na diária</span></label>
            <div className="field"><label htmlFor="aviso_early_late">Aviso sobre early check-in / late check-out</label><textarea id="aviso_early_late" name="aviso_early_late" rows={2} defaultValue={v("aviso_early_late")} /></div>
            <div className="field"><label htmlFor="regras_da_casa">Regras da casa (uma por linha)</label><textarea id="regras_da_casa" name="regras_da_casa" rows={4} defaultValue={v("regras_da_casa")} /></div>
            <div className="field"><label htmlFor="termo_pet">Termo pet (uma linha por item; deixe vazio se não aceita pets)</label><textarea id="termo_pet" name="termo_pet" rows={3} defaultValue={v("termo_pet")} /></div>
            <div className="field"><label htmlFor="politica_cancelamento">Política de cancelamento (uma por linha)</label><textarea id="politica_cancelamento" name="politica_cancelamento" rows={3} defaultValue={v("politica_cancelamento")} /></div>
          </Form>
        </section>

        <section className="panel">
          <h2>Logo</h2>
          <p className="muted small">Aparece na tela do hóspede e na prévia do link no WhatsApp. PNG ou JPG, até 2 MB.</p>
          {p?.logo_url && <img src={p.logo_url} alt="Logo atual" width={96} height={96} style={{ borderRadius: 12, background: "#fff", objectFit: "contain", padding: 6 }} />}
          <Form action={enviarLogo} botao="Enviar logo" multipart>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
          </Form>
        </section>

        <section className="panel">
          <h2>Chalés e quartos</h2>
          <p className="muted small">Ao importar a planilha de reservas, os chalés são criados sozinhos com os nomes que estiverem nela.</p>
          <div className="people">
            {(unidades ?? []).map((u) => (
              <div className="linha-lista" key={u.id}>
                <span>{u.nome}</span>
                <form action={removerChale}><input type="hidden" name="id" value={u.id} /><BotaoAcao className="btn ghost" aguardando="Removendo…">Remover</BotaoAcao></form>
              </div>
            ))}
            {!unidades?.length && <p className="empty">Nenhum chalé cadastrado ainda.</p>}
          </div>
          <Form action={adicionarChale} botao="Adicionar">
            <div className="field"><label htmlFor="nomes">Novos chalés/quartos (um por linha)</label><textarea id="nomes" name="nomes" rows={3} placeholder={"Chalé 1\nChalé 2"} /></div>
          </Form>
        </section>

        <section className="panel">
          <h2>Ficha do governo (FNRH)</h2>
          <p className="muted small">Com a chave cadastrada, cada check-in envia a ficha ao governo sozinho, sem o hóspede precisar de gov.br.</p>
          <details className="passo-a-passo" open={!seg?.fnrh_usuario && !usaVariaveis}>
            <summary>Como ligar a FNRH (passo a passo, uns 5 minutos)</summary>
            <ol>
              <li>A pousada precisa estar no <b>Cadastur</b> (o mesmo cadastro exigido para funcionar). Se ainda não tiver, faça em <a href="https://cadastur.turismo.gov.br" target="_blank" rel="noopener noreferrer">cadastur.turismo.gov.br</a>.</li>
              <li>Abra o sistema da FNRH para meios de hospedagem: <a href="https://fnrh.turismo.serpro.gov.br/FNRH_SRH" target="_blank" rel="noopener noreferrer">fnrh.turismo.serpro.gov.br/FNRH_SRH</a>.</li>
              <li>Entre com a <b>conta gov.br do responsável</b> pela pousada (o CPF ligado ao Cadastur).</li>
              <li>No menu, abra <b>“Chave das API&apos;s”</b> e gere a chave. O governo mostra um <b>usuário</b> e uma <b>chave</b>: copie os dois.</li>
              <li>Volte aqui e preencha abaixo: usuário, chave, o <b>CPF do responsável</b> e o ambiente <b>Oficial</b>. Clique em “Salvar chave da FNRH”.</li>
              <li>Pronto. No próximo check-in online, o card da reserva mostra <b>“Ficha enviada”</b>. Se aparecer um erro, o motivo do governo aparece no card.</li>
            </ol>
            <p className="muted small">Dúvidas? Fale com o suporte pelo WhatsApp (19) 99759-4522.</p>
          </details>
          {seg?.fnrh_usuario ? (
            <p className="ok">Chave cadastrada (usuário {seg.fnrh_usuario}, ambiente {seg.fnrh_ambiente === "homologacao" ? "de teste" : "oficial"}). Para trocar, preencha de novo.</p>
          ) : usaVariaveis ? (
            <p className="ok">Integração ativa pela configuração do servidor (pousada-piloto).</p>
          ) : (
            <p className="muted small">Ainda não cadastrada: o hóspede é levado ao site do governo para preencher a ficha.</p>
          )}
          <Form action={salvarFnrh} botao="Salvar chave da FNRH">
            <div className="grid2">
              <div className="field"><label htmlFor="usuario">Usuário da API</label><input id="usuario" name="usuario" type="text" autoComplete="off" /></div>
              <div className="field"><label htmlFor="senha">Chave da API</label><input id="senha" name="senha" type="password" autoComplete="new-password" /></div>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="cpf">CPF do responsável</label><input id="cpf" name="cpf" type="text" inputMode="numeric" autoComplete="off" /></div>
              <div className="field"><label htmlFor="ambiente">Ambiente</label>
                <select id="ambiente" name="ambiente" defaultValue="producao"><option value="producao">Oficial (fichas reais)</option><option value="homologacao">Teste do governo</option></select>
              </div>
            </div>
            <p className="muted small">A chave e o CPF ficam guardados criptografados e não aparecem mais na tela.</p>
          </Form>
        </section>

        <section className="panel">
          <h2>Equipe</h2>
          <div className="people">
            {(equipe ?? []).map((m) => (
              <div className="linha-lista" key={m.user_id}>
                <span>{m.nome} <span className="muted small">· {PAPEIS[m.papel] ?? m.papel}</span></span>
                {s.perfil.papel === "dono" && m.user_id !== s.userId && (
                  <form action={removerMembro}><input type="hidden" name="id" value={m.user_id} /><BotaoAcao className="btn ghost" aguardando="Removendo…">Remover acesso</BotaoAcao></form>
                )}
              </div>
            ))}
          </div>
          {s.perfil.papel === "dono" ? (
            <Form action={adicionarMembro} botao="Criar acesso">
              <div className="grid2">
                <div className="field"><label htmlFor="m-nome">Nome</label><input id="m-nome" name="nome" type="text" /></div>
                <div className="field"><label htmlFor="m-papel">Função</label>
                  <select id="m-papel" name="papel" defaultValue="recepcao"><option value="recepcao">Recepção (reservas e check-in)</option><option value="gerente">Gerência (também configurações)</option></select>
                </div>
              </div>
              <div className="grid2">
                <div className="field"><label htmlFor="m-email">E-mail</label><input id="m-email" name="email" type="email" autoComplete="off" /></div>
                <div className="field"><label htmlFor="m-senha">Senha provisória</label><input id="m-senha" name="senha" type="text" autoComplete="off" minLength={8} /></div>
              </div>
            </Form>
          ) : <p className="muted small">Só o dono cadastra e remove acessos.</p>}
        </section>
      </div>
    </main>
  );
}
