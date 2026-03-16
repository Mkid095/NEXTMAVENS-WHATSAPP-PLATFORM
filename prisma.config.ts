import { defineConfig } from "prisma";
import { resolve } from "path";

export default defineConfig({
  schema: resolve(__dirname, "prisma", "schema.prisma"),
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
