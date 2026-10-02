import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos de uso e política de privacidade" };

// Dados da empresa: complete os campos entre colchetes antes da primeira venda.
const EMPRESA = "Inn Expert Assessoria Ltda";
const MARCA = "Inn Experts";
const CNPJ = "61.722.517/0001-89";
const ENDERECO = "[endereço completo da sede]";
const EMAIL = "[e-mail de contato]";
const WHATS = "(19) 99759-4522";
const ENCARREGADO = "[nome do encarregado de dados]";
const FORO = "São Sebastião/SP";

export default function Termos() {
  return (
    <main className="wrap texto">
      <h1>Termos de uso e política de privacidade do A Chegada</h1>
      <p className="muted">Versão de outubro de 2026.</p>
      <p>
        Estes termos regem o uso do <b>A Chegada</b>, sistema de check-in online para meios de hospedagem, fornecido pela{" "}
        <b>{EMPRESA}</b> (“{MARCA}”, “nós”), CNPJ {CNPJ}, com sede em {ENDERECO}. Ao criar uma conta ou usar o serviço, a pousada
        (“Cliente”) declara que leu e concorda com estes termos.
      </p>

      <h2>Parte 1 · Termos de uso</h2>

      <h3>1. O serviço</h3>
      <p>O A Chegada permite que o Cliente:</p>
      <ul>
        <li>importe ou cadastre reservas;</li>
        <li>envie ao hóspede um link de pré-chegada;</li>
        <li>receba do hóspede os dados de hospedagem e o aceite das regras da casa;</li>
        <li>com a chave de integração do próprio Cliente, envie a Ficha Nacional de Registro de Hóspedes (FNRH) ao Ministério do Turismo e registre ali a chegada e a saída;</li>
        <li>exporte a lista de hóspedes.</li>
      </ul>
      <p>O serviço é oferecido como assinatura de software (“SaaS”), acessado pela internet, sem instalação.</p>

      <h3>2. Conta e acesso</h3>
      <ul>
        <li>O Cliente informa dados verdadeiros no cadastro e mantém e-mail e senha em sigilo.</li>
        <li>O responsável pela conta (“dono”) pode criar acessos para sua equipe e responde pelo uso feito por ela.</li>
        <li>Cada conta corresponde a um meio de hospedagem. Os dados de cada Cliente ficam isolados e não são visíveis a outros Clientes.</li>
      </ul>

      <h3>3. Teste grátis, planos e pagamento</h3>
      <ul>
        <li>Os primeiros <b>30 dias são gratuitos</b>. Para iniciar o teste, o Cliente cadastra um cartão de crédito no ambiente seguro do Stripe. Nós não temos acesso ao número do cartão.</li>
        <li>Ao fim do teste, a mensalidade do plano escolhido é cobrada automaticamente e, depois, a cada mês, na mesma data. O plano corresponde ao número de unidades (chalés ou quartos) do Cliente.</li>
        <li>Os preços vigentes estão na página do A Chegada. Reajustes são comunicados com pelo menos <b>30 dias de antecedência</b> e valem a partir do ciclo seguinte.</li>
        <li>Se a cobrança falhar, o Cliente é avisado no painel e deve atualizar o cartão. Após 15 dias sem pagamento, o acesso ao painel pode ser suspenso até a regularização. Os dados ficam preservados durante a suspensão.</li>
        <li>Notas fiscais da mensalidade são emitidas pela {EMPRESA}.</li>
      </ul>

      <h3>4. Cancelamento</h3>
      <ul>
        <li>O Cliente pode cancelar a qualquer momento, sem multa, pelo próprio painel (Assinatura → Gerenciar).</li>
        <li>Se o cancelamento ocorrer durante o teste, nada é cobrado.</li>
        <li>Após o teste, o acesso continua até o fim do período já pago, sem cobrança seguinte. Não há reembolso proporcional do mês em curso.</li>
      </ul>

      <h3>5. Responsabilidades do Cliente</h3>
      <ul>
        <li><b>O registro dos hóspedes na FNRH é obrigação legal do meio de hospedagem.</b> O A Chegada é uma ferramenta que facilita esse cumprimento. O Cliente continua responsável por conferir as fichas, registrar a chegada e a saída de cada hóspede e acompanhar avisos de erro no painel.</li>
        <li>Cadastrar a própria chave da API da FNRH, obtida no sistema do Ministério do Turismo, e mantê-la válida.</li>
        <li>Informar seus hóspedes sobre o tratamento de dados pessoais e ter base legal para cada finalidade, em especial o envio de ofertas, que só pode ocorrer com o consentimento registrado pelo hóspede.</li>
        <li>Manter atualizadas as suas regras da casa, termo pet e política de cancelamento, que são exibidas ao hóspede com o texto que o próprio Cliente cadastra.</li>
        <li>Usar o serviço de forma lícita, sem inserir dados de terceiros sem autorização e sem tentar acessar dados de outros Clientes.</li>
      </ul>

      <h3>6. Integração com o governo (FNRH)</h3>
      <p>
        O envio das fichas depende do sistema do Ministério do Turismo/Serpro, que não é controlado por nós. Indisponibilidades, mudanças nas regras ou recusas da API
        do governo podem atrasar ou impedir envios. Nesses casos, o painel mostra o motivo informado pelo governo e permite reenviar. Não respondemos por multas ou
        sanções decorrentes de dados incorretos fornecidos pelo hóspede ou pelo Cliente, nem por falhas do sistema do governo.
      </p>

      <h3>7. Disponibilidade e suporte</h3>
      <ul>
        <li>Empregamos esforços razoáveis para manter o serviço disponível e funcionando, mas não garantimos funcionamento ininterrupto.</li>
        <li>Manutenções programadas serão, sempre que possível, feitas em horários de baixo movimento.</li>
        <li>Suporte pelo WhatsApp {WHATS} e pelo e-mail {EMAIL}, em dias úteis.</li>
      </ul>

      <h3>8. Limitação de responsabilidade</h3>
      <p>
        Na máxima extensão permitida pela lei, nossa responsabilidade total por danos relacionados ao serviço fica limitada ao valor pago pelo Cliente nos 12 meses
        anteriores ao fato. Não respondemos por lucros cessantes, perda de receita ou danos indiretos. Nada nestes termos afasta responsabilidades que a lei não permite limitar.
      </p>

      <h3>9. Propriedade intelectual</h3>
      <p>
        O software, a marca A Chegada e os materiais do serviço pertencem à {EMPRESA}. O Cliente recebe uma licença de uso, não exclusiva e intransferível, enquanto
        a assinatura estiver ativa. Os dados inseridos pelo Cliente e por seus hóspedes continuam sendo do Cliente.
      </p>

      <h3>10. Encerramento da conta e devolução dos dados</h3>
      <ul>
        <li>Após o encerramento da assinatura, o Cliente tem <b>30 dias</b> para exportar a lista de hóspedes pelo painel ou pedir uma cópia pelo nosso contato.</li>
        <li>Depois desse prazo, os dados são excluídos em até 90 dias, inclusive das cópias de segurança. Ficam preservados apenas os dados que a lei nos obrigue a guardar, como registros de cobrança e fiscais.</li>
        <li>Podemos encerrar contas usadas de forma ilícita ou em violação grave destes termos, com aviso prévio sempre que possível.</li>
      </ul>

      <h3>11. Alterações destes termos</h3>
      <p>
        Podemos atualizar estes termos. Mudanças relevantes serão avisadas no painel ou por e-mail com pelo menos 30 dias de antecedência. O uso após essa data
        representa concordância. Se não concordar, o Cliente pode cancelar sem multa.
      </p>

      <h3>12. Lei e foro</h3>
      <p>Estes termos seguem as leis brasileiras. Fica eleito o foro da comarca de {FORO} para resolver eventuais controvérsias.</p>

      <h2>Parte 2 · Política de privacidade (LGPD)</h2>

      <h3>13. Quem é responsável por quais dados</h3>
      <ul>
        <li><b>Dados dos hóspedes:</b> o meio de hospedagem (Cliente) é o <b>controlador</b>. A {EMPRESA} é <b>operadora</b>, ou seja, trata esses dados apenas para prestar o serviço, conforme as instruções do Cliente e esta política.</li>
        <li><b>Dados do Cliente e da sua equipe</b> (cadastro, acesso e cobrança): a {EMPRESA} é <b>controladora</b>.</li>
      </ul>

      <h3>14. Dados tratados</h3>
      <p><b>Hóspedes e acompanhantes:</b></p>
      <ul>
        <li>nome, CPF ou passaporte, data de nascimento, gênero e nacionalidade;</li>
        <li>e-mail, telefone e endereço;</li>
        <li>motivo da viagem e meio de transporte;</li>
        <li>horário previsto de chegada, placa do veículo e dados do pet;</li>
        <li>aceite das regras e, quando dado, o consentimento para receber ofertas.</li>
      </ul>
      <p>
        <b>Cor/raça e deficiência</b> são pedidas pela ficha oficial do governo, sempre com a opção “prefiro não informar”. Elas são enviadas ao Ministério do Turismo
        e <b>apagadas logo após o envio</b>. Não ficam no cadastro do Cliente.
      </p>
      <p><b>Cliente e equipe:</b> nome, e-mail, função, dados da pousada, histórico de assinatura e dados técnicos de acesso (data, hora e endereço IP).</p>
      <p>
        <b>Cobrança:</b> os dados do cartão são tratados diretamente pelo Stripe. Nós recebemos apenas a situação da assinatura (teste, ativa, pendente ou cancelada).
      </p>

      <h3>15. Finalidades e bases legais</h3>
      <ul>
        <li><b>Registro de hóspedes na FNRH:</b> cumprimento de obrigação legal do meio de hospedagem (LGPD, art. 7º, II, e art. 11, II, “a”, para os dados sensíveis).</li>
        <li><b>Organização da chegada</b> (horário, placa, pet, regras): execução do contrato de hospedagem entre hóspede e Cliente (art. 7º, V).</li>
        <li><b>Envio de ofertas pelo Cliente:</b> somente com consentimento do hóspede, que pode retirá-lo a qualquer momento junto ao Cliente (art. 7º, I).</li>
        <li><b>Conta, cobrança e suporte do Cliente:</b> execução do contrato de assinatura (art. 7º, V).</li>
        <li><b>Segurança, prevenção a fraudes e registros de acesso:</b> legítimo interesse e cumprimento do Marco Civil da Internet (art. 7º, II e IX).</li>
      </ul>

      <h3>16. Com quem compartilhamos</h3>
      <ul>
        <li><b>Ministério do Turismo / Serpro:</b> fichas FNRH, por obrigação legal.</li>
        <li><b>Supabase:</b> banco de dados, com servidores em São Paulo (Brasil).</li>
        <li><b>Vercel:</b> hospedagem da aplicação, com processamento principal em São Paulo.</li>
        <li><b>Stripe:</b> cobrança das assinaturas.</li>
        <li><b>Resend:</b> envio de e-mails de acesso, como a recuperação de senha.</li>
      </ul>
      <p>
        Alguns desses fornecedores podem processar dados fora do Brasil. Nesses casos, a transferência internacional ocorre com garantias contratuais compatíveis
        com a LGPD (art. 33). Não vendemos dados pessoais nem os usamos para publicidade própria.
      </p>

      <h3>17. Segurança</h3>
      <ul>
        <li>Comunicação criptografada (HTTPS).</li>
        <li>Separação dos dados de cada Cliente por regras de segurança no próprio banco de dados.</li>
        <li>Senhas e chaves de integração guardadas com criptografia.</li>
        <li>Acesso interno restrito ao necessário.</li>
        <li>Cópias de segurança diárias, guardadas por 7 dias.</li>
        <li>O link de check-in de cada hóspede é único e deixa de funcionar após a estadia ou o cancelamento da reserva.</li>
      </ul>

      <h3>18. Retenção</h3>
      <p>
        Os dados dos hóspedes ficam guardados enquanto o Cliente mantiver a assinatura, ou até que ele peça a exclusão, observados os prazos legais de guarda dos
        registros de hospedagem, que são de responsabilidade do Cliente. Após o encerramento, vale o item 10.
      </p>

      <h3>19. Direitos dos titulares</h3>
      <p>
        O hóspede pode pedir confirmação, acesso, correção, anonimização, portabilidade, exclusão ou informações sobre compartilhamento (LGPD, art. 18). Como o
        Cliente é o controlador, esses pedidos devem ser feitos diretamente à pousada. Se chegarem até nós, encaminhamos ao Cliente e o ajudamos a responder.
        Para dados do próprio Cliente e da sua equipe, os pedidos são feitos pelos nossos canais.
      </p>

      <h3>20. Incidentes de segurança</h3>
      <p>
        Em caso de incidente que possa afetar dados pessoais, avisaremos os Clientes afetados em até 48 horas da confirmação, com as informações disponíveis,
        para que possam cumprir suas obrigações perante a ANPD e os titulares.
      </p>

      <h3>21. Cookies</h3>
      <p>Usamos apenas cookies essenciais, para manter a equipe logada no painel. Não usamos cookies de publicidade.</p>

      <h3>22. Encarregado de dados e contato</h3>
      <p>
        Encarregado (DPO): {ENCARREGADO} · e-mail {EMAIL} · WhatsApp {WHATS}. {EMPRESA}, CNPJ {CNPJ}, {ENDERECO}.
      </p>
    </main>
  );
}
