# Supabase SMTP — preparação do piloto

O envio de Magic Link em produção deve usar um provedor SMTP transacional controlado pelo projeto. Nenhuma credencial deve ser incluída no cliente, no repositório, em screenshots ou em logs.

## Configuração

No Supabase Dashboard, acesse **Project Settings → Authentication → SMTP Settings** e informe diretamente no painel:

- host e porta fornecidos pelo provedor;
- usuário SMTP;
- senha ou API key SMTP;
- remetente verificado, por exemplo `acesso@metodoaprender.com`;
- nome do remetente, por exemplo `Anti-Erros | Método Aprender`.

Use TLS conforme a porta indicada pelo provedor. Não copie a senha para `.env.local`, documentação ou variáveis `NEXT_PUBLIC_*`.

## Entregabilidade

Antes do piloto:

- validar o domínio do remetente;
- publicar SPF e DKIM indicados pelo provedor;
- configurar DMARC inicialmente em modo compatível com monitoramento;
- conferir que o endereço de retorno pertence ao domínio controlado;
- testar recebimento em ao menos Gmail e Outlook;
- verificar caixa de spam, tempo de entrega e renderização do botão;
- manter o conteúdo sem dados da análise ou credenciais além do `token_hash` oficial.

## Rate limit e reenvio

A interface aplica cooldown de 60 segundos antes de habilitar o reenvio. Os limites de envio do Supabase e do provedor SMTP continuam sendo a fonte de verdade no servidor; o cooldown visual não substitui rate limiting.

## Teste seguro

1. Use uma conta de teste controlada.
2. Solicite um único link e confirme o recebimento.
3. Abra o link em outro dispositivo.
4. Reutilize o link e confirme a falha genérica.
5. Remova mensagens de teste que contenham links ainda válidos.

Nunca inclua senha SMTP, service role, access token, refresh token ou claim token em tickets e relatórios.
