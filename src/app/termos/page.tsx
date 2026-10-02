import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos de uso e privacidade" };

export default function Termos() {
  return (
    <main className="wrap texto">
      <h1>Termos de uso e política de privacidade</h1>
      <p className="muted">Versão de outubro de 2026.</p>

      <h2>1. O serviço</h2>
      <p>O A Chegada é um sistema de check-in online para meios de hospedagem. A pousada envia ao hóspede um link; o hóspede informa seus dados; o sistema organiza a chegada e, quando a pousada cadastra a chave da API da FNRH, envia a Ficha Nacional de Registro de Hóspedes ao Ministério do Turismo.</p>

      <h2>2. Assinatura, teste e cancelamento</h2>
      <p>Os primeiros 30 dias são gratuitos. Para começar, a pousada cadastra um cartão na página segura do Stripe; o A Chegada não vê nem guarda o número do cartão. Ao fim do teste, a mensalidade do plano escolhido é cobrada automaticamente todo mês. A pousada pode cancelar a qualquer momento pelo painel, sem multa; o acesso segue até o fim do período já pago.</p>

      <h2>3. Papéis na LGPD</h2>
      <p>Em relação aos dados dos hóspedes, a pousada é a <b>controladora</b> e o A Chegada é o <b>operador</b>: tratamos os dados apenas para prestar o serviço contratado, conforme as instruções da pousada. A pousada é responsável por informar seus hóspedes e por ter base legal para o tratamento (cumprimento da obrigação legal da FNRH e execução do contrato de hospedagem).</p>

      <h2>4. Dados tratados e finalidade</h2>
      <ul>
        <li><b>Dados da ficha (nome, documento, nascimento, gênero, nacionalidade, contato, endereço, motivo da viagem, transporte):</b> registro de hospedagem exigido por lei e organização da chegada.</li>
        <li><b>Cor/raça e deficiência:</b> pedidos pela ficha oficial do governo, com a opção “prefiro não informar”. São enviados ao Ministério do Turismo e <b>não ficam guardados</b> no cadastro da pousada.</li>
        <li><b>Fotos de documento</b> (quando o recurso existir): lidas e descartadas na hora, nunca armazenadas.</li>
        <li><b>Ofertas e marketing:</b> apenas para quem marcar a autorização, que pode ser retirada a qualquer momento junto à pousada.</li>
      </ul>

      <h2>5. Segurança</h2>
      <p>Os dados ficam em servidores no Brasil (região de São Paulo), com acesso restrito por pousada: uma pousada não consegue ver os dados de outra. Senhas e chaves de integração são guardadas criptografadas. O link de check-in de cada hóspede é único e expira após a estadia.</p>

      <h2>6. Compartilhamento</h2>
      <p>Os dados são compartilhados somente com: o Ministério do Turismo/Serpro (ficha FNRH, por obrigação legal); provedores de infraestrutura necessários ao serviço (hospedagem e banco de dados); e o Stripe (apenas dados de cobrança da pousada). Não vendemos dados.</p>

      <h2>7. Direitos do titular</h2>
      <p>O hóspede pode pedir à pousada acesso, correção ou exclusão dos seus dados, respeitados os prazos legais de guarda da ficha de hospedagem. A pousada pode solicitar ao A Chegada a exportação ou exclusão dos dados da sua conta.</p>

      <h2>8. Contato</h2>
      <p>Dúvidas sobre estes termos ou sobre dados pessoais: fale com a pousada em que você se hospedou ou com o A Chegada pelo e-mail de contato informado no painel.</p>
    </main>
  );
}
