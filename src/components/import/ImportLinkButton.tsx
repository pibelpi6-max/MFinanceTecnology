import Link from "next/link";

/**
 * Link estilizado como o Button "secondary/sm" — usado nas 4 telas que
 * ganharam importação assistida por IA, para linkar pra rota `/importar`
 * correspondente sem duplicar as classes do Button (que é um <button>,
 * não navega).
 */
export function ImportLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}
