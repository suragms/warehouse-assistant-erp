# 🏢 Warehouse Purchase Assistant

[![.NET](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, high-performance multi-tenant warehouse management and purchase lifecycle system designed for inventory control, automated purchasing workflows, real-time stock sync, and audit logging.

Built with **ASP.NET Core (.NET 10)** following Clean Architecture principles on the backend and **React 19 + TypeScript + Vite + Tailwind CSS** on the frontend.

---


## Current verification and ML

Phase 3 is **YELLOW — Production Candidate**, not a production-deployment certification. See [current feature audit](docs/CURRENT_FEATURE_AUDIT_2026-10-03.md), [final feature matrix](docs/FINAL_PENDING_FEATURE_MATRIX_2026-10-03.md) and [validation/readiness report](docs/FINAL_PRODUCTION_READINESS_2026-10-03.md).

The application now includes Predictions, supplier purchase/price history, owner audit history, broader notifications, authenticated password changes, provider policy controls, reviewed invoice-text extraction, owner-confirmed WhatsApp quantity PDFs, barcode labels and supported-browser camera lookup. External integrations still require configured accounts and deployment verification.

The new `ml/` projects implement offline per-item confirmed-consumption training, baseline comparison and scoped serving. No eligible real history was supplied, so no production artifact or business-accuracy claim is included. Start with [ML architecture and commands](docs/ML_ARCHITECTURE_2026-10-03.md) and [model card](docs/ML_MODEL_CARD_2026-10-03.md). `scripts/verify-ml-reproducibility.ps1` checks synthetic mechanics only; never deploy its output. Configure the server's private `ML__ArtifactPath` only after reviewing real data and accepted metrics.

Barcode labels use browser print/Save PDF; camera support is feature-detected and retains manual/USB input. The Tailwind 4 upgrade requires modern supported browsers (Safari 16.4+, Chrome 111+, Firefox 128+). One Business is one logical warehouse; branches/transfers are not implemented.

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Database & Multi-Tenancy](#-database--multi-tenancy)
- [Purchase Lifecycle & Stock Engine](#-purchase-lifecycle--stock-engine)
- [API & Documentation](#-api--documentation)
- [Testing](#-testing)
- [Contributing & License](#-contributing--license)

---

## ✨ Key Features

- **Multi-Tenant Isolation**: Strict tenant isolation across all domain entities using EF Core Global Query Filters bound to `BusinessId`.
- **Complete Purchase Lifecycle**: State-machine driven trade purchase workflows (`Draft` ➔ `Pending` ➔ `Dispatched` ➔ `Arrived` ➔ `StaffVerified` ➔ `StockCommitted`).
- **Real-Time Stock Engine**:
  - Live stock ledger updates with concurrency tokens (`RowVersion`) preventing race conditions.
  - Physical count reconciliation, system adjustments, and automated daily snapshot captures.
  - SignalR live events pushing `stock.changed` and `purchase.changed` events directly to connected clients.
- **Enterprise Security & RBAC**:
  - Stateless JWT access tokens (15-min TTL) paired with rotated HttpOnly refresh tokens.
  - Fine-grained permission-based authorization policies and handlers.
  - Security audit logging for sensitive actions.
- **Resilience & Idempotency**:
  - Idempotency middleware preventing duplicate order creation via `Idempotency-Key` headers.
  - Standardized RFC 7807 `ProblemDetails` error responses with correlation request IDs.
- **Modern Responsive UI**:
  - Responsive light-theme interface built with Tailwind CSS and Lucide icons.
  - Optimistic mutations and automated cache invalidation via TanStack Query.
  - Client UI state managed through lightweight Zustand stores.

---

## 🏗️ System Architecture

The solution adheres strictly to **Clean Architecture (Onion)** with a feature-sliced modular frontend:

```
┌─────────────────────────────────────────────────────────────┐
│                 React 19 Frontend (Vite)                    │
│   Pages ──► Features (Hooks/Components) ──► TanStack / API  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / SignalR
┌──────────────────────────────▼──────────────────────────────┐
│           ASP.NET Core Web API (PurchaseAssistant.Web)      │
│     Controllers, Auth/Permission Handlers, Middleware       │
├─────────────────────────────────────────────────────────────┤
│         Application Layer (PurchaseAssistant.Application)   │
│     DTOs, Services, FluentValidation, Business Logic        │
├─────────────────────────────────────────────────────────────┤
│       Infrastructure Layer (PurchaseAssistant.Infrastructure)│
│     EF Core, PostgreSQL, SignalR Hubs, Hosted Services      │
├─────────────────────────────────────────────────────────────┤
│            Domain Layer (PurchaseAssistant.Domain)          │
│     Entities, Enums, Constants, Domain Exceptions           │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Backend** | .NET 10, ASP.NET Core Web API, C# 13 |
| **Architecture** | Clean Architecture (Domain, Application, Infrastructure, Web, Contracts) |
| **Database & ORM** | PostgreSQL, Entity Framework Core, Npgsql |
| **Real-time** | ASP.NET Core SignalR |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, PostCSS |
| **State Management** | TanStack Query v5 (Server State), Zustand (Client UI State) |
| **Forms & Validation** | React Hook Form, Zod |
| **Testing** | xUnit, Moq, FluentAssertions, ASP.NET Core Integration Testing |
| **API Docs** | Swagger / OpenAPI |

---

## 📂 Project Structure

```
warehouse-purchase-assistant/
├── backend/
│   ├── PurchaseAssistant.Application/       # DTOs, interfaces, business logic
│   ├── PurchaseAssistant.Contracts/         # API responses & shared contracts
│   ├── PurchaseAssistant.Domain/            # Entities, Enums, Permissions
│   ├── PurchaseAssistant.Infrastructure/    # EF Core, PostgreSQL DbContext, Auth providers
│   ├── PurchaseAssistant.IntegrationTests/  # Integration test suite
│   ├── PurchaseAssistant.UnitTests/         # Unit tests (xUnit, Moq)
│   ├── PurchaseAssistant.Web/               # API Controllers, Middleware, Program.cs
│   └── PurchaseAssistant.slnx               # Visual Studio / dotnet solution file
├── frontend/
│   ├── public/                              # Static icons and assets
│   ├── src/
│   │   ├── api/                             # Axios client & interceptors
│   │   ├── auth/                            # Auth provider, guards & context
│   │   ├── pages/                           # Application route pages
│   │   ├── router/                          # React router configuration
│   │   ├── stores/                          # Zustand state stores
│   │   ├── theme/                           # Styling & Tailwind globals
│   │   └── types/                           # TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
├── docs/                                    # Detailed technical specifications
│   ├── API_SPECIFICATION.md                 # REST API endpoints & contracts
│   ├── COMPLETE_ARCHITECTURE.md             # Full architectural breakdown
│   ├── DATABASE_DESIGN.md                   # PostgreSQL schemas & ER design
│   ├── FRONTEND_ROUTE_MAP.md                # Client route layout & navigation
│   ├── IMPLEMENTATION_PLAN.md               # Phased roadmap & milestones
│   ├── PERMISSION_MATRIX.md                 # Role-based permission matrix
│   ├── PURCHASE_LIFECYCLE.md                # Purchase order state transitions
│   ├── REPORTING_SPECIFICATION.md           # Snapshot & reporting engine specs
│   └── STOCK_ENGINE.md                      # Concurrency & stock calculation rules
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js (v20+)](https://nodejs.org/) & `npm`
- [PostgreSQL (v15+)](https://www.postgresql.org/)

---

### Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Configure Database Connection** outside the repository with .NET User Secrets:
   ```bash
   dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Database=WarehouseERP_Dev;Username=postgres;Password=YOUR_LOCAL_PASSWORD" --project PurchaseAssistant.Web
   ```
   In deployed environments, provide `ConnectionStrings__DefaultConnection` through the secret manager. Database credentials are not stored in appsettings files.

3. **Restore & Build**:
   ```bash
   dotnet restore
   dotnet build
   ```

4. **Run Database Migrations** (if using EF Core CLI):
   ```bash
   dotnet ef database update --project PurchaseAssistant.Infrastructure --startup-project PurchaseAssistant.Web
   ```

5. **Start the API Server**:
   ```bash
   dotnet run --project PurchaseAssistant.Web
   ```
   The API will be available at `http://localhost:5000` (Swagger UI at `/swagger`).

---

### Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   The application will launch on `http://localhost:5173`.

---

## 🗄️ Database & Multi-Tenancy

Every tenant entity contains a `BusinessId`. EF Core applies automatic query filtering:

```csharp
modelBuilder.Entity<CatalogItem>()
    .HasQueryFilter(e => e.BusinessId == _currentTenantProvider.GetBusinessId());
```

This guarantees data isolation across businesses without relying on error-prone manual `WHERE` clauses.

---

## 🔄 Purchase Lifecycle & Stock Engine

```
[Draft] ──► [Pending] ──► [Dispatched] ──► [Arrived] ──► [StaffVerified] ──► [StockCommitted]
                                                                                  │
                                                                       ┌──────────▼──────────┐
                                                                       │ Stock Balance Added │
                                                                       │ Audit Log Created   │
                                                                       │ SignalR Notified    │
                                                                       └─────────────────────┘
```

- **Stock Commit**: When a purchase reaches `StockCommitted`, incoming quantities are atomized into warehouse current stock and an immutable `StockAuditLog` entry is generated.
- **Optimistic Concurrency**: Both Catalog Items and Purchases enforce `RowVersion` checks to prevent overwrites in high-frequency warehouse environments.

---

## 📚 API & Documentation

Comprehensive specifications and design documents are available in the [`docs/`](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs) directory:

- [API Specification](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/API_SPECIFICATION.md)
- [Complete Architecture](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/COMPLETE_ARCHITECTURE.md)
- [Database Design](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/DATABASE_DESIGN.md)
- [Stock Engine Specification](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/STOCK_ENGINE.md)
- [Purchase Order Lifecycle](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/PURCHASE_LIFECYCLE.md)
- [Permission Matrix](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/PERMISSION_MATRIX.md)
- [Frontend Route Map](file:///c:/Users/SURAG/Documents/my-project/warehouse-purchase-assistant/docs/FRONTEND_ROUTE_MAP.md)

---

## 🧪 Testing

Execute backend unit and integration test suites:

```bash
# Run all unit tests
dotnet test backend/PurchaseAssistant.UnitTests/PurchaseAssistant.UnitTests.csproj

# PostgreSQL tests run only against a dedicated database whose name begins with `wa_test_`.
# Set PURCHASE_ASSISTANT_TEST_DATABASE to that database's connection string; DB-backed tests skip otherwise.
dotnet test backend/PurchaseAssistant.IntegrationTests/PurchaseAssistant.IntegrationTests.csproj
```

Run frontend linting:
```bash
cd frontend
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
