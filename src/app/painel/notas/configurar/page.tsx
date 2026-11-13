import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sessaoEquipe, temNotas } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { chaveDigisan } from "@/lib/notas/chave";
import type { NfseConfig } from "@/lib/notas/digisan";
import Cabecalho from "../../Cabecalho";
import Form from "../../config/Form";
import { cadastrarEmitente, salvarConfigNfse } from "./actions";

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
  const gateway = chave?.origem === "gateway";
  const emitente = ((cfg as { emitente?: { razaoSocial?: string; cadastradoEm?: string; certificadoEnviadoEm?: string | null } }).emitente) ?? null;
  const dataBR = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="notas" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head">
            <h2>Configurar a emissão de notas fiscais</h2>
            <Link className="btn ghost" href="/painel/notas">← Notas fiscais</Link>
          </div>
          {gateway ? (
            <p className="muted small">
              O emissor de notas já vem <b>incluso no seu plano</b>: você não precisa contratar nada. Faça em ordem:
              <b> 1)</b> cadastre a empresa e envie o certificado digital A1; <b>2)</b> preencha os dados do serviço (peça os códigos ao seu contador).
            </p>
          ) : (
          <p className="muted small">
            As notas são emitidas pela <b>Digisan</b> na conta da própria pousada. Antes de configurar aqui: contrate a Digisan,
            envie o certificado digital A1 do CNPJ que emite as notas e cadastre o serviço. Depois copie os dados abaixo.
            Na dúvida sobre os códigos, peça ao seu contador ou copie de uma nota já autorizada pela prefeitura (arquivo XML).
          </p>
          )}

          {gateway && (
            <>
              <h3>Empresa e certificado digital</h3>
              {emitente?.cadastradoEm && (
                <p className="small">
                  <span className="pill ok">Empresa cadastrada em {dataBR(emitente.cadastradoEm)}</span>{" "}
                  {emitente.certificadoEnviadoEm ? <span className="pill ok">Certificado enviado em {dataBR(emitente.certificadoEnviadoEm)}</span> : <span className="pill bad">Falta o certificado A1</span>}
                </p>
              )}
              <Form action={cadastrarEmitente} botao={emitente?.cadastradoEm ? "Atualizar empresa / certificado" : "Cadastrar empresa e enviar certificado"} multipart>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_cnpj">CNPJ</label><input id="e_cnpj" name="e_cnpj" inputMode="numeric" defaultValue={v(cfg.prestadorCnpj)} required /></div>
                  <div className="field"><label htmlFor="e_razao">Razão social</label><input id="e_razao" name="e_razao" defaultValue={v(emitente?.razaoSocial)} required /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_email">E-mail da empresa</label><input id="e_email" name="e_email" type="email" required /></div>
                  <div className="field"><label htmlFor="e_telefone">Telefone</label><input id="e_telefone" name="e_telefone" type="tel" /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_im">Inscrição municipal</label><input id="e_im" name="e_im" required /></div>
                  <div className="field"><label htmlFor="e_ie">Inscrição estadual (se tiver)</label><input id="e_ie" name="e_ie" /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_cnae">CNAE principal (7 números)</label><input id="e_cnae" name="e_cnae" inputMode="numeric" placeholder="ex.: 5510801" required /></div>
                  <div className="field"><label htmlFor="e_regime">Regime tributário</label>
                    <select id="e_regime" name="e_regime" defaultValue="1" required>
                      <option value="1">Simples Nacional</option>
                      <option value="2">Simples Nacional (excesso de sublimite)</option>
                      <option value="3">Regime normal (Lucro Presumido ou Real)</option>
                      <option value="4">MEI</option>
                    </select>
                  </div>
                </div>
                <div className="field"><label htmlFor="e_especial">Regime especial de tributação (se o contador indicar; senão deixe “Nenhum”)</label>
                  <select id="e_especial" name="e_especial" defaultValue="0">
                    <option value="0">Nenhum</option>
                    <option value="1">Microempresa municipal</option>
                    <option value="2">Estimativa</option>
                    <option value="3">Sociedade de profissionais</option>
                    <option value="4">Cooperativa</option>
                    <option value="5">MEI do Simples Nacional</option>
                    <option value="6">ME ou EPP do Simples Nacional</option>
                  </select>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_cep">CEP</label><input id="e_cep" name="e_cep" inputMode="numeric" required /></div>
                  <div className="field"><label htmlFor="e_ibge">Código IBGE do município (7 números)</label><input id="e_ibge" name="e_ibge" inputMode="numeric" defaultValue={v(sv.codigoMunicipio)} required /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_logradouro">Rua</label><input id="e_logradouro" name="e_logradouro" required /></div>
                  <div className="field"><label htmlFor="e_numero">Número</label><input id="e_numero" name="e_numero" required /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_bairro">Bairro</label><input id="e_bairro" name="e_bairro" required /></div>
                  <div className="field"><label htmlFor="e_complemento">Complemento</label><input id="e_complemento" name="e_complemento" /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_municipio">Cidade</label><input id="e_municipio" name="e_municipio" required /></div>
                  <div className="field"><label htmlFor="e_uf">UF</label><input id="e_uf" name="e_uf" maxLength={2} required /></div>
                </div>
                <details>
                  <summary className="small">Minha prefeitura pede login e senha do portal (opcional)</summary>
                  <div className="grid2">
                    <div className="field"><label htmlFor="e_login_pref">Login da prefeitura</label><input id="e_login_pref" name="e_login_pref" autoComplete="off" /></div>
                    <div className="field"><label htmlFor="e_senha_pref">Senha da prefeitura</label><input id="e_senha_pref" name="e_senha_pref" type="password" autoComplete="new-password" /></div>
                  </div>
                </details>
                <div className="grid2">
                  <div className="field"><label htmlFor="e_certificado">Certificado digital A1 (arquivo .pfx)</label><input id="e_certificado" name="e_certificado" type="file" accept=".pfx,.p12,application/x-pkcs12" /></div>
                  <div className="field"><label htmlFor="e_cert_senha">Senha do certificado</label><input id="e_cert_senha" name="e_cert_senha" type="password" autoComplete="new-password" /></div>
                </div>
                <p className="muted small">O certificado e as senhas vão direto para o emissor oficial e <b>não ficam guardados no A Chegada</b>. Por segurança, os campos são apagados depois de salvar; para atualizar, preencha de novo.</p>
              </Form>
              <h3>Dados do serviço</h3>
            </>
          )}

          <Form action={salvarConfigNfse} botao="Salvar configuração">
            {!gateway && <>
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
            </>}

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

            <h3>5. {gateway ? "Opções" : "Plano e opções"}</h3>
            {!gateway && <div className="grid2">
              <div className="field"><label htmlFor="limite">Notas por mês no plano da Digisan</label><input id="limite" name="limite" inputMode="numeric" defaultValue={v(cfg.limiteMensal ?? 160)} required /></div>
              <div className="field"><label htmlFor="ciclo">Dia em que o período do plano vira</label><input id="ciclo" name="ciclo" inputMode="numeric" defaultValue={v(cfg.cicloDia ?? 1)} required /></div>
            </div>}
            <label className="check"><input name="enviar_email" type="checkbox" defaultChecked={!!cfg.enviarPorEmail} /><span>A Digisan envia a nota por e-mail ao hóspede</span></label>
            <label className="check"><input name="telefone_tomador" type="checkbox" defaultChecked={!!cfg.telefoneTomador} /><span>Enviar o telefone do hóspede na nota (algumas prefeituras recusam)</span></label>

            <p className="aviso small">Se você mudar o CNPJ ou os dados do serviço, a emissão volta para a <b>fase de teste</b>: uma nota, conferência do PDF e só então a liberação das demais.</p>
          </Form>
        </section>
      </div>
    </main>
  );
}
