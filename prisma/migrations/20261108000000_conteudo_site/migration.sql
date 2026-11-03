-- Textos da página pública, editáveis pelo admin (Admin > Textos > Página inicial). Só adiciona uma tabela.
CREATE TABLE "SiteContent" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("key")
);
