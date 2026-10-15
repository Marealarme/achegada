import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sessaoEquipe, temNotas } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { chaveDigisan } from "@/lib/notas/chave";
import type { NfseConfig } from "@/lib/notas/digisan";
import Cabecalho from "../../Cabecalho";
import Form from "../../config/Form";
import { salvarConfigNfse } from "./actions";

export const metadata: Metadata = { title: "Configurar notas fiscais" };
export const dynamic = "force-dynamic";

export default async function ConfigurarNotas() {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (s.perfil.papel !== "dono") redirect("/painel/notas");
  if (!temNotas(s)) redirect("/painel/assinatura");
  const db = supabaseServico();
  const [{ data: p }, chave] = await Promise.all([
    db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle(),
    chaveDigisan(db, s.pousada.id),
  ]);
  const cfg = (p?.nfse_config ?? {}) as Partial<NfseConfig>;
  const sv = (cfg.servico ?? {}) as Record<string, unknown>;
  const ib = (sv.ibscbs ?? {}) as Record<string, unknown>;
  const v = (x: unknown) => (x == null ? "" : String(x));

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="notas" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head">
            <h2>Configurar a emissão de notas fiscais</h2>
            <Link className="btn ghost" href="/painel/notas">← Notas fiscais</Link>
          </div>
          <p className="muted small">
            As notas são emitidas pela <b>Digisan</b> na conta da própria pousada. Antes de configurar aqui: contrate a Digisan,
            envie o certificado digital A1 do CNPJ que emite as notas e cadastre o serviço. Depois copie os dados abaixo.
            Na dúvida sobre os códigos, peça ao seu contador ou copie de uma nota já autorizada pela prefeitura (arquivo XML).
          </p>

          <Form action={salvarConfigNfse} botao="Salvar configuração">
            <h3>1. Chave da Digisan</h3>
            <p className="small">
              {chave?.origem === "pousada" ? <span className="pill ok">Chave cadastrada</span>
                : chave?.origem === "servidor" ? <span className="pill link">Usando a chave do servidor (pousada-piloto)</span>
                : <span className="pill bad">Nenhuma chave cadastrada</span>}
            </p>
            <div className="field">
              <label htmlFor="chave">{chave ? "Trocar a chave (deixe vazio para manter a atual)" : "Chave da API (painel da Digisan > Configurações > Chaves de API)"}</label>
              <input id="chave" name="chave" type="password" autoComplete="off" required={!chave} />
              <span className="muted small">A chave é testada na Digisan e guardada criptografada. Ninguém da equipe consegue ver depois.</span>
            </div>

            <h3>2. Quem emite</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="cnpj">CNPJ do prestador</label><input id="cnpj" name="cnpj" inputMode="numeric" defaultValue={v(cfg.prestadorCnpj)} required /></div>
              <div className="field"><label htmlFor="ibge">Código IBGE do município (7 números)</label><input id="ibge" name="ibge" inputMode="numeric" defaultValue={v(sv.codigoMunicipio)} placeholder="ex.: 3550704 (São Sebastião)" required /></div>
            </div>
            <label className="check"><input name="padrao_nacional" type="checkbox" defaultChecked={!!cfg.padraoNacional} /><span>A prefeitura usa o emissor nacional (padrão nacional da NFS-e)</span></label>

            <h3>3. Serviço</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="item">Item da lista de serviços (LC 116)</label><input id="item" name="item" defaultValue={v(sv.itemListaServicoLC116)} placeholder="ex.: 9.01 hospedagem · 10.05 corretagem" required /></div>
              <div className="field"><label htmlFor="codigo_municipal">Código de tributação municipal</label><input id="codigo_municipal" name="codigo_municipal" defaultValue={v(sv.codigoTributacaoMunicipio)} required /></div>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="cnae">CNAE (opcional)</label><input id="cnae" name="cnae" inputMode="numeric" defaultValue={v(sv.cnae)} placeholder="ex.: 5510801" /></div>
              <div className="field"><label htmlFor="nbs">Código NBS (9 números)</label><input id="nbs" name="nbs" inputMode="numeric" defaultValue={v(sv.codigoNbs)} required /></div>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="aliquota">Alíquota do ISS (%)</label><input id="aliquota" name="aliquota" inputMode="decimal" defaultValue={v(sv.aliquotaIss).replace(".", ",")} placeholder="ex.: 5" required /></div>
              <div className="field"><label htmlFor="prefixo">Começo do texto da nota</label><input id="prefixo" name="prefixo" defaultValue={v(cfg.prefixoDescricao) || "Hospedagem"} /></div>
            </div>
            <p className="muted small">O texto da nota fica: “[começo] – [chalé] – [check-in] a [check-out] – [N] noites – Reserva [nº]”. O valor é o total da reserva, com o ISS incluído.</p>

            <h3>4. IBS / CBS (reforma tributária)</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="cst">CST</label><input id="cst" name="cst" inputMode="numeric" defaultValue={v(ib.cst)} placeholder="ex.: 200" required /></div>
              <div className="field"><label htmlFor="cclasstrib">Classificação tributária (cClassTrib)</label><input id="cclasstrib" name="cclasstrib" inputMode="numeric" defaultValue={v(ib.codigoClassificacaoTributaria)} placeholder="ex.: 200046" required /></div>
            </div>
            <div className="field"><label htmlFor="indop">Indicador de operação (cIndOp)</label><input id="indop" name="indop" inputMode="numeric" defaultValue={v(ib.codigoIndicadorOperacao)} placeholder="ex.: 020301" required /></div>

            <h3>5. Plano e opções</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="limite">Notas por mês no plano da Digisan</label><input id="limite" name="limite" inputMode="numeric" defaultValue={v(cfg.limiteMensal ?? 160)} required /></div>
              <div className="field"><label htmlFor="ciclo">Dia em que o período do plano vira</label><input id="ciclo" name="ciclo" inputMode="numeric" defaultValue={v(cfg.cicloDia ?? 1)} required /></div>
            </div>
            <label className="check"><input name="enviar_email" type="checkbox" defaultChecked={!!cfg.enviarPorEmail} /><span>A Digisan envia a nota por e-mail ao hóspede</span></label>
            <label className="check"><input name="telefone_tomador" type="checkbox" defaultChecked={!!cfg.telefoneTomador} /><span>Enviar o telefone do hóspede na nota (algumas prefeituras recusam)</span></label>

            <p className="aviso small">Se você mudar o CNPJ ou os dados do serviço, a emissão volta para a <b>fase de teste</b>: uma nota, conferência do PDF e só então a liberação das demais.</p>
          </Form>
        </section>
      </div>
    </main>
  );
}
