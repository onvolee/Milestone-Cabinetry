# Milestone Cabinetry Coding Notes

Use this as the first-pass project guidance when making code changes in this repository.

## Project Structure

- `portal/` is the customer storefront built with Next.js App Router. Application source lives in `portal/src/`.
- `admin/` is the internal dashboard built with Vite, React, and React Router.
- `server/` is the Express 5 and TypeScript API service.
- The three applications share one Git repository but have independent Yarn dependencies and lockfiles. Run commands from the application being changed.

## General

- Prefer existing project patterns over introducing new abstractions.
- Keep page and route files focused on orchestration. Move reusable UI into components, reusable client business logic into hooks, and reusable helpers into `utils` or `lib`.
- Do not run full `build` or `lint` checks unless the user asks for them, the change is broad or risky, or they are necessary to verify the specific work.
- Before adding a dependency, check whether a lightweight local pattern already solves the need. Add dependencies only when they provide a clear, maintained capability.
- Keep credentials and environment-specific values out of the repository. Commit only documented `.env*.example` files.

## Frontend UI And Theme

- Use MUI components where appropriate instead of hand-building common controls, menus, dialogs, form fields, icons, loading states, or data displays.
- Establish reusable theme tokens before repeating typography, color, spacing, or component styling. Do not copy Oasis-specific palette names or hex values into this project.
- Use typography variants for reusable text styles. Use component `sx` only for contextual layout, spacing, and intentional visual overrides.
- Create custom SVG icons only when MUI icons do not fit the product need; place shared custom icons in a shared icon module.

## Portal (Next.js)

- Keep application code under `portal/src/`; keep Next.js configuration, environment files, and `public/` at the project root.
- Use App Router conventions and the existing `@/*` import alias.
- Use the MUI Next.js App Router integration and a single shared theme provider.
- Prefer server-side data fetching and Next.js caching where appropriate. Keep client-side fetching scoped to interactive state.
- Use `next/image` for local and remote product imagery where applicable. Treat above-the-fold images as LCP candidates and configure their loading intentionally.

## Admin (Vite)

- Use React Router for application routing and MUI for the shared dashboard UI.
- Vite exposes only `VITE_*` environment variables to browser code. Read them through `import.meta.env`, never `process.env`.
- Keep API request helpers centralized. Avoid duplicating request configuration across pages and components.
- Use `@mui/x-data-grid` when it fits an operational table instead of building a table implementation from scratch.

## Server (Express)

- Keep the Express flow layered: `routes` define endpoints, controllers translate HTTP input and output, services own business actions, and integrations own third-party API clients.
- Put environment parsing and database configuration in `src/config`; do not access `process.env` throughout business code.
- Validate request input at route boundaries and return errors through the shared error middleware.
- Use Sequelize migrations for schema changes. Do not change production schema through model synchronization or manual database edits.
- Put scheduled work in `src/tasks` and make it safe to retry. Add queue infrastructure only when an asynchronous workload needs reliable background processing.

## Product Requirements

- Do not assume Oasis product behavior, palette tokens, pagination limits, or checkout rules apply to Milestone Cabinetry. Confirm product-specific requirements before encoding them.
- Keep add-to-cart and other interactive controls outside navigation links.

## Assets

- Prefer JPEG for large opaque product and homepage images; use PNG, WebP, or SVG when transparency or format-specific quality requires it.
- Keep original large assets only when there is a clear source, editing, or quality reason.
