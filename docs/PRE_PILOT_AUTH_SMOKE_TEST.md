# Smoke test de autenticação antes do piloto

Execute este roteiro no domínio canônico depois de configurar o Site URL, os templates `token_hash` e o SMTP. Use dados de teste, não dados reais de participantes.

## Pré-condições

- deployment contém o hardening de autenticação;
- Supabase Site URL aponta para `https://anti-erros.metodoaprender.com`;
- templates Magic Link e Confirm signup apontam para `/auth/confirm`;
- SMTP está operacional;
- Turnstile de produção permanece ativo e fail-closed;
- Gemini não é necessário para os testes de autenticação isolados.

## A. Navegação sem sessão

1. Abra uma janela anônima na página inicial.
2. Confirme que o cabeçalho mostra **Entrar**.
3. Confirme que **Minha conta**, **Minhas análises** e **Sair** não são exibidos como ações autenticadas.
4. Acesse diretamente `/app` e `/conta`; ambos devem exigir autenticação.

## B. Magic Link em outro navegador/dispositivo

1. Em um navegador A, abra `/login` e solicite o link.
2. Confirme que o botão de reenvio fica bloqueado por 60 segundos.
3. Abra o e-mail em um navegador B ou em outro dispositivo, sem copiar storage ou cookies do navegador A.
4. Clique no link e confirme que a sessão é criada sem erro de PKCE/code verifier.
5. Confirme o redirecionamento para `/onboarding` quando o cadastro estiver incompleto, ou `/app` quando estiver completo.
6. Confirme que a URL final não contém `token_hash`, `code`, access token, refresh token ou claim token.

## C. Cabeçalho e logout

1. Com a sessão ativa, recarregue a página.
2. Confirme **Minha conta**, **Minhas análises** e **Sair**.
3. Confirme que **Entrar** não aparece simultaneamente.
4. Clique em **Sair**.
5. Recarregue e confirme que o cabeçalho voltou ao estado sem sessão.
6. Confirme que `/app` e `/conta` voltam a exigir autenticação.

## D. Link inválido, expirado ou usado

1. Abra novamente um link já consumido.
2. Teste também um link expirado controlado, quando disponível.
3. Confirme a mesma mensagem genérica: **Este link não é mais válido. Solicite um novo link de acesso.**
4. Confirme que nenhum erro interno, token ou detalhe do Supabase é mostrado.
5. Solicite um novo link e confirme que o acesso volta a funcionar.

## E. `next` e open redirect

1. Em um link de teste, substitua `next` por uma URL externa.
2. Confirme que o aplicativo ignora o destino externo e redireciona somente para `/app` ou `/onboarding`.
3. Confirme que `//dominio-externo`, `javascript:` e caminhos privados não permitidos também não são aceitos.

## F. Claim da análise pendente

1. No navegador A, conclua uma prévia anônima e avance para o login.
2. Abra o Magic Link no mesmo navegador A para testar o resgate automático.
3. Conclua o onboarding, se necessário.
4. Confirme que a análise pendente é vinculada uma única vez e o resultado completo é exibido.
5. Confirme nos logs/contadores de teste que o claim não executou nova inferência.
6. Repita o claim e confirme que ele não cria uma segunda análise.
7. Crie previews A e B em abas diferentes e confirme que o CTA de A resgata A e o CTA de B resgata B.
8. Altere um caractere de `claim_ref` em um teste controlado e confirme falha genérica sem consumir nenhum pending.

Cada preview recebe uma referência assinada e um cookie HttpOnly próprio. A referência atravessa o Magic Link, mas não é a credencial de claim; o token bruto permanece somente no cookie do navegador que criou a prévia. O claim exige que ambos correspondam ao mesmo pending. Em outro dispositivo, a autenticação funciona, mas o resgate automático não ocorre sem esse cookie.

## Resultado

Registre PASS/FAIL para: navegação anônima, sessão cross-device, URL limpa, header autenticado, logout, link usado/expirado, bloqueio de open redirect, claim one-use e ausência de reinferência.

## Matriz final do piloto

- **TESTE 1 — Magic Link no mesmo navegador:** executar B no próprio navegador A e, se houver prévia, executar F.
- **TESTE 2 — Magic Link em navegador diferente:** solicitar no navegador A e abrir em um navegador B sem compartilhar cookies/storage.
- **TESTE 3 — Magic Link em celular:** solicitar no computador e abrir pelo cliente de e-mail do celular.
- **TESTE 4 — Link expirado:** executar D com link expirado controlado.
- **TESTE 5 — Link usado duas vezes:** executar D reutilizando o mesmo link após um login bem-sucedido.
- **TESTE 6 — Logout/login:** executar C por completo e entrar novamente com um novo link.
- **TESTE 7 — Segundo usuário:** criar uma segunda conta de teste e confirmar que cada conta vê somente seu histórico.
- **TESTE 8 — Usuário B tentando abrir análise do usuário A:** copiar a URL de detalhe da conta A, sair, entrar como B e confirmar resposta de não encontrado/negado sem conteúdo da análise A.
