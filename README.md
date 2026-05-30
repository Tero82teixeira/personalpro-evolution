# PersonalPro Evolution

Sistema web responsivo e PWA para personal trainers e alunos, criado com React, TypeScript, Vite e Tailwind CSS.

## Como rodar

```bash
npm install
npm run dev
```

Acesse `http://127.0.0.1:5173/`.

Para gerar a versão de produção:

```bash
npm run build
```

## Configurar Supabase

Copie o arquivo `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Enquanto essas variáveis estiverem vazias, o sistema usa `localStorage` como fallback. Os services já estão separados em `src/services` para alunos, avaliações, anamnese, treinos, check-ins, financeiro, mensagens e marketing.

Use sempre a URL base do Supabase, sem `/rest/v1/`, e apenas a publishable/anon key. Nunca coloque service role ou secret key no frontend.

## Rodar o schema SQL

1. Abra o painel do Supabase.
2. Vá em SQL Editor.
3. Cole o conteúdo de `database/schema.sql`.
4. Execute o script.
5. Confirme que as tabelas e políticas RLS foram criadas.

O schema cria/revisa:

- `profiles`
- `students`
- `assessments`
- `anamnesis`
- `workouts`
- `workout_exercises`
- `workout_logs`
- `checkins`
- `financial_records`
- `message_templates`
- `marketing_ideas`
- `progress_photos`

As políticas RLS permitem que o personal/admin veja e gerencie todos os alunos, enquanto alunos acessam apenas os próprios dados. Alunos não editam treinos criados pelo personal, mas podem editar perfil, check-ins, logs e progresso próprios.

## Configurar Auth

No Supabase, abra `Authentication > Providers` e mantenha o provider `Email` ativo. Para testes locais rápidos, você pode desativar temporariamente a confirmação de e-mail em `Authentication > Sign In / Providers > Email`, ou manter ativa e confirmar pelo link enviado.

Depois crie usuários pelo cadastro do app. O sistema grava o perfil em `profiles` e, para alunos, cria o registro inicial em `students`.

## Configurar Storage

O schema cria os buckets:

- `avatars`
- `progress-photos`

No painel do Supabase, confirme em `Storage` que os buckets existem. Os uploads usam caminhos por usuário e as policies permitem leitura/escrita conforme RLS.

## Testar login real

1. Preencha `.env`.
2. Rode `npm run dev`.
3. Crie uma conta de personal pelo cadastro.
4. Crie uma conta de aluno pelo cadastro.
5. Faça logout e entre com cada usuário.
6. Se a confirmação de e-mail estiver ativa, confirme o e-mail antes do primeiro login.

## Teste manual com usuários criados no Supabase

Quando o Supabase bloquear novos cadastros por limite de e-mail, use este fluxo manual:

1. Abra `Supabase > Authentication > Users`.
2. Crie um usuário manualmente com e-mail e senha.
3. Copie o `User UID` criado.
4. Abra `Table Editor > profiles`.
5. Crie um registro com:
   - `id`: o mesmo `User UID` do Auth
   - `full_name`: nome do usuário
   - `role`: `admin` para personal ou `student` para aluno
6. Para aluno, crie ou edite um registro em `students` com:
   - `profile_id`: o mesmo `User UID`
   - `email`: o mesmo e-mail do Auth
   - `full_name`: nome do aluno
7. Entre no app com o e-mail e senha criados manualmente.

Se o usuário existir no Auth, mas não existir em `profiles`, o sistema mostrará:

```text
Perfil não encontrado. Verifique se este usuário possui registro na tabela profiles.
```

Se aparecer limite de e-mail, o sistema mostrará:

```text
Limite temporário do Supabase atingido. Aguarde alguns minutos ou crie o usuário manualmente no painel do Supabase.
```

## Como criar e vincular um aluno real

1. Entre no sistema como personal/admin.
2. Abra `Gestão de alunos`.
3. Cadastre o aluno no painel do personal, preenchendo também `E-mail de acesso do aluno`.
4. No Supabase, abra `Authentication > Users` e crie o usuário aluno com o mesmo e-mail de acesso.
5. Confirme o e-mail do aluno, se a confirmação estiver ativa no projeto.
6. Volte ao sistema.
7. Na área `Vincular login do aluno`, busque o aluno pelo e-mail cadastrado.
8. Busque o profile pelo e-mail de acesso ou selecione um profile com `role student`.
9. Clique em `Vincular login do aluno`.
10. Use `Gerar instruções de acesso` para copiar a mensagem pronta e enviar ao aluno pelo WhatsApp.
11. Faça logout e teste o login do aluno.

O aluno só verá dados ligados ao próprio `students.profile_id`. Treinos, avaliações e check-ins continuam protegidos pelas políticas RLS do Supabase.

## Ativar PWA

O projeto já inclui:

- `public/manifest.webmanifest`
- `public/sw.js`
- ícones em `public/icons`
- registro do service worker em `src/main.tsx`

Em produção, publique o app em HTTPS. No Android e iPhone, abra pelo navegador e use a opção de adicionar à tela inicial.

## Publicação na Vercel

O projeto está pronto para produção com Vite.

Configurações na Vercel:

- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

No painel da Vercel, cadastre as variáveis em `Settings > Environment Variables`. Use a URL base do Supabase, sem `/rest/v1/`, e a publishable/anon key.

O arquivo `.env` local não deve ser enviado ao repositório. Use `.env.example` apenas como modelo, sem valores reais.

O projeto inclui `vercel.json` com fallback para `/index.html`, evitando erro 404 ao atualizar páginas ou acessar rotas internas diretamente.
