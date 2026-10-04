// Símbolo do A Chegada: uma porta com a seta de quem chega (neutro, sem referência a nenhuma pousada).
export default function Marca({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="#16302D" />
      <path d="M17 9h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 17h11m-4-4 4 4-4 4" fill="none" stroke="var(--moon)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
