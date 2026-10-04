import { startTransition, type FormEvent } from "react";

/**
 * Envia o formulário para a ação do servidor SEM apagar o que a pessoa digitou.
 * (Com `<form action={...}>` o React limpa todos os campos depois de cada envio,
 * inclusive quando volta um erro, como "e-mail já cadastrado".)
 * Uso: <form onSubmit={enviarSemApagar(acao)}>
 */
export function enviarSemApagar(acao: (dados: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  };
}
