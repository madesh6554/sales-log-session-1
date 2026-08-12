# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

These are standing instructions. They apply to every change in this project.

1. **Plan first, wait for a yes.** Always show the plan and get explicit approval before building. Never start implementing off an implied go-ahead.
2. **Port 3100, never 3000.** The app runs on 3100. If 3100 is busy, pick the next free port and say which one. (Port 3000 is occupied on this machine by VS Code.)
3. **Always give the `http://localhost` URL.** After every change, state the exact URL to open. Never tell the user to open an HTML file from the folder — they always use the running server.
4. **Never stop or kill a process you did not start.** Only ever stop this app's own server, by its specific PID. No blanket kills (`taskkill /IM node.exe`, `pkill node`, or equivalent) — they take down unrelated processes.
5. **Dates default to today in the user's local timezone.** Never derive a default date from `toISOString()`, which is UTC and lands on the wrong day.
6. **Say how to verify.** After each feature, give one line on how to check it worked.

## Project: ForgeLite

A minimal sales log. Node.js + Express backend, plain HTML/CSS/JS frontend.
No React, no framework, no TypeScript, no build step — files are served as written.

```
server.js          static host, POST /api/sales, schema bootstrap, server-side validation
schema.sql         sales table DDL (server.js applies the same DDL on boot)
public/            index.html, styles.css, app.js — served as static files
.env               DATABASE_URL (gitignored, never printed in output)
.env.example       committable template
```

### Commands

```
npm install        install dependencies
npm start          run the server
node --check FILE  syntax check without executing
```

### Conventions

- Postgres is reached only through `DATABASE_URL` from `.env`, loaded via `dotenv`. Never hardcode a connection string; never print one in any output, log, or commit message.
- All SQL is parameterized (`$1`, `$2`, …). No string interpolation into queries.
- Money is `numeric`, never `float`.
- Validation is duplicated on purpose: `validate()` in `server.js` mirrors `validate()` in `public/app.js`. The client version drives the under-field messages; the server version is the real trust boundary, since anything can POST to the API. **Change both together.**
- The server applies `create table if not exists` on boot. This is a silent no-op against an existing table with a different shape — it never alters or drops.

### Database

Supabase Postgres 17, shared pooler (`aws-0-ap-south-1`), reached through the session pooler on 5432.

`DATABASE_URL` carries `?uselibpqcompat=true&sslmode=require`. Without it the connection fails with
`SELF_SIGNED_CERT_IN_CHAIN`: this `pg` version promotes plain `sslmode=require` to full certificate
verification, and the pooler's chain is not in Node's default CA bundle. Traffic is encrypted; the
server certificate is not verified. Any special character in the password must be percent-encoded
(`@` → `%40`, `#` → `%23`, `$` → `%24`, `&` → `%26`).

Required fields agree across three layers — database `not null`, `validate()` in `server.js`, and
`validate()` in `public/app.js`. `customer_name`, `item` and `amount` are required in all three.
Changing one means changing all three.
