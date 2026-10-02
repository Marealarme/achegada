// Selo "uma solução Inn Experts" com o logo da empresa (fundo azul-petróleo do próprio logo).
export default function SeloInn({ largura = 150 }: { largura?: number }) {
  return (
    <a href="https://wa.me/5519997594522" target="_blank" rel="noopener" className="selo-inn" aria-label="Inn Experts — Assessoria em Hospitalidade">
      <span>uma solução</span>
      <img src="/logo-innexperts.png" alt="Inn Experts — Assessoria em Hospitalidade" width={largura} height={Math.round(largura * 280 / 860)} />
    </a>
  );
}
