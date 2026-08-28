# Checklist operacional — piloto limitado

## Antes do deploy

- [ ] Aplicar migrations pendentes no projeto correto e registrar o identificador do ambiente.
- [ ] Configurar as variáveis listadas em `.env.example` no cofre do provedor.
- [ ] Confirmar que `TURNSTILE_TEST_BYPASS` está ausente ou `false`.
- [ ] Restringir o Turnstile ao domínio canônico e aos domínios de preview aprovados.
- [ ] Configurar Site URL e `/auth/callback` no Supabase Auth.
- [ ] Validar SMTP, remetente, SPF/DKIM e limites de envio.
- [ ] Conferir que nenhum segredo foi incluído no bundle cliente ou nos logs.

## Smoke test no deploy

- [ ] Visitante abre a landing em HTTPS.
- [ ] Turnstile válido permite preview; token ausente/inválido bloqueia.
- [ ] Preview não revela resultado completo nem claim token.
- [ ] Magic Link chega à caixa de teste real e cria sessão.
- [ ] Onboarding conclui e o claim recupera a análise sem nova inferência.
- [ ] Cookie de claim é HttpOnly, Secure, SameSite=Lax e removido após uso.
- [ ] Resultado usa linguagem de causa provável e mostra `recommendedAction`.
- [ ] CREATE permite copiar o card; NO_CARD mostra orientação sem card.
- [ ] Disciplina pode ser confirmada/corrigida e reaparece no histórico.
- [ ] Feedback pode ser criado e atualizado.
- [ ] Uma segunda conta não acessa análise, disciplina ou feedback da primeira.
- [ ] Eventos essenciais aparecem sem conteúdo pedagógico, PII, cookies ou tokens.
- [ ] Logs não contêm prompt interno, chain-of-thought, stack sensível ou secrets.

## Critério de abertura

Abrir o piloto apenas se todos os itens acima estiverem aprovados. Em falha de autenticação, autorização, claim, RLS ou exposição de segredo/token, voltar ao artefato anterior e manter o piloto fechado.
