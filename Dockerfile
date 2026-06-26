# ──────────────────────────────────────────────────────────────────────────
# MindGuide — multi-stage production image
# Next.js 16 standalone output + Prisma + SQLite + Bun runtime
# ──────────────────────────────────────────────────────────────────────────

# ── Stage 1: deps ──────────────────────────────────────────────────────────
FROM oven/bun:1.1 AS deps
WORKDIR /app

# Copy lockfile + manifest first for layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2: build ─────────────────────────────────────────────────────────
FROM oven/bun:1.1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma client must be generated before the Next.js build can type-check
# any file that imports from `@/lib/db`.
RUN bunx prisma generate

# Next.js 16 standalone build. `next.config.ts` has `output: 'standalone'`
# which emits a self-contained `.next/standalone/` tree.
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── Stage 3: runner ────────────────────────────────────────────────────────
FROM oven/bun:1.1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for defence-in-depth.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy the standalone server + static assets + public.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + migrations (needed at runtime for `prisma db push` on
# first boot if DATABASE_URL points at a fresh SQLite file).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Persistent volume for the SQLite database so data survives container restarts.
RUN mkdir -p /app/db && chown -R nextjs:nodejs /app/db
VOLUME ["/app/db"]

USER nextjs
EXPOSE 3000

# Initialize the DB schema (idempotent) then start the standalone server.
CMD ["sh", "-c", "bunx prisma db push --skip-generate && node server.js"]
