import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Criptografia dos segredos de cada pousada (senha da API FNRH e CPF do responsável).
 * Chave: variável de ambiente CRIPTO_CHAVE (32 bytes em base64). Gerada uma vez e nunca trocada à toa:
 * sem ela, os segredos salvos não podem ser lidos.
 */
function chave(): Buffer | null {
  const b64 = process.env.CRIPTO_CHAVE;
  if (!b64) return null;
  const k = Buffer.from(b64, "base64");
  return k.length === 32 ? k : null;
}

export const criptoDisponivel = () => chave() !== null;

export function cifrar(texto: string): string {
  const k = chave();
  if (!k) throw new Error("CRIPTO_CHAVE não configurada.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(".");
}

export function decifrar(pacote: string | null | undefined): string | null {
  const k = chave();
  if (!k || !pacote) return null;
  const [v, iv, tag, dados] = pacote.split(".");
  if (v !== "v1" || !iv || !tag || !dados) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
