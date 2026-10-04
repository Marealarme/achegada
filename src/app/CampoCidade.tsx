"use client";

import { useEffect, useState } from "react";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
let cache: Record<string, string[]> | null = null;

/** Estado (lista) + cidade com sugestões da lista oficial do IBGE. Envia os campos "uf" e "cidade". */
export default function CampoCidade({ uf: ufInicial = "", cidade: cidadeInicial = "", obrigatorio = false }: { uf?: string; cidade?: string; obrigatorio?: boolean }) {
  const [uf, setUf] = useState(ufInicial);
  const [cidades, setCidades] = useState<string[]>([]);
  useEffect(() => {
    if (!uf) { setCidades([]); return; }
    let vivo = true;
    (async () => {
      try {
        cache ??= await (await fetch("/municipios.json")).json();
        if (vivo) setCidades(cache?.[uf] ?? []);
      } catch { /* sem lista: o servidor confere */ }
    })();
    return () => { vivo = false; };
  }, [uf]);
  return (
    <div className="grid2" style={{ gridTemplateColumns: "110px minmax(0, 1fr)" }}>
      <div className="field">
        <label htmlFor="uf">Estado</label>
        <select id="uf" name="uf" value={uf} onChange={(e) => setUf(e.target.value)} required={obrigatorio}>
          <option value="">UF</option>
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cidade">Cidade</label>
        <input id="cidade" name="cidade" type="text" list="lista-cidades" defaultValue={cidadeInicial} required={obrigatorio}
          placeholder={uf ? "Comece a digitar e escolha" : "Escolha o estado primeiro"} autoComplete="off" />
        <datalist id="lista-cidades">{cidades.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
    </div>
  );
}
