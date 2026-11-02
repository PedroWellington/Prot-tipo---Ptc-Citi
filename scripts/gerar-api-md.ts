// Gera API.md a partir da tabela de rotas: npm run docs:api
import { writeFileSync } from "node:fs";
import { routes } from "../src/server/api/router";
import "../src/server/api/routes";

const roles = (r: (typeof routes)[number]["options"]["roles"]) => (r === "public" ? "público" : r ? r.join(", ") : "autenticado");

const rows = routes.map((r) =>
  `| ${r.method} | \`/api${r.path}\` | ${roles(r.options.roles)} | ${r.options.summary}${r.options.rate ? ` (limite ${r.options.rate.limit}/${r.options.rate.windowSec}s)` : ""} |`);

writeFileSync("API.md", `# API da Clínica Movimento

Gerado por \`npm run docs:api\` a partir de \`src/server/api/routes.ts\`, onde cada rota declara perfis, schema Zod e limite de requisições.

- Autenticação: cookie httpOnly \`mv_session\` (JWT HS256), obtido em \`POST /api/auth/login\`.
- Escritas aceitam só a própria origem (cabeçalho \`Origin\`).
- Erros: \`{ "error": { "code", "message", "fields?" } }\`, com 401, 403, 404, 409, 422, 423 ou 429.
- Paginação: \`take\` (máx. 100) e \`skip\`, com \`q\` para busca onde indicado.

| Método | Rota | Perfis | Descrição |
|---|---|---|---|
${rows.join("\n")}
`);
