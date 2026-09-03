# Supabase Magic Link — configuração do piloto

O Anti-Erros recebe o `token_hash` em `/auth/confirm` e só o valida após o clique explícito do usuário. Esse fluxo não depende do verificador PKCE salvo no navegador que solicitou o e-mail.

## 1. URLs de autenticação

No Supabase Dashboard, acesse **Authentication → URL Configuration** e configure:

- **Site URL:** `https://anti-erros.metodoaprender.com`
- permita `https://anti-erros.metodoaprender.com/auth/confirm` nas Redirect URLs e mantenha somente origens controladas pelo projeto;
- não use domínios de Preview da Vercel como Site URL de produção;
- para desenvolvimento local, permita apenas a URL local explícita necessária, sem curingas em produção.

O parâmetro `next` aceito pelo aplicativo é restrito a `/app`, `/conta` e `/onboarding`. Qualquer outro valor, inclusive URL externa ou protocol-relative, é descartado e substituído por `/app`.

## 2. Template obrigatório

Em **Authentication → Email Templates**, atualize os templates **Magic Link** e **Confirm signup**. Os dois precisam usar o mesmo destino seguro para cobrir usuários existentes e novos usuários criados pelo login sem senha.

Assunto sugerido:

```text
Seu link de acesso ao Anti-Erros
```

Corpo HTML mínimo:

```html
<h2>Método Aprender / Anti-Erros</h2>
<p>Você solicitou acesso ao Anti-Erros.</p>
<p>Clique no botão abaixo para entrar.</p>
<p>Este link é de uso único e expira por segurança.</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email&next=/app">Entrar no Anti-Erros</a></p>
<p>Se você não solicitou este acesso, ignore este e-mail.</p>
```

Requisitos de segurança:

- usar exatamente `{{ .TokenHash }}`, nunca inserir access token, refresh token ou claim token;
- usar `type=email` para corresponder à validação fechada do endpoint;
- não usar `{{ .ConfirmationURL }}` neste fluxo, pois ele volta ao callback PKCE dependente do navegador de origem;
- não adicionar e-mail, `claim_token` ou outro identificador sensível à URL; `claim_ref` é apenas uma referência assinada e não contém a credencial de claim;
- usar `{{ .RedirectTo }}` somente com a Redirect URL canônica permitida no Supabase.

## 3. Validação após salvar

1. Solicite um link pela tela `/login`.
2. Inspecione apenas o host e o caminho do link recebido: deve abrir `/auth/confirm` no domínio canônico.
3. Confirme que a URL contém `token_hash`, `type=email`, o `next` interno e, ao continuar uma prévia, a referência opaca `claim_ref`.
4. Abra o e-mail em um navegador ou dispositivo diferente e confirme que a sessão é criada.
5. Tente reutilizar o mesmo link e confirme a mensagem genérica para link inválido.

O `token_hash` aparece temporariamente na URL recebida porque é a credencial OTP oficial do Supabase. Após a validação, o servidor redireciona para uma URL limpa e não o registra em logs da aplicação.

## 4. Rollback operacional

Se for necessário reverter antes do piloto:

1. restaure os templates anteriores no painel do Supabase;
2. reverta o commit de hardening da autenticação no aplicativo;
3. não altere banco, migrations, usuários ou sessões existentes;
4. gere um novo link para cada teste, pois links já consumidos continuam inválidos.

Não deixe template e código em versões incompatíveis: o template `token_hash` exige `/auth/confirm`, enquanto o template antigo de `ConfirmationURL` depende do callback antigo.
