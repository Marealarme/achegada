import "server-only";
import { deflateRawSync } from "node:zlib";

// Monta um arquivo .zip simples (sem dependência externa). Nomes em UTF-8.

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d: Date) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

export function criarZip(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let pos = 0;
  const { hora, dia } = dataDos(new Date(Date.now() - 3 * 3600e3));
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8");
    const crc = crc32(a.dados);
    const comprimido = deflateRawSync(a.dados);
    const usar = comprimido.length < a.dados.length;
    const corpo = usar ? comprimido : Buffer.from(a.dados);
    const metodo = usar ? 8 : 0;

    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(metodo, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(dia, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(corpo.length, 18); loc.writeUInt32LE(a.dados.length, 22); loc.writeUInt16LE(nome.length, 26); loc.writeUInt16LE(0, 28);
    partes.push(loc, nome, corpo);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(metodo, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(corpo.length, 20); cen.writeUInt32LE(a.dados.length, 24); cen.writeUInt16LE(nome.length, 28);
    cen.writeUInt32LE(pos, 42);
    central.push(cen, nome);
    pos += loc.length + nome.length + corpo.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamCentral, 12); fim.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...partes, ...central, fim]));
}
